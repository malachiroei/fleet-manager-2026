/**
 * Supabase browser client — אימות סביבה לפני אתחול (v2.7.66).
 * אין כאן השבתת מיילים במצב פיתוח; הזמנות — `sendInvitationEmail` → Edge Function `send-invite`.
 * URL/מפתח: `resolveSupabaseViteEnv` / `getSupabaseUrl` / `getSupabaseAnonKey` ב־`publicEnv`
 * (על fleet-manager-pro.com — URL ייצור מ־env; anon מ-Vercel).
 * מיוצא גם מ־`@/integrations/supabase/client` לתאימות ייבוא קיימת.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  resolveSupabaseViteEnv,
} from '@/integrations/supabase/publicEnv';

/** Re-export — routing דינמי לפי hostname (מימוש ב-publicEnv). */
export { getSupabaseAnonKey, getSupabaseUrl, resolveSupabaseViteEnv };
import {
  cleanSupabaseProjectRefForGuard,
  evaluateSupabaseEnvironmentGuard,
  extractProjectRefFromSupabaseUrl,
} from '@/lib/supabase/envGuard';
import { isFleetAppStagingEnvironment } from '@/lib/fleetAppStagingEnvironment';
import {
  FLEET_BOUND_SUPABASE_PROJECT_REF_KEY,
  purgeLocalStorageForSupabaseEnvironmentSwitch,
} from '@/lib/supabase/environmentLocalStorage';

function trimEnv(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  urlEnvSource,
  anonKeyEnvSource,
} = resolveSupabaseViteEnv();

const skipRefGuard = trimEnv(import.meta.env.NEXT_PUBLIC_SUPABASE_SKIP_PROJECT_REF_CHECK) === '1';
const refFromUrl = extractProjectRefFromSupabaseUrl(SUPABASE_URL) ?? '';
const expectedProjectRef =
  trimEnv(import.meta.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF) ||
  trimEnv(import.meta.env.VITE_SUPABASE_PROJECT_REF) ||
  refFromUrl;

const envGuard = evaluateSupabaseEnvironmentGuard(SUPABASE_URL, expectedProjectRef, skipRefGuard, {
  urlEnvSource,
  anonKeyEnvSource,
});

/** User-visible copy for full-screen overlay (exact wording). */
export const SUPABASE_ENVIRONMENT_MISMATCH_OVERLAY_MESSAGE =
  'ENVIRONMENT MISMATCH: This build is locked to another database.';

/** True when ref checking is enabled and the URL/ref guard failed (show blocking overlay). */
export const supabaseEnvironmentLockActive: boolean =
  typeof window !== 'undefined' && !skipRefGuard && envGuard.ok === false;

/** Friendly full-screen message when URL or anon key is missing after env bridge (v2.7.62). */
export const SUPABASE_SYSTEM_CONFIGURATION_ERROR_TITLE = 'System Configuration Error';

/** Missing Supabase URL or anon key — show configuration overlay instead of a blank crash. */
export const supabaseSystemConfigurationErrorActive: boolean =
  typeof window !== 'undefined' &&
  (!Boolean(String(SUPABASE_URL ?? '').trim()) || !Boolean(String(SUPABASE_ANON_KEY ?? '').trim()));

/**
 * תג "ENV: TEST" — רק כשה-ref guard עבר (לא skip) ובסביבת סטייג׳'ינג/מקומית (לא pro.com).
 */
export function shouldShowSupabaseEnvTestBadge(): boolean {
  if (typeof window === 'undefined') return false;
  if (skipRefGuard) return false;
  if (envGuard.ok !== true) return false;
  return isFleetAppStagingEnvironment();
}

if (typeof window !== 'undefined' && !skipRefGuard && envGuard.ok) {
  try {
    const cur = cleanSupabaseProjectRefForGuard(envGuard.effectiveExpectedRef);
    const prev = localStorage.getItem(FLEET_BOUND_SUPABASE_PROJECT_REF_KEY)?.trim() ?? '';
    if (prev && prev !== cur) {
      purgeLocalStorageForSupabaseEnvironmentSwitch();
    }
    localStorage.setItem(FLEET_BOUND_SUPABASE_PROJECT_REF_KEY, cur);
  } catch {
    // ignore
  }
}

if (envGuard.ok === false) {
  // eslint-disable-next-line no-console
  console.error(envGuard.message);
}

type SupabaseClientType = ReturnType<typeof createClient<Database>>;

const noopSubscription = { unsubscribe: () => {} };

const createBlockedSupabaseClient = (message: string): SupabaseClientType => {
  const blockedError = new Error(message);
  const authStub = {
    onAuthStateChange: () => ({ data: { subscription: noopSubscription } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: blockedError }),
    signOut: async () => ({ error: blockedError }),
    signInWithPassword: async () => ({ data: null, error: blockedError }),
  };
  return new Proxy(
    { auth: authStub },
    {
      get(target, prop: string | symbol) {
        if (prop === 'auth') return authStub;
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        return () => {
          throw blockedError;
        };
      },
    }
  ) as unknown as SupabaseClientType;
};

if (typeof window !== 'undefined' && !import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.log('[Supabase] env load status (non-production)', {
    hasUrl: Boolean(String(SUPABASE_URL ?? '').trim()),
    hasAnonKey: Boolean(String(SUPABASE_ANON_KEY ?? '').trim()),
  });

  const anonPreview =
    SUPABASE_ANON_KEY && typeof SUPABASE_ANON_KEY === 'string'
      ? `${SUPABASE_ANON_KEY.slice(0, 8)}...${SUPABASE_ANON_KEY.slice(-4)}`
      : null;

  const extractedRef = SUPABASE_URL ? extractProjectRefFromSupabaseUrl(SUPABASE_URL) : null;

  // eslint-disable-next-line no-console
  console.log('[Supabase] client bootstrap (URL/key sources)', {
    url: SUPABASE_URL || '(missing)',
    urlEnvSource: urlEnvSource ?? '(no NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL)',
    anonKeyEnvSource: anonKeyEnvSource ?? '(no NEXT_PUBLIC_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY)',
    urlRefExtracted: extractedRef ?? '(n/a)',
    projectRefEnv: expectedProjectRef || '(not set)',
    envGuardOk: envGuard.ok,
    anonKeyPreview: anonPreview,
    anonKeyLength: SUPABASE_ANON_KEY ? String(SUPABASE_ANON_KEY).length : 0,
  });
}

const shouldInitSupabase =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && envGuard.ok;

const supabaseBlockedMessage: string =
  envGuard.ok === false
    ? envGuard.message
    : 'Supabase client not initialized: set NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY.';

export const supabase: SupabaseClientType = shouldInitSupabase
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: typeof window !== 'undefined' ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      },
    })
  : createBlockedSupabaseClient(supabaseBlockedMessage);
