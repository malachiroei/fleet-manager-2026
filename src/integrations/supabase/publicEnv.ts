/**
 * Supabase — משתני סביבה דרך `import.meta.env` (Vite).
 * תומך בשני מוסכמות שמות: `NEXT_PUBLIC_*` ו־`VITE_*`.
 *
 * v2.7.66: ב־`fleet-manager-pro.com` — URL קשיח לפרויקט הייצור; מפתח anon מ־Vercel (או fallback לזוגות הסטנדרטיים).
 *
 * אימות ref: `evaluateSupabaseEnvironmentGuard` ב־`@/lib/supabase/envGuard`.
 */

import {
  FLEET_PRODUCTION_SUPABASE_URL,
  isFleetManagerProDotComHostname,
} from '@/lib/supabase/fleetSupabaseProductionDefaults';

function trimEnv(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
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

const URL_ENV_PAIRS = [
  ['NEXT_PUBLIC_SUPABASE_URL', import.meta.env.NEXT_PUBLIC_SUPABASE_URL],
  ['VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL],
] as const;

const ANON_KEY_ENV_PAIRS = [
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ['VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY],
] as const;

/** מפתח anon ייעודי לייצור (אופציונלי) — לפני הזוגות הכלליים כשמשתמשים ב-URL הייצור הקשיח */
const PRODUCTION_ANON_KEY_ENV_PAIRS = [
  ['NEXT_PUBLIC_FLEET_PRODUCTION_SUPABASE_ANON_KEY', import.meta.env.NEXT_PUBLIC_FLEET_PRODUCTION_SUPABASE_ANON_KEY],
  ['VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY', import.meta.env.VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY],
] as const;

function computeResolvedSupabaseViteEnv(): ResolvedSupabaseViteEnv {
  if (isFleetManagerProDotComHostname()) {
    const keyRes = firstNonEmpty([...PRODUCTION_ANON_KEY_ENV_PAIRS, ...ANON_KEY_ENV_PAIRS]);
    return {
      url: FLEET_PRODUCTION_SUPABASE_URL,
      anonKey: keyRes.value,
      urlEnvSource: 'hardcoded production (fleet-manager-pro.com → cesstoohvlbvyreznwqd)',
      anonKeyEnvSource: keyRes.source,
    };
  }

  const urlRes = firstNonEmpty(URL_ENV_PAIRS);
  const keyRes = firstNonEmpty(ANON_KEY_ENV_PAIRS);
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

/** מפתח חלופי (אם בשימוש) — רק NEXT_PUBLIC */
export function getSupabasePublishableKey(): string {
  return trimEnv(import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
