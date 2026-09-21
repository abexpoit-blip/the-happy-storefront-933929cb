import "./lib/env.server";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const SCRAPER_UA_PATTERNS = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /httpx/i,
  /scrapy/i,
  /go-http-client/i,
  /java\//i,
  /apache-httpclient/i,
  /postmanruntime/i,
  /headlesschrome/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /phantomjs/i,
  /nightwatch/i,
  /casperjs/i,
  /zgrab/i,
  /shodan/i,
  /censys/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /megaindex/i,
  /petalbot/i,
  /bytespider/i,
  /screaming frog/i,
];

function isScraperRequest(request: Request, pathname: string): boolean {
  // Whitelist legitimate server callbacks and bots
  if (
    pathname.startsWith("/api/public/deposit-callback") ||
    pathname.startsWith("/api/public/bot") ||
    pathname.startsWith("/api/public/checker")
  ) {
    return false;
  }

  const ua = request.headers.get("user-agent") || "";
  // Empty user-agent is characteristic of automated raw scrapers
  if (!ua.trim()) {
    return true;
  }

  return SCRAPER_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

function applySecurityHeaders(res: Response): Response {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return res;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Strict robots.txt to prevent any crawler indexing or archiving
    if (pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    // 2. Block direct probing of sourcemaps, raw typescript files, or git/env
    if (
      pathname.endsWith(".map") ||
      pathname.endsWith(".ts") ||
      pathname.endsWith(".tsx") ||
      pathname.includes("/.git") ||
      pathname.includes("/.env")
    ) {
      return new Response("Not Found", { status: 404 });
    }

    // 3. Block known automated scraping tools and bot user-agents
    if (isScraperRequest(request, pathname)) {
      return new Response(
        JSON.stringify({ error: "Access Denied: automated scraping is strictly prohibited." }),
        {
          status: 403,
          headers: {
            "content-type": "application/json",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }
      );
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return applySecurityHeaders(normalized);
    } catch (error) {
      console.error(error);
      const errRes = new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      return applySecurityHeaders(errRes);
    }
  },
};
