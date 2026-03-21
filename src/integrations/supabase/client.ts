// Ensure .env / Vercel has VITE_SUPABASE_* or NEXT_PUBLIC_SUPABASE_* (URL + anon key).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getSupabaseAnonKey, getSupabaseUrl } from './publicEnv';

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = getSupabaseAnonKey();

type SupabaseClientType = ReturnType<typeof createClient<Database>>;

const createMissingSupabaseClient = (message: string): SupabaseClientType => {
  // Prevents app from crashing at import-time when env vars are missing.
  const missingError = new Error(message);
  return new Proxy(
    {},
    {
      get() {
        return () => {
          throw missingError;
        };
      },
    }
  ) as unknown as SupabaseClientType;
};

// Log current Supabase env configuration (without exposing full key)
if (typeof window !== 'undefined') {
  const anonPreview =
    SUPABASE_ANON_KEY && typeof SUPABASE_ANON_KEY === 'string'
      ? `${SUPABASE_ANON_KEY.slice(0, 8)}...${SUPABASE_ANON_KEY.slice(-4)}`
      : null;

  // eslint-disable-next-line no-console
  const urlFrom = [
    import.meta.env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
  ]
    .filter(Boolean)
    .join('+');
  const keyFrom = [
    import.meta.env.VITE_SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]
    .filter(Boolean)
    .join('+');

  console.log('[Supabase] Using configuration', {
    url: SUPABASE_URL || '(missing)',
    urlEnvHint: urlFrom || 'none',
    keyEnvHint: keyFrom || 'none',
    anonKeyPreview: anonPreview,
    anonKeyLength: SUPABASE_ANON_KEY ? String(SUPABASE_ANON_KEY).length : 0,
  });
}

const shouldInitSupabase = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);

export const supabase: SupabaseClientType = shouldInitSupabase
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: typeof window !== 'undefined' ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: {
          // Belt-and-suspenders: PostgREST returns "No API key found" if this is missing.
          apikey: SUPABASE_ANON_KEY,
        },
      },
    })
  : createMissingSupabaseClient(
      'Supabase client not initialized: set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel).'
    );
