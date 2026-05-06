import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * GoTrue / storage משתמשים ב-Web Locks; ב-React Strict Mode ובמקביל של PostgREST
 * מופיע לעיתים AbortError «Lock broken by another request with the 'steal' option».
 */
export function isTransientAuthStorageOrAbortError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const msg = String((err as { message: string }).message);
    if (/abort|lock broken|steal|navigator\.locks/i.test(msg)) return true;
    const name = 'name' in err && typeof (err as { name: unknown }).name === 'string' ? (err as { name: string }).name : '';
    if (name === 'AbortError') return true;
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if (/abort|lock broken|steal/i.test(err.message)) return true;
  }
  return false;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withAuthLockRetries<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientAuthStorageOrAbortError(e) || i === attempts - 1) throw e;
      await sleep(45 * (i + 1) * (i + 1));
    }
  }
  throw last;
}

/** getSession מתחת למנגנון Locks — הרצה בסדר ובניסיונות חוזרים מפחיתה התנגשות עם טעינת פרופיל מקבילה. */
export async function stableAuthGetSession(client: SupabaseClient) {
  return withAuthLockRetries(() => client.auth.getSession(), 5);
}

/** getUser — לאותן סיבות כמו getSession */
export async function stableAuthGetUser(client: SupabaseClient) {
  return withAuthLockRetries(() => client.auth.getUser(), 5);
}
