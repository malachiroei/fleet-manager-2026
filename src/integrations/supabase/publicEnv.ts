/**
 * Browser Supabase configuration.
 * Support both Vite defaults (VITE_*) and names common on Vercel / Next-style (NEXT_PUBLIC_*).
 * vite.config.ts sets `envPrefix: ['VITE_', 'NEXT_PUBLIC_']` so both are available on import.meta.env.
 */

function firstNonEmpty(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = typeof c === 'string' ? c.trim() : '';
    if (t) return t;
  }
  return '';
}

/** Project URL (https://xxx.supabase.co) */
export function getSupabaseUrl(): string {
  return firstNonEmpty(
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined
  );
}

/** Anonymous / publishable key — required for PostgREST `apikey` header */
export function getSupabaseAnonKey(): string {
  return firstNonEmpty(
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined
  );
}

/** Optional alternate name some dashboards use */
export function getSupabasePublishableKey(): string {
  return firstNonEmpty(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined
  );
}
