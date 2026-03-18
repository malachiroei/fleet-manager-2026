// Ensure .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the
// project where your auth users and profiles table live (not an old sub-project).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});