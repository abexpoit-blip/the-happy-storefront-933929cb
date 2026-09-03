/**
 * Self-hosted guard.
 *
 * Production (zoru.cc) MUST talk to the self-hosted backend only.
 * If a stale/overwritten .env ever points the app at *.supabase.co,
 * we fail loudly instead of silently using the cloud project.
 *
 * The Lovable preview (lovable.app / lovableproject.com / localhost) is
 * allowed to use the managed backend so the editor keeps working.
 */

const CLOUD_HOST_RE = /(^|\.)supabase\.co$/i;

const PREVIEW_HOSTS = [
  "localhost",
  "127.0.0.1",
  ".lovable.app",
  ".lovableproject.com",
  ".lovable.dev",
];

export const isPreviewHost = (host: string): boolean =>
  PREVIEW_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));

export const isCloudSupabaseUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    return CLOUD_HOST_RE.test(new URL(url).hostname);
  } catch {
    return CLOUD_HOST_RE.test(url);
  }
};

let installed = false;

/** Blocks every request to *.supabase.co when running outside the preview. */
export function enforceSelfHostedBackend(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const pageHost = window.location.hostname.toLowerCase();
  if (isPreviewHost(pageHost)) return; // editor preview: managed backend is fine

  const configured = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (isCloudSupabaseUrl(configured)) {
    console.error(
      "[self-host guard] VITE_SUPABASE_URL points at supabase.co — self-hosted backend expected. " +
        "Run selfhost/fix-env.sh on the VPS and rebuild.",
    );
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let target = "";
    if (typeof input === "string") target = input;
    else if (input instanceof URL) target = input.href;
    else if (typeof Request !== "undefined" && input instanceof Request) target = input.url;

    if (target && isCloudSupabaseUrl(target)) {
      console.error(`[self-host guard] blocked cloud backend request: ${target}`);
      return Promise.reject(new Error("Blocked: cloud Supabase is disabled on this deployment"));
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}
