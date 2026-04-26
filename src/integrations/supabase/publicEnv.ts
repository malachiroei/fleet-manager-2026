/**
 * Supabase — משתני סביבה דרך `import.meta.env` (Vite).
 * בלקוח: רק `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY` (וב־pro.com — זוגות ה־`VITE_FLEET_PRODUCTION_*` המתאימים). אין `service_role` בפרונט; האבטחה ב־RLS.
 *
 * ב־`fleet-manager-pro.com` — URL ייצור מ־`VITE_FLEET_PRODUCTION_SUPABASE_URL` (או fallback ל־`VITE_SUPABASE_URL`); anon נבחר כך שיתאים ל־ref של ה־URL.
 *
 * בחירת anon: חייב להתאים ל-ref ב-URL — אחרת נשאר מפתח מפרויקט לא נכון וההתחברות תחזיר «Invalid API key» (401).
 *
 * אימות ref: `evaluateSupabaseEnvironmentGuard` ב־`@/lib/supabase/envGuard`.
 */

import { isFleetManagerProDotComHostname } from '@/lib/supabase/fleetSupabaseProductionDefaults';

function trimEnv(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** ללא ייבוא מ-envGuard (מניעת מעגל תלות). */
function projectRefFromSupabaseUrl(urlRaw: string): string | null {
  const t = String(urlRaw ?? '').trim();
  if (!t) return null;
  try {
    const host = new URL(t).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** ה-claim `ref` ב-JWT של מפתח ה-anon — חייב להיות אותו ref כמו ב-host של Supabase. */
function projectRefFromSupabaseAnonJwt(jwt: string): string | null {
  const t = trimEnv(jwt);
  const parts = t.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    const padded = b64 + '='.repeat(pad);
    const json = JSON.parse(atob(padded)) as { ref?: string };
    return typeof json.ref === 'string' ? json.ref.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * בוחר מפתח anon שמתאים ל-URL (לפי ref ב-JWT).
 * אם אין התאמה — מחזיר ריק (עדיף מסך הגדרות מאשר 401 «Invalid API key» בשקט).
 */
function pickAnonKeyForSupabaseUrl(
  supabaseUrl: string,
  orderedPairs: ReadonlyArray<readonly [string, unknown]>,
): { value: string; source: string | null } {
  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);

  for (const [source, v] of orderedPairs) {
    const value = trimEnv(v);
    if (!value) continue;
    if (!urlRef) {
      return { value, source };
    }
    const keyRef = projectRefFromSupabaseAnonJwt(value);
    if (keyRef === urlRef) {
      return { value, source };
    }
  }

  if (urlRef && typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn(
      '[Supabase publicEnv] No anon key matches SUPABASE_URL project ref. Set VITE_SUPABASE_ANON_KEY / VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY (Vercel or .env) to the anon key for the same project as the URL.',
      { urlRef },
    );
  }

  return { value: '', source: null };
}

function firstNonEmpty(pairs: ReadonlyArray<readonly [string, unknown]>): {
  value: string;
  source: string | null;
} {
  for (const [source, v] of pairs) {
    const t = trimEnv(v);
    if (t) return { value: t, source };
  }
  return { value: '', source: null };
}

export type ResolvedSupabaseViteEnv = {
  url: string;
  anonKey: string;
  urlEnvSource: string | null;
  anonKeyEnvSource: string | null;
};

const URL_ENV_PAIRS = [['VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL]] as const;

const ANON_KEY_ENV_PAIRS = [['VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY]] as const;

const PRODUCTION_URL_ENV_PAIRS = [
  ['VITE_FLEET_PRODUCTION_SUPABASE_URL', import.meta.env.VITE_FLEET_PRODUCTION_SUPABASE_URL],
] as const;

/** מפתח anon ייעודי לייצור (אופציונלי) — לפני `VITE_SUPABASE_ANON_KEY` כשמשתמשים ב-URL הייצור */
const PRODUCTION_ANON_KEY_ENV_PAIRS = [
  ['VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY', import.meta.env.VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY],
] as const;

function computeResolvedSupabaseViteEnv(): ResolvedSupabaseViteEnv {
  if (isFleetManagerProDotComHostname()) {
    const prodUrlRes = firstNonEmpty(PRODUCTION_URL_ENV_PAIRS);
    const urlRes = prodUrlRes.value ? prodUrlRes : firstNonEmpty(URL_ENV_PAIRS);
    const keyRes = pickAnonKeyForSupabaseUrl(urlRes.value, [
      ...PRODUCTION_ANON_KEY_ENV_PAIRS,
      ...ANON_KEY_ENV_PAIRS,
    ]);
    return {
      url: urlRes.value,
      anonKey: keyRes.value,
      urlEnvSource: urlRes.source,
      anonKeyEnvSource: keyRes.source,
    };
  }

  const urlRes = firstNonEmpty(URL_ENV_PAIRS);
  const keyRes = pickAnonKeyForSupabaseUrl(urlRes.value, [...ANON_KEY_ENV_PAIRS]);
  return {
    url: urlRes.value,
    anonKey: keyRes.value,
    urlEnvSource: urlRes.source,
    anonKeyEnvSource: keyRes.source,
  };
}

let resolvedMemo: ResolvedSupabaseViteEnv | null = null;

export function resolveSupabaseViteEnv(): ResolvedSupabaseViteEnv {
  if (resolvedMemo === null) {
    resolvedMemo = computeResolvedSupabaseViteEnv();
  }
  return resolvedMemo;
}

export function getSupabaseUrl(): string {
  return resolveSupabaseViteEnv().url;
}

export function getSupabaseAnonKey(): string {
  return resolveSupabaseViteEnv().anonKey;
}

/** מפתח publishable חלופי (אם בשימוש) — רק VITE (אותו סוג גלוי כמו anon; אבטחה ב־RLS). */
export function getSupabasePublishableKey(): string {
  return trimEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
}
