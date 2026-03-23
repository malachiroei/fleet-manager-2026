/**
 * Environment guard: URL project ref must match expected project ref (Vercel + hostname sync).
 * v2.7.65: סנכרון סטייג׳/פרודקשן — Vercel קודם; תיקון סטייסינג עם ref פרודקשן בטעות; purge+reload חד-פעמי אחרי reconcile.
 * v2.7.66: fleet-manager-pro.com + URL Supabase ייצור קשיח — ref ייצור קשיח כ-fallback ל-guard.
 */

import { isFleetAppStagingEnvironment } from '@/lib/fleetAppStagingEnvironment';
import { clearLocalStorageOnSupabaseEnvironmentGuardFailure } from '@/lib/supabase/environmentLocalStorage';
import { getSupabaseUrl } from '@/integrations/supabase/publicEnv';
import { isFleetManagerProDotComHostname } from '@/lib/supabase/fleetSupabaseProductionDefaults';
import { isFleetManagerProHostname } from '@/lib/versionManifest';

const clean = (s: string) => String(s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase().trim();

const FLEET_ENV_GUARD_SYNC_RELOAD_SESSION_KEY = 'fleet-supabase-env-guard-v2765-sync';

function trimEnv(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Production ref — Vercel קודם; אחרת מ־NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF או מ־URL הפרויקט (כמו ב-publicEnv).
 */
function getFleetProductionDefaultSupabaseRef(): string {
  const fromEnv =
    trimEnv(import.meta.env.NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF) ||
    trimEnv(import.meta.env.VITE_FLEET_KNOWN_PRODUCTION_SUPABASE_REF);
  if (fromEnv) return fromEnv;
  if (isFleetManagerProDotComHostname()) {
    const fromUrl = extractProjectRefFromSupabaseUrl(getSupabaseUrl());
    if (fromUrl) return fromUrl;
  }
  return '';
}

function getFleetStagingDefaultSupabaseRef(): string {
  return (
    trimEnv(import.meta.env.NEXT_PUBLIC_FLEET_STAGING_DEFAULT_SUPABASE_REF) ||
    trimEnv(import.meta.env.VITE_FLEET_STAGING_DEFAULT_SUPABASE_REF) ||
    ''
  );
}

/** Staging | Production | Unknown — לפי דומיין האפליקציה (לא Supabase). */
export function detectFleetDeployEnvironmentLabel(): 'Staging' | 'Production' | 'Unknown' {
  if (typeof window === 'undefined') return 'Unknown';
  if (isFleetManagerProHostname()) return 'Production';
  if (isFleetAppStagingEnvironment()) return 'Staging';
  return 'Unknown';
}

/** מיוצא ל־`client.ts` (fingerprint bound ref) — זהה ל־`clean` */
export function cleanSupabaseProjectRefForGuard(str: string): string {
  return clean(str);
}

export type SupabaseEnvGuardLogContext = {
  urlEnvSource: string | null;
  anonKeyEnvSource: string | null;
};

export function extractProjectRefFromSupabaseUrl(urlRaw: string): string | null {
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

export type SupabaseEnvGuardSuccess = {
  ok: true;
  /** ה-ref שמולו בוצעה ההשוואה (אחרי סנכרון Vercel/hostname). */
  effectiveExpectedRef: string;
  environmentLabel: 'Staging' | 'Production' | 'Unknown';
  /** נבחר ref שונה מ-NEXT_PUBLIC_SUPABASE_PROJECT_REF בגלל hostname/URL */
  didReconcileFromHostname: boolean;
};

export type SupabaseEnvGuardFailure = { ok: false; message: string };

export type SupabaseEnvGuardResult = SupabaseEnvGuardSuccess | SupabaseEnvGuardFailure;

type ResolveEffective = {
  effectiveRaw: string;
  environmentLabel: 'Staging' | 'Production' | 'Unknown';
  didReconcileFromHostname: boolean;
};

/**
 * Vercel (NEXT_PUBLIC_SUPABASE_PROJECT_REF) תמיד קודם אם הוא תואם ל-URL.
 * אחרת: fallback לפי hostname (סטייג׳ → ref טסט; פרודקשן → ref מ־env ייעודי).
 * אם env אומר פרודקשן אבל ה-URL הוא טסט על דומיין סטייג׳ — מתקנים ל-ref הטסט.
 */
function resolveEffectiveExpectedSupabaseRef(url: string, vercelRaw: string): ResolveEffective {
  const environmentLabel = detectFleetDeployEnvironmentLabel();
  const prodDefault = getFleetProductionDefaultSupabaseRef();
  const stagingDefault = getFleetStagingDefaultSupabaseRef();
  const extracted = extractProjectRefFromSupabaseUrl(url);

  const vercelTrim = String(vercelRaw ?? '').trim();

  if (!clean(vercelTrim)) {
    const fallback =
      environmentLabel === 'Staging'
        ? stagingDefault
        : environmentLabel === 'Production'
          ? prodDefault
          : '';
    return {
      effectiveRaw: fallback,
      environmentLabel,
      didReconcileFromHostname: Boolean(fallback),
    };
  }

  let effectiveRaw = vercelTrim;
  let didReconcileFromHostname = false;

  if (typeof window !== 'undefined' && extracted) {
    const vc = clean(vercelTrim);
    const uc = clean(extracted);
    if (vc !== uc) {
      if (environmentLabel === 'Staging' && uc === clean(stagingDefault)) {
        effectiveRaw = stagingDefault;
        didReconcileFromHostname = true;
      } else if (
        environmentLabel === 'Production' &&
        prodDefault &&
        uc === clean(prodDefault)
      ) {
        effectiveRaw = prodDefault;
        didReconcileFromHostname = true;
      }
    }
  }

  return { effectiveRaw, environmentLabel, didReconcileFromHostname };
}

/**
 * @param skipCheck — NEXT_PUBLIC_SUPABASE_SKIP_PROJECT_REF_CHECK=1
 * @param logCtx — אופציונלי: לוג לקונסול עם מקור משתני הסביבה ששימשו ל-URL/מפתח
 */
export function evaluateSupabaseEnvironmentGuard(
  supabaseUrl: string,
  expectedRefFromEnv: string,
  skipCheck: boolean,
  logCtx?: SupabaseEnvGuardLogContext | null
): SupabaseEnvGuardResult {
  const finish = (result: SupabaseEnvGuardResult): SupabaseEnvGuardResult => {
    if (typeof window !== 'undefined') {
      if (!result.ok) {
        try {
          clearLocalStorageOnSupabaseEnvironmentGuardFailure();
        } catch {
          // ignore
        }
      } else if (result.ok && result.didReconcileFromHostname) {
        try {
          if (!sessionStorage.getItem(FLEET_ENV_GUARD_SYNC_RELOAD_SESSION_KEY)) {
            sessionStorage.setItem(FLEET_ENV_GUARD_SYNC_RELOAD_SESSION_KEY, '1');
            localStorage.clear();
            window.location.reload();
          }
        } catch {
          // ignore
        }
      }
      if (logCtx) {
        // eslint-disable-next-line no-console
        console.log('[Supabase envGuard]', {
          urlEnvSource: logCtx.urlEnvSource ?? '(none — URL empty)',
          anonKeyEnvSource: logCtx.anonKeyEnvSource ?? '(none — key empty)',
          skipCheck,
          guardOk: result.ok,
          ...(result.ok
            ? {
                environmentLabel: result.environmentLabel,
                effectiveExpectedRef: result.effectiveExpectedRef,
                didReconcileFromHostname: result.didReconcileFromHostname,
              }
            : {}),
          ...(!result.ok ? { message: result.message } : {}),
        });
      }
    }
    return result;
  };

  if (skipCheck) {
    return finish({
      ok: true,
      effectiveExpectedRef: String(expectedRefFromEnv ?? '').trim(),
      environmentLabel: typeof window !== 'undefined' ? detectFleetDeployEnvironmentLabel() : 'Unknown',
      didReconcileFromHostname: false,
    });
  }

  const url = String(supabaseUrl ?? '').trim();
  if (!url) {
    return finish({
      ok: true,
      effectiveExpectedRef: String(expectedRefFromEnv ?? '').trim(),
      environmentLabel: typeof window !== 'undefined' ? detectFleetDeployEnvironmentLabel() : 'Unknown',
      didReconcileFromHostname: false,
    });
  }

  const vercelProjectRef = String(expectedRefFromEnv ?? '').trim();
  const resolved = resolveEffectiveExpectedSupabaseRef(url, expectedRefFromEnv);
  const { effectiveRaw, environmentLabel, didReconcileFromHostname } = resolved;

  console.log('Current Environment detected:', environmentLabel);
  console.log(
    '[Supabase envGuard] NEXT_PUBLIC_SUPABASE_PROJECT_REF from Vercel takes precedence when set and matches URL;',
    vercelProjectRef
      ? `Vercel ref is set (clean length ${clean(vercelProjectRef).length})`
      : 'Vercel ref not set — using hostname fallbacks (NEXT_PUBLIC_FLEET_STAGING_DEFAULT_SUPABASE_REF or production URL ref / NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF)'
  );

  const expectedClean = clean(effectiveRaw);
  if (!expectedClean) {
    return finish({
      ok: false,
      message:
        '[Supabase] ENVIRONMENT GUARD: could not resolve expected project ref (set NEXT_PUBLIC_SUPABASE_PROJECT_REF and/or NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF for production).',
    });
  }

  const urlLower = url.toLowerCase();
  if (urlLower.indexOf(expectedClean) === -1) {
    return finish({
      ok: false,
      message:
        '[Supabase] STRICT ENVIRONMENT LOCK: SUPABASE_URL does not contain resolved project ref (alphanumeric). Blocking DB access.',
    });
  }

  const extracted = extractProjectRefFromSupabaseUrl(url);
  if (!extracted) {
    return finish({
      ok: false,
      message: `[Supabase] ENVIRONMENT GUARD: cannot extract project ref from SUPABASE_URL (expected hostname <ref>.supabase.co). Blocking DB access.`,
    });
  }

  const cleanedUrlRef = clean(extracted);
  const cleanedEnvRef = clean(effectiveRaw);
  console.log('MATCH CHECK - Cleaned URL Ref:', cleanedUrlRef, 'Length:', cleanedUrlRef.length);
  console.log('MATCH CHECK - Cleaned Env Ref:', cleanedEnvRef, 'Length:', cleanedEnvRef.length);

  const guardOk = cleanedUrlRef === cleanedEnvRef;
  if (!guardOk) {
    return finish({
      ok: false,
      message: `[Supabase] ENVIRONMENT GUARD: URL ref "${cleanedUrlRef}" ≠ resolved env ref "${cleanedEnvRef}" (cleaned). Blocking Supabase client to prevent cross-environment data leaks.`,
    });
  }

  return finish({
    ok: true,
    effectiveExpectedRef: effectiveRaw,
    environmentLabel,
    didReconcileFromHostname,
  });
}
