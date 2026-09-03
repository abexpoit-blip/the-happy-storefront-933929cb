/**
 * Server-side env normalisation.
 *
 * Self-hosted deployments (VPS + PM2) usually only export the VITE_* variables
 * used at build time. The generated Supabase server helpers read the non-prefixed
 * names, so mirror them here before anything else boots. Imported for its side
 * effect from src/server.ts.
 */
function mirror(target: string, sources: string[]) {
  if (process.env[target]) return;
  for (const s of sources) {
    const v = process.env[s];
    if (v) {
      process.env[target] = v;
      return;
    }
  }
}

if (typeof process !== "undefined" && process.env) {
  mirror("SUPABASE_URL", ["VITE_SUPABASE_URL"]);
  mirror("SUPABASE_PUBLISHABLE_KEY", ["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"]);
}

export {};
