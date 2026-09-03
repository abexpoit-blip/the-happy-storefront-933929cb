import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

/** Data endpoints must never answer with an HTML error page — the client parses JSON. */
function wantsJson(request?: Request): boolean {
  if (!request) return false;
  try {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/") || pathname.includes("/_serverFn/")) return true;
  } catch { /* ignore */ }
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (wantsJson(request as Request | undefined)) {
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});


export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
