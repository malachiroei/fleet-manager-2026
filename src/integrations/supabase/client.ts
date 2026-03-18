// Ensure .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the
// project where your auth users and profiles table live (not an old sub-project).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
  console.log('[Supabase] Using configuration', {
    url: SUPABASE_URL,
    anonKeyPreview: anonPreview,
    anonKeyLength: SUPABASE_ANON_KEY ? String(SUPABASE_ANON_KEY).length : 0,
  });
}

const shouldInitSupabase = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);

export const supabase: SupabaseClientType = shouldInitSupabase
  ? createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        storage: typeof window !== 'undefined' ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createMissingSupabaseClient(
      'Supabase client not initialized: missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY in environment.'
    );