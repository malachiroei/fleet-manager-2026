import { isFleetManagerProHostname } from '@/lib/versionManifest';
import { getSupabaseUrl } from '@/integrations/supabase/publicEnv';

function trimEnv(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function cleanRef(s: string): string {
  return String(s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** מזהה פרויקט מ-URL Supabase (ללא ייבוא מ-envGuard כדי למנוע מעגל תלויות). */
export function extractFleetSupabaseRefFromUrl(urlRaw: string): string | null {
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

function getConnectedFleetSupabaseRef(): string | null {
  return extractFleetSupabaseRefFromUrl(getSupabaseUrl());
}

/** Ref פרויקט ייצור ידוע — אותו ערך כמו ב-Supabase/Vercel (למשל cesstooh…). */
export function knownFleetProductionSupabaseRef(): string {
  return (
    trimEnv(import.meta.env.NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF) ||
    trimEnv(import.meta.env.VITE_FLEET_KNOWN_PRODUCTION_SUPABASE_REF)
  );
}

/** Ref פרויקט סטייג'ינג/טסט ידוע. */
export function knownFleetStagingSupabaseRef(): string {
  return (
    trimEnv(import.meta.env.NEXT_PUBLIC_FLEET_STAGING_DEFAULT_SUPABASE_REF) ||
    trimEnv(import.meta.env.VITE_FLEET_STAGING_DEFAULT_SUPABASE_REF)
  );
}

function isViteLocalDevHost(h: string): boolean {
  const x = h.trim().toLowerCase();
  if (!x) return false;
  if (x === 'localhost' || x === '127.0.0.1' || x === '[::1]') return true;
  if (x.endsWith('.local')) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(x)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(x)) return true;
  return false;
}

/**
 * האם האפליקציה מחוברת לפרויקט Supabase של ייצור (לפי URL מול ref ידוע).
 */
export function isFleetConnectedToProductionSupabase(): boolean {
  if (typeof window === 'undefined') return false;
  const cur = getConnectedFleetSupabaseRef();
  const prodRef = knownFleetProductionSupabaseRef();
  return Boolean(cur && prodRef && cleanRef(cur) === cleanRef(prodRef));
}

/**
 * סביבת טסט/סטייג'ינג ב-UI: באנר אדום, כפתור «העברת הגדרות לפרו» בהגדרות ארגון.
 * נקבע לפי **פרויקט Supabase בפועל** (URL) מול משתני `FLEET_*_REF`, ואז heuristics של hostname / Vite.
 */
export function isFleetAppStagingEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (isFleetManagerProHostname()) return false;

  const cur = getConnectedFleetSupabaseRef();
  const prodRef = knownFleetProductionSupabaseRef();
  const stagingRef = knownFleetStagingSupabaseRef();

  if (cur && prodRef && cleanRef(cur) === cleanRef(prodRef)) {
    return false;
  }
  if (cur && stagingRef && cleanRef(cur) === cleanRef(stagingRef)) {
    return true;
  }

  const h = window.location.hostname.toLowerCase();
  if (h.includes('staging')) return true;

  if (h.endsWith('.vercel.app')) {
    if (cur && prodRef && cleanRef(cur) === cleanRef(prodRef)) return false;
    return true;
  }

  /** `npm run dev:prod` — מצב production בלי vercel/staging בשם מארח */
  if (import.meta.env.MODE === 'production') {
    return false;
  }

  if (isViteLocalDevHost(h)) return true;
  if (import.meta.env.DEV) return true;

  return false;
}

export type FleetEnvironmentBannerKind = 'none' | 'staging' | 'production-local';

/**
 * באנר עליון:
 * - `staging` — אדום (טסט)
 * - `production-local` — מקומי מול DB ייצור (גרסת עבודה)
 * - `none` — דומיין ייצור ציבורי / ללא התראה
 */
export function getFleetEnvironmentBannerKind(): FleetEnvironmentBannerKind {
  if (typeof window === 'undefined') return 'none';
  if (isFleetManagerProHostname()) return 'none';
  if (isFleetAppStagingEnvironment()) return 'staging';

  const cur = getConnectedFleetSupabaseRef();
  const prodRef = knownFleetProductionSupabaseRef();
  const h = window.location.hostname.toLowerCase();
  const localLike = isViteLocalDevHost(h) || import.meta.env.DEV;

  if (localLike && cur && prodRef && cleanRef(cur) === cleanRef(prodRef)) {
    return 'production-local';
  }

  return 'none';
}
