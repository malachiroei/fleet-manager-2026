/**
 * מקור אמת לצ׳יינג׳לוג: Supabase `system_settings` (version_manifest).
 * מניפסט סטטי לטסט: **רק** `v-dev-only.json` — אין `v.json` בפרויקט/בילד לייצור.
 */

import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';

export const SYSTEM_SETTINGS_VERSION_MANIFEST_KEY = 'version_manifest';
export const SYSTEM_SETTINGS_PENDING_CHANGES_KEY = 'pending_changes';

/** שם קובץ המניפסט הסטטי — רק לסביבות טסט (לא fleet-manager-pro.com) */
export const FLEET_DEV_MANIFEST_FILENAME = 'v-dev-only.json';

export type VersionManifest = {
  version: string;
  releaseDate?: string;
  releaseTime?: string;
  description?: string;
  changelog?: string;
  changes?: unknown;
};

export function normalizeVersion(v: string): string {
  return v.replace(/^v/, '').trim();
}

export function parseSemverParts(v: string): number[] | null {
  const parts = String(v).split('.').map((x) => parseInt(x, 10));
  if (parts.length < 3) return null;
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.slice(0, 3);
}

/**
 * כל מקטעי הגרסה המספריים (לפחות major.minor.patch).
 * תומך ב־2.7.24.1 לעומת 2.7.24 — נדרש ל־profiles.target_version ועדכון ממוקד.
 */
export function parseSemverSegments(v: string): number[] | null {
  const s = normalizeVersion(String(v).trim());
  if (!s) return null;
  const parts = s.split('.').map((x) => parseInt(x, 10));
  if (parts.length < 3) return null;
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts;
}

/**
 * גרסת ריליס קנונית לפרודקשן: רק major.minor.patch (ללא מקטע רביעי).
 * 2.7.44.1 → 2.7.44 — נשמר ב־localStorage / מניפסט כ־2.7.45 וכו'.
 */
export function toCanonicalThreePartVersion(v: string): string {
  const n = normalizeVersion(String(v ?? '').trim());
  if (!n) return '';
  const segs = parseSemverSegments(n);
  if (!segs || segs.length < 3) return n;
  return `${segs[0]}.${segs[1]}.${segs[2]}`;
}

/** עוגן אישי אחרי שמירת הרשאות: `2.7.51-p<timestamp>` — לא משנה גרסה גלובלית */
export type PrivateUiAnchorParse =
  | { kind: 'none' }
  | { kind: 'semver'; canonical: string }
  | { kind: 'private'; globalBase: string; full: string };

/**
 * מפרק `profiles.ui_denied_features_anchor_version`:
 * - private: `major.minor.patch-p<digits>`
 * - semver: גרסה תלת־מקטעית קלאסית (לגאסי)
 */
export function parsePrivateUiAnchor(raw: string): PrivateUiAnchorParse {
  const s = String(raw ?? '').trim();
  if (!s) return { kind: 'none' };
  const m = s.match(/^(\d+\.\d+\.\d+)-p(\d+)$/);
  if (m) {
    const globalBase = m[1];
    if (parseSemverSegments(globalBase)) return { kind: 'private', globalBase, full: s };
  }
  const canonical = toCanonicalThreePartVersion(normalizeVersion(s)) || normalizeVersion(s);
  if (canonical && parseSemverSegments(canonical)) return { kind: 'semver', canonical };
  return { kind: 'none' };
}

/** בונה עוגן פרטי מהגרסה הגלובלית הנוכחית (ממניפסט / app_version) */
export function formatPrivateUiAnchorVersion(globalCanonical: string): string {
  const base =
    toCanonicalThreePartVersion(normalizeVersion(globalCanonical)) || normalizeVersion(globalCanonical).trim();
  if (base && parseSemverSegments(base)) return `${base}-p${Date.now()}`;
  return `${normalizeVersion(globalCanonical) || '0.0.0'}-p${Date.now()}`;
}

/** השוואת semver עם תמיכה במקטע רביעי ומעלה (2.7.24.1 > 2.7.24) */
export function compareSemverExtended(a: string, b: string): number {
  const pa = parseSemverSegments(normalizeVersion(a));
  const pb = parseSemverSegments(normalizeVersion(b));
  if (!pa || !pb) return compareSemver(a, b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * עוגן קשיח ל־UI בפרו: max semver-extended בין גרסת המניפסט ל־profiles.ui_denied_features_anchor_version.
 * עד ש־localStorage `fleet-pro-acknowledged-version` ≥ ערך זה — אין להפעיל פיצ'רים מ־DB (כולל allowed_features).
 */
export function computeStrictUiFeatureAnchorVersion(
  manifestVersion: string,
  profileUiDeniedAnchorVersion: string | null | undefined
): string {
  const mvRaw = normalizeVersion(String(manifestVersion ?? '').trim());
  const mv = toCanonicalThreePartVersion(mvRaw) || mvRaw;
  const paRaw = String(profileUiDeniedAnchorVersion ?? '').trim();
  const pa = paRaw
    ? toCanonicalThreePartVersion(normalizeVersion(paRaw)) || normalizeVersion(paRaw)
    : '';
  if (!mv && !pa) return '';
  if (!mv) return pa;
  if (!pa) return mv;
  if (!parseSemverSegments(mv) || !parseSemverSegments(pa)) return mv || pa;
  return compareSemverExtended(pa, mv) >= 0 ? pa : mv;
}

/**
 * הצעה לעדכון ממוקד למשתמש: patch+1 על בסיס תלת־מקטעי בלבד (ללא יצירת מקטע רביעי).
 * @deprecated לוגיקת 2.7.x.y.1 הוסרה — השתמש ב־`computeNextPatchVersion(toCanonicalThreePartVersion(...))`.
 */
export function suggestTargetedReleaseVersion(
  currentReported: string | null | undefined,
  fallbackBase: string
): string {
  const cur = normalizeVersion(String(currentReported ?? '').trim());
  const fb = normalizeVersion(String(fallbackBase ?? '').trim());
  const merged = cur || fb;
  const base = toCanonicalThreePartVersion(merged) || '0.0.0';
  return computeNextPatchVersion(base);
}

/** חיובי אם a גדול מ-b */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemverParts(normalizeVersion(a));
  const pb = parseSemverParts(normalizeVersion(b));
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/** לא מחזירים גרסה ישנה מהבנדל (למנוע "נסיגה" ל-2.4.9 אחרי רענון). */
export function versionNotOlderThanBundle(stored: string | null | undefined, bundle: string): string {
  const s = normalizeVersion(String(stored ?? '').trim());
  const b = normalizeVersion(String(bundle ?? '').trim());
  if (!b) return s || '0.0.0';
  if (!s) return b;
  if (compareSemver(s, b) < 0) return b;
  return s;
}

/** גרסת ריליס הבאה: העלאת minor, patch=0 (למשל 2.4.9 → 2.5.0) */
export function computeNextMinorReleaseVersion(v: string): string {
  const parts = parseSemverParts(v);
  if (!parts) return '0.1.0';
  const [major, minor] = parts;
  return `${major}.${minor + 1}.0`;
}

/** גרסת ריליס הבאה: patch+1 (למשל 2.5.0 → 2.5.1) — ברירת מחדל לפרסום */
export function computeNextPatchVersion(v: string): string {
  const parts = parseSemverParts(v);
  if (!parts) return '0.0.1';
  const [major, minor, patch] = parts;
  return `${major}.${minor}.${patch + 1}`;
}

/** fleet-manager-pro.com (+ www) — לוגיקת UI/מודאל ייצור */
export function isFleetManagerProHostname(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase();
  return h === 'fleet-manager-pro.com' || h === 'www.fleet-manager-pro.com';
}

/**
 * באנר אדום (גרסת בדיקה): מוסתר בייצור — fleet-manager-pro.com ו־www.fleet-manager-pro.com בלבד.
 * כל שאר ה-hostnames (Vercel, localhost וכו') — מציגים באנר.
 */
export function showFleetStagingEnvironmentBanner(): boolean {
  if (typeof window === 'undefined') return false;
  return !isFleetManagerProHostname();
}

/**
 * כל hostname שמכיל "pro" — אסור לחלוטין מניפסט סטטי מהדפדפן (לא v-dev-only ולא cross-origin).
 * מונע דליפה בייצור גם אם קוד מנסה URL חיצוני.
 */
export function isProLikeFleetHostname(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('pro');
}

function isLegacyVJsonPath(pathname: string): boolean {
  return pathname === '/v.json' || pathname.endsWith('/v.json');
}

function isDevOnlyManifestPath(pathname: string): boolean {
  return pathname === `/${FLEET_DEV_MANIFEST_FILENAME}` || pathname.endsWith(`/${FLEET_DEV_MANIFEST_FILENAME}`);
}

/**
 * URL למניפסט טסט בלבד. בדומיין שמכיל "pro" — מחזיר מחרוזת ריקה (אין path ל-v-dev-only בייצור).
 */
export function getTestStaticManifestUrl(): string {
  if (typeof window === 'undefined') {
    return `https://fleet-manager-dev.vercel.app/${FLEET_DEV_MANIFEST_FILENAME}`;
  }
  if (isProLikeFleetHostname()) {
    return '';
  }
  return `${window.location.origin}/${FLEET_DEV_MANIFEST_FILENAME}`;
}

/** @deprecated use getTestStaticManifestUrl */
export function getSameOriginManifestUrl(): string {
  return getTestStaticManifestUrl();
}

/**
 * טוען מניפסט רק מ־v-dev-only.json. חוסם v.json.
 * בכל דף ש-hostname מכיל "pro" — לא רץ fetch (אפס רשת למניפסט).
 */
export async function fetchVersionManifestFromUrl(url: string): Promise<Partial<VersionManifest> | null> {
  if (isProLikeFleetHostname()) return null;
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : 'https://fleet-manager-dev.vercel.app');
  } catch {
    return null;
  }
  if (isLegacyVJsonPath(u.pathname)) return null;
  if (!isDevOnlyManifestPath(u.pathname)) return null;

  try {
    const res = await fetch(`${trimmed}${trimmed.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<VersionManifest>;
    if (typeof json?.version !== 'string' || !json.version.trim()) return null;
    return json;
  } catch {
    return null;
  }
}

/** גרסה גלובלית מ־system_settings.app_version (מחרוזת ב־value) */
export async function fetchAppVersionFromDb(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (a: string, b: string) => {
        maybeSingle: () => Promise<{ data: { value?: unknown } | null; error: Error | null }>;
      };
    };
  };
}): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', 'app_version')
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const v = data?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * עוגן גלובלי ל־UI: max semver בין גרסת מניפסט (אם קיימת) לבין app_version ב־DB.
 * פרסום שמעדכן רק app_version עדיין דורש ack מתאים.
 */
export function fleetMergeGlobalPublishedVersions(
  manifestVersion: string | null | undefined,
  appVersion: string | null | undefined
): string {
  const mRaw = String(manifestVersion ?? '').trim();
  const aRaw = String(appVersion ?? '').trim();
  const m = mRaw
    ? toCanonicalThreePartVersion(normalizeVersion(mRaw)) || normalizeVersion(mRaw).trim()
    : '';
  const a = aRaw
    ? toCanonicalThreePartVersion(normalizeVersion(aRaw)) || normalizeVersion(aRaw).trim()
    : '';
  if (!m) return a;
  if (!a) return m;
  if (!parseSemverSegments(m) || !parseSemverSegments(a)) return m || a;
  return compareSemverExtended(a, m) > 0 ? a : m;
}

/** קריאת מניפסט מ-Supabase (אובייקט JSON בשדה value) */
export async function fetchVersionManifestFromDb(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (a: string, b: string) => {
        maybeSingle: () => Promise<{ data: { value?: unknown } | null; error: Error | null }>;
      };
    };
  };
}): Promise<Partial<VersionManifest> | null> {
  try {
    const { data, error } = await supabase
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', SYSTEM_SETTINGS_VERSION_MANIFEST_KEY)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const val = data?.value;
    if (!val || typeof val !== 'object') return null;
    const obj = val as Record<string, unknown>;
    if (typeof obj.version !== 'string' || !obj.version.trim()) return null;
    return obj as Partial<VersionManifest>;
  } catch {
    return null;
  }
}

/** בוחר את המניפסט עם הגרסה הגבוהה ביותר (DB מול URL טסט בלבד) */
export async function pickLatestVersionManifest(
  supabase: Parameters<typeof fetchVersionManifestFromDb>[0],
  staticManifestUrl: string
): Promise<{ manifest: Partial<VersionManifest>; source: 'db' | 'url' } | null> {
  const fromUrlPromise = isProLikeFleetHostname()
    ? Promise.resolve(null)
    : fetchVersionManifestFromUrl(staticManifestUrl);
  const [fromDb, fromUrl] = await Promise.all([fetchVersionManifestFromDb(supabase), fromUrlPromise]);

  if (!fromDb && !fromUrl) return null;
  if (!fromDb) return { manifest: fromUrl!, source: 'url' };
  if (!fromUrl) return { manifest: fromDb, source: 'db' };

  const cmp = compareSemver(
    String(fromDb.version ?? ''),
    String(fromUrl.version ?? '')
  );
  if (cmp >= 0) return { manifest: fromDb, source: 'db' };
  return { manifest: fromUrl, source: 'url' };
}

export type PendingChangesPayload = { changes: string[] };

export async function fetchPendingChangesFromDb(supabase: Parameters<typeof fetchVersionManifestFromDb>[0]): Promise<
  string[] | null
> {
  try {
    const { data, error } = await supabase
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', SYSTEM_SETTINGS_PENDING_CHANGES_KEY)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const val = data?.value;
    if (!val || typeof val !== 'object') return null;
    const raw = (val as PendingChangesPayload).changes;
    if (!Array.isArray(raw)) return null;
    return raw.map((x) => String(x)).filter((s) => s.trim());
  } catch {
    return null;
  }
}
