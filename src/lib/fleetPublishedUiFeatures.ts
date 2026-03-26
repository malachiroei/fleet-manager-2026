import { FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY } from '@/constants/version';
import {
  buildFleetOrgDocPermissionRowsFromDocuments,
  isFleetOrgDocumentFormBypassToken,
  type FleetOrgDocumentPermissionEntry,
} from '@/lib/fleetSystemFormRegistry';
import {
  compareSemverExtended,
  normalizeVersion,
  parsePrivateUiAnchor,
  parseSemverSegments,
  toCanonicalThreePartVersion,
} from '@/lib/versionManifest';

export type { FleetOrgDocumentPermissionEntry } from '@/lib/fleetSystemFormRegistry';
export { buildFleetOrgDocPermissionRowsFromDocuments };

/**
 * טוקנים ב־version_manifest.changes (או pending) — בפרו תכונה מוצגת רק אם השורה/הטוקן קיים במניפסט.
 * אחרי 2.7.13: כל פיצ'ר UI חדש בפרו חייב טוקן ייעודי + שימוש ב־useFleetManifestUiGates().
 */

/** חייב להופיע כחלק מהמחרוזת ב־changes (פרסום / pending) */
export const FLEET_UI_FEATURE_BOLD_VERSION_TOKEN = 'UI_FEATURE_BOLD_VERSION_HEADER';
export const FLEET_UI_FEATURE_STAR_HEADER_TOKEN = 'UI_FEATURE_STAR_HEADER';

/** Dashboard Quick Actions — נפרדים לפרסום עצמאי */
export const FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN = 'UI_FEATURE_DASHBOARD_ACTION_TREATMENT';
export const FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN = 'UI_FEATURE_DASHBOARD_ACTION_TEST';

/**
 * טופס תחזוקה — לא בפרסום מניפסט גלובלי; רק הרשאה אישית ב־profiles.allowed_features / מודאל ניהול הרשאות.
 */
export const FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN = 'UI_FEATURE_MAINTENANCE_FORM';

/** טפסים בסטייג' — הרשאה אישית בלבד (מודאל ניהול הרשאות); תאימות לאחור לפרופילים קיימים */
export const FLEET_UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE_TOKEN = 'UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE';

export const FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN = 'UI_FEATURE_FORM_VEHICLE_STATUS';
export const FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN = 'UI_FEATURE_FORM_CAR_HANDOVER';
export const FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN = 'UI_FEATURE_FORM_PERIODIC_MAINTENANCE';
export const FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN = 'UI_FEATURE_FORM_REPAIR_REPORT';

/**
 * גרסת הוצאה מינימלית לטוקנים קיימים: אישור משתמש ≥ רצפה — נשארים פעילים אחרי דיפלוי בנדל חדש.
 * טוקן חדש בלי רצפה: דורשים אישור ≥ גרסת המניפסט ב-DB.
 */
export const FLEET_UI_FEATURE_MIN_ACK_VERSION: Record<string, string> = {
  [FLEET_UI_FEATURE_BOLD_VERSION_TOKEN]: '2.7.13',
  [FLEET_UI_FEATURE_STAR_HEADER_TOKEN]: '2.7.13',
  [FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN]: '2.7.13',
  [FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN]: '2.7.13',
  [FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN]: '2.7.45',
  [FLEET_UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE_TOKEN]: '2.7.56',
  [FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN]: '2.7.57',
  [FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN]: '2.7.57',
  [FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN]: '2.7.57',
  [FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN]: '2.7.57',
};

export function fleetUiMinAckVersionForToken(token: string, publishedManifestVersion: string): string {
  const t = String(token).trim();
  const pinnedRaw = FLEET_UI_FEATURE_MIN_ACK_VERSION[t]?.trim() ?? '';
  if (pinnedRaw) return normalizeVersion(pinnedRaw);
  const mvRaw = String(publishedManifestVersion ?? '').trim();
  const mv = mvRaw ? normalizeVersion(mvRaw) : '';
  return mv || '0.0.0';
}

/**
 * גרסת ack נדרשת בפרו: max(מינימום הטוקן, גרסת המניפסט המפורסמת) — מונע דליפת UI לפני «עדכן עכשיו»
 * גם כשהטוקן ב־allowed_features בלבד.
 */
export function fleetUiRequiredAckVersion(token: string, publishedManifestVersion: string): string {
  const minIntro = fleetUiMinAckVersionForToken(token, publishedManifestVersion);
  const mv =
    toCanonicalThreePartVersion(normalizeVersion(String(publishedManifestVersion ?? '').trim())) || '';
  if (!parseSemverSegments(mv)) return minIntro;
  if (!parseSemverSegments(minIntro)) return mv;
  return compareSemverExtended(mv, minIntro) >= 0 ? mv : minIntro;
}

/**
 * טוקן UI_FEATURE_* — דיבוג / staging בלבד. בפרודקשן אסור להפעיל או לפרסם.
 * כלל: מכיל `_DEBUG_`, או מתחיל ב־`DEBUG_`, או ברשימה המפורשת.
 */
export function isFleetStagingOnlyUiTokenId(token: string): boolean {
  const t = String(token).trim();
  if (!t) return false;
  if (t.includes('_DEBUG_')) return true;
  if (t.startsWith('DEBUG_')) return true;
  return false;
}

/** שורת צ׳יינג׳לוג — האם מזוהה כפיצ'ר staging/debug (לפי טוקן או טקסט) */
export function isFleetStagingOnlyChangelogLine(line: string): boolean {
  const t = extractFleetUiFeatureTokenFromLine(line);
  if (t && isFleetStagingOnlyUiTokenId(t)) return true;
  const s = String(line);
  if (/\bUI_FEATURE_\w*DEBUG\w*/i.test(s)) return true;
  if (/\bDEBUG_[A-Z0-9_]+/.test(s) && s.includes('UI_FEATURE')) return true;
  return false;
}

/** מסיר שורות staging/debug כשהאפליקציה רצה על דומיין פרודקשן */
export function stripFleetStagingOnlyLinesForProHostname(
  lines: string[],
  isProHostname: boolean
): string[] {
  if (!isProHostname) return lines;
  return lines
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0)
    .filter((line) => !isFleetStagingOnlyChangelogLine(line));
}

/** טוקנים מ־FLEET_UI_DEFAULT_PUBLISH_CANDIDATES שלא יתווספו אוטומטית בפרו */
export function getFleetUiTokensExcludedFromProPublishDefaults(): string[] {
  return FLEET_UI_DEFAULT_PUBLISH_CANDIDATES.filter((c) =>
    isFleetStagingOnlyUiTokenId(c.token)
  ).map((c) => c.token);
}

/**
 * רשימה סטטית למודאל פרסום: כל טוקני staging/debug הידועים (מסומנים במפורש או לפי כלל DEBUG_ / _DEBUG_).
 * ללא צ'קבוקס — רק מידע למפעיל.
 */
export function getFleetStagingOnlyUiInfoLines(): string[] {
  return FLEET_UI_DEFAULT_PUBLISH_CANDIDATES.filter((c) =>
    isFleetStagingOnlyUiTokenId(c.token)
  ).map((c) => c.line);
}

/** שורות ל־pending_changes / מודאל פרסום */
export const FLEET_UI_PENDING_LINE_BOLD = `${FLEET_UI_FEATURE_BOLD_VERSION_TOKEN} — Bold version text in header (AppLayout)`;
export const FLEET_UI_PENDING_LINE_STAR = `${FLEET_UI_FEATURE_STAR_HEADER_TOKEN} — Star icon (⭐) in header (AppLayout)`;
export const FLEET_UI_PENDING_LINE_DASHBOARD_TREATMENT = `${FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN} — Dashboard Quick Action: עדכן טיפול`;
export const FLEET_UI_PENDING_LINE_DASHBOARD_TEST = `${FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN} — Dashboard Quick Action: כפתור בדיקה`;
export const FLEET_UI_PENDING_LINE_MAINTENANCE_FORM = `${FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN} — Dashboard: טופס תחזוקה (הרשאה אישית בלבד, לא במניפסט)`;
export const FLEET_UI_PENDING_LINE_FORMS_SYSTEM_STAGING_TABLE = `${FLEET_UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE_TOKEN} — Staging forms: vehicle status form entry (permission only)`;
export const FLEET_UI_PENDING_LINE_FORM_VEHICLE_STATUS = `${FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN} — טופס סטטוס רכב`;
export const FLEET_UI_PENDING_LINE_FORM_CAR_HANDOVER = `${FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN} — טופס מסירת רכב`;
export const FLEET_UI_PENDING_LINE_FORM_PERIODIC_MAINTENANCE = `${FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN} — טופס טיפול תקופתי`;
export const FLEET_UI_PENDING_LINE_FORM_REPAIR_REPORT = `${FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN} — טופס דיווח תיקון`;

/** קטגוריה לקיבוץ בממשק: כותרת, דשבורד, טפסים, מנהל */
export type FleetUiFeatureCategory = 'header' | 'dashboard' | 'forms' | 'admin';

/** קיבוץ במודאל הרשאות מנהל */
export type FleetUiPermissionSection =
  | 'header_ui'
  | 'dashboard_actions'
  | 'maintenance_forms'
  | 'system_builtin_forms'
  | 'admin_debug';

/**
 * מקור אמת יחיד לכל פיצ'רי UI — הרשאות אישיות, פרסום גלובלי, והשוואת pending.
 */
export type FleetUiFeatureCatalogEntry = {
  token: string;
  line: string;
  title: string;
  category: FleetUiFeatureCategory;
  permissionSection: FleetUiPermissionSection;
  /** ניתן לכלול ב־version_manifest בפרסום גלובלי */
  globalManifestEligible: boolean;
  /** מוצג במודאל הרשאות משתמש */
  permissionModal: boolean;
};

export const FLEET_UI_FEATURE_CATALOG: FleetUiFeatureCatalogEntry[] = [
  {
    token: FLEET_UI_FEATURE_STAR_HEADER_TOKEN,
    line: FLEET_UI_PENDING_LINE_STAR,
    title: 'כוכב בראש הדף',
    category: 'header',
    permissionSection: 'header_ui',
    globalManifestEligible: true,
    permissionModal: true,
  },
  {
    token: FLEET_UI_FEATURE_BOLD_VERSION_TOKEN,
    line: FLEET_UI_PENDING_LINE_BOLD,
    title: 'גרסה מודגשת',
    category: 'header',
    permissionSection: 'header_ui',
    globalManifestEligible: true,
    permissionModal: true,
  },
  {
    token: FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN,
    line: FLEET_UI_PENDING_LINE_DASHBOARD_TEST,
    title: 'כפתור עדכן נסיעה',
    category: 'dashboard',
    permissionSection: 'dashboard_actions',
    globalManifestEligible: true,
    permissionModal: true,
  },
  {
    token: FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN,
    line: FLEET_UI_PENDING_LINE_DASHBOARD_TREATMENT,
    title: 'כפתור עדכן טיפול',
    category: 'dashboard',
    permissionSection: 'dashboard_actions',
    globalManifestEligible: true,
    permissionModal: true,
  },
  {
    token: FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN,
    line: FLEET_UI_PENDING_LINE_MAINTENANCE_FORM,
    title: 'טופס תחזוקה',
    category: 'forms',
    permissionSection: 'maintenance_forms',
    globalManifestEligible: false,
    permissionModal: true,
  },
  {
    token: FLEET_UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE_TOKEN,
    line: FLEET_UI_PENDING_LINE_FORMS_SYSTEM_STAGING_TABLE,
    title: 'טפסים — טבלת סטטוס (סטייג׳)',
    category: 'forms',
    permissionSection: 'maintenance_forms',
    globalManifestEligible: false,
    permissionModal: true,
  },
];

/**
 * טופסים סטטיים שעוקפים מניפסט — בנוסף לכל `UI_FEATURE_FORM_SYS_*` ו־`UI_FEATURE_ORG_DOC_*` (מסמכי DB).
 * לבדיקת bypass: `isFleetUiManifestBypassToken`.
 */
export const FLEET_UI_MANIFEST_BYPASS_TOKENS: readonly string[] = [
  FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN,
  FLEET_UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE_TOKEN,
  FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN,
  FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN,
  FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN,
  FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN,
];

export function isFleetUiManifestBypassToken(token: string): boolean {
  const t = String(token).trim();
  if (FLEET_UI_MANIFEST_BYPASS_TOKENS.includes(t)) return true;
  return isFleetOrgDocumentFormBypassToken(t);
}

/** מועמדים לפרסום גלובלי — נגזר מהקטלוג */
export const FLEET_UI_DEFAULT_PUBLISH_CANDIDATES: { token: string; line: string }[] = FLEET_UI_FEATURE_CATALOG.filter(
  (e) => e.globalManifestEligible
).map((e) => ({ token: e.token, line: e.line }));

/** טפסים / הרשאה אישית בלבד — לא במניפסט גלובלי */
export const FLEET_UI_PERMISSION_MODAL_EXTRA_CANDIDATES: { token: string; line: string }[] = FLEET_UI_FEATURE_CATALOG.filter(
  (e) => !e.globalManifestEligible && e.permissionModal
).map((e) => ({ token: e.token, line: e.line }));

export function fleetUiCatalogEntryByToken(token: string): FleetUiFeatureCatalogEntry | undefined {
  const t = String(token).trim();
  return FLEET_UI_FEATURE_CATALOG.find((e) => e.token === t);
}

/** כותרת ידידותית לשורת צ׳יינג׳לוג — אחרת המחרוזת המלאה */
export function fleetUiCatalogTitleForLineOrLine(line: string): string {
  const t = extractFleetUiFeatureTokenFromLine(String(line));
  if (!t) return String(line).trim();
  return fleetUiCatalogEntryByToken(t)?.title ?? String(line).trim();
}

function catalogTokensInPublishedManifest(publishedChangeLines: string[]): Set<string> {
  const s = new Set<string>();
  for (const l of publishedChangeLines) {
    const t = extractFleetUiFeatureTokenFromLine(String(l));
    if (t) s.add(t);
  }
  return s;
}

/**
 * שורות ל־«יכולות חדשות» במודאל פרסום: טוקנים מהקוד שאינם במניפסט הנוכחי + pending מ־DB (ללא כפילות טוקן).
 */
export function buildNewPublishCapabilityLines(
  publishedChangeLines: string[],
  dbPendingLines: string[],
  isProHostname: boolean
): string[] {
  const pubToks = catalogTokensInPublishedManifest(publishedChangeLines);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of FLEET_UI_FEATURE_CATALOG) {
    if (!entry.globalManifestEligible) continue;
    if (isProHostname && isFleetStagingOnlyUiTokenId(entry.token)) continue;
    if (pubToks.has(entry.token)) continue;
    out.push(entry.line);
    seen.add(entry.token);
  }

  for (const raw of dbPendingLines) {
    const line = String(raw).trim();
    if (!line) continue;
    const t = extractFleetUiFeatureTokenFromLine(line);
    if (t) {
      if (pubToks.has(t)) continue;
      if (seen.has(t)) continue;
      if (isProHostname && isFleetStagingOnlyUiTokenId(t)) continue;
      seen.add(t);
      out.push(line);
    } else if (!publishedChangeLines.some((p) => String(p).trim() === line)) {
      out.push(line);
    }
  }
  return out;
}

/** מנרמל JSONB / מחרוזת JSON / מערך / אובייקט אינדקסים / מחרוזת Postgres `{a,b}` לפני פירוק טוקנים */
export function coalesceAllowedFeaturesInput(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => /^\d+$/.test(k));
    if (keys.length > 0 && keys.length === Object.keys(o).length) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k]);
    }
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object') {
        return coalesceAllowedFeaturesInput(p);
      }
    } catch {
      /* לא JSON — אולי מחרוזת מערך Postgres text[] */
    }
    if (t.startsWith('{') && t.endsWith('}')) {
      const inner = t.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((s) => s.replace(/^["']|["']$/g, '').trim());
    }
  }
  return [];
}

/**
 * קידומת במערך `profiles.allowed_features` — חסימה אישית של פיצ'ר שמופעל אחרת מהמניפסט הגלובלי.
 * דוגמה: `"!UI_FEATURE_STAR_HEADER"`.
 */
export const FLEET_UI_FEATURE_PROFILE_DENY_PREFIX = '!' as const;

/**
 * טוקני טפסים לפני 2.7.58 — מוסיפים את הטוקנים הקנוניים המקבילים כדי לא לאבד הרשאות.
 */
const FLEET_UI_LEGACY_FORM_TOKEN_ALIASES: Record<string, readonly string[]> = {
  [FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN]: ['UI_FEATURE_FORM_SYS_RETURN'],
  [FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN]: ['UI_FEATURE_FORM_SYS_RECEPTION'],
  /** שמות טוקן לפני סנכרון דינמי מ-DB */
  UI_FEATURE_FORM_SYS_VEHICLE_POLICY: ['UI_FEATURE_FORM_SYS_USAGE_POLICY'],
  UI_FEATURE_FORM_SYS_HEALTH_STATEMENT: ['UI_FEATURE_FORM_SYS_HEALTH_DEPT'],
};

/** מערך JSONB ב־profiles.allowed_features — רק מחרוזות חיוביות UI_FEATURE_* (לא !) */
export function parseProfileAllowedFeatureTokens(raw: unknown): Set<string> {
  const s = new Set<string>();
  for (const x of coalesceAllowedFeaturesInput(raw)) {
    const t = String(x).trim();
    if (t.startsWith(FLEET_UI_FEATURE_PROFILE_DENY_PREFIX)) continue;
    if (/^UI_FEATURE_[A-Z0-9_]+$/.test(t)) s.add(t);
  }
  for (const [legacy, canon] of Object.entries(FLEET_UI_LEGACY_FORM_TOKEN_ALIASES)) {
    if (s.has(legacy)) {
      for (const c of canon) s.add(c);
    }
  }
  return s;
}

/** טוקנים שנכללים ב־console.log «Final Feature Set» בפרו */
export const FLEET_UI_LOGGED_FEATURE_TOKENS: readonly string[] = [
  FLEET_UI_FEATURE_BOLD_VERSION_TOKEN,
  FLEET_UI_FEATURE_STAR_HEADER_TOKEN,
  FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN,
  FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN,
  FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN,
  FLEET_UI_FEATURE_FORMS_SYSTEM_STAGING_TABLE_TOKEN,
  FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN,
  FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN,
  FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN,
  FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN,
];

/**
 * טוקנים חסומים אישית: עמודת `denied_features` (jsonb) + תאימות לאחור: `!UI_FEATURE_*` ב־allowed_features.
 */
export function parseProfileUiFeatureDenylist(
  allowedRaw: unknown,
  deniedColumnRaw?: unknown | null
): Set<string> {
  const s = new Set<string>();
  for (const x of coalesceAllowedFeaturesInput(allowedRaw)) {
    const t = String(x).trim();
    const m = t.match(/^!(UI_FEATURE_[A-Z0-9_]+)$/);
    if (m) s.add(m[1]);
  }
  if (deniedColumnRaw != null) {
    for (const x of coalesceAllowedFeaturesInput(deniedColumnRaw)) {
      const t = String(x).trim();
      if (/^UI_FEATURE_[A-Z0-9_]+$/.test(t)) s.add(t);
    }
  }
  return s;
}

/**
 * חסימות אישיות (`denied_features` + `!TOKEN` ב־allowed) — חלות רק לאחר אישור מול העוגן:
 * עוגן semver קלאסי: ack ≥ העוגן; עוגן פרטי `*-p…`: ack ≥ בסיס גלובלי + `fleet-pro-private-anchor-acknowledged` === מחרוזת העוגן המלאה.
 * עד אז ה-deny לא נכנס לתוקף. בלי anchor: כמו parseProfileUiFeatureDenylist.
 */
export function parseProfileUiFeatureDenylistDeferred(
  allowedRaw: unknown,
  deniedColumnRaw: unknown | null | undefined,
  anchorVersionRaw: string | null | undefined,
  proAckVersionRaw: string
): Set<string> {
  const full = parseProfileUiFeatureDenylist(allowedRaw, deniedColumnRaw);
  const anchorRaw = String(anchorVersionRaw ?? '').trim();
  if (!anchorRaw) return full;
  const ackN = normalizeVersion(String(proAckVersionRaw ?? '').trim());
  const parsed = parsePrivateUiAnchor(anchorRaw);

  if (parsed.kind === 'private') {
    let cleared = '';
    try {
      if (typeof window !== 'undefined') {
        cleared =
          window.localStorage.getItem(FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY)?.trim() ?? '';
      }
    } catch {
      /* ignore */
    }
    if (cleared !== parsed.full) return new Set<string>();
    if (!parseSemverSegments(ackN) || !parseSemverSegments(parsed.globalBase)) return new Set<string>();
    if (compareSemverExtended(ackN, parsed.globalBase) < 0) return new Set<string>();
    return full;
  }

  if (parsed.kind === 'semver') {
    const anchN = parsed.canonical;
    if (!parseSemverSegments(anchN) || !parseSemverSegments(ackN)) return full;
    if (compareSemverExtended(ackN, anchN) >= 0) return full;
    return new Set<string>();
  }

  return full;
}

/**
 * מודאל הרשאות: `allowed_features` — רק grants חיוביים (ללא !); `denied_features` — חסימת גלובליים (Globe לא מסומן).
 * טוקנים מנוהלים מוסרים מהמערכים ונבנים מחדש; ערכים לא מנוהלים נשמרים.
 */
export function mergeProfilePermissionModalPayload(
  previousAllowed: unknown,
  previousDenied: unknown,
  managedTokens: readonly string[],
  globalSet: Set<string>,
  checkedByToken: Record<string, boolean>
): { allowed_features: string[]; denied_features: string[] } {
  const managed = new Set(managedTokens);

  const existingAllowed = coalesceAllowedFeaturesInput(previousAllowed);
  const keptAllowed = existingAllowed.filter((e) => {
    const s = String(e).trim();
    const denyM = s.match(/^!(UI_FEATURE_[A-Z0-9_]+)$/);
    if (denyM) return !managed.has(denyM[1]);
    if (/^UI_FEATURE_[A-Z0-9_]+$/.test(s)) return !managed.has(s);
    return true;
  });
  const freshAllowed: string[] = [];
  for (const token of managedTokens) {
    if (globalSet.has(token)) continue;
    if (checkedByToken[token] === true) freshAllowed.push(token);
  }
  const allowed_features = [
    ...new Set([...keptAllowed.map((e) => String(e).trim()), ...freshAllowed]),
  ].sort((a, b) => a.localeCompare(b));

  const existingDenied = coalesceAllowedFeaturesInput(previousDenied);
  const keptDenied = existingDenied
    .map((e) => String(e).trim())
    .filter((s) => /^UI_FEATURE_[A-Z0-9_]+$/.test(s) && !managed.has(s));
  const freshDenied: string[] = [];
  for (const token of managedTokens) {
    if (globalSet.has(token) && checkedByToken[token] !== true) {
      freshDenied.push(token);
    }
  }
  const denied_features = [...new Set([...keptDenied, ...freshDenied])].sort((a, b) =>
    a.localeCompare(b)
  );

  return { allowed_features, denied_features };
}

/**
 * רשימת טוקנים למודאל «ניהול הרשאות» — כמו פרסום.
 * בפרודקשן: ללא טוקני staging/debug (לא ניתן להפעיל שם בכל מקרה).
 */
export function getFleetUiPermissionModalCandidates(isProHostname: boolean): { token: string; line: string }[] {
  if (!isProHostname) return [...FLEET_UI_DEFAULT_PUBLISH_CANDIDATES];
  return FLEET_UI_DEFAULT_PUBLISH_CANDIDATES.filter((c) => !isFleetStagingOnlyUiTokenId(c.token));
}

/** שורת מודאל «ניהול הרשאות» — כותרת ידידותית + מזהה טכני ב־`line` לצ׳יינג׳לוג */
export type FleetPermissionModalEditableRow = {
  token: string;
  line: string;
  title: string;
  subtitle?: string;
  hint?: string;
  indent?: boolean;
  /** מוצג ככותרת קבוצה מעל השורה (ללא צ'קבוקס) */
  sectionHeadingBefore?: string;
};

const FLEET_UI_PERMISSION_SECTION_LABELS: Record<FleetUiPermissionSection, string> = {
  header_ui: 'ממשק כותרת',
  dashboard_actions: 'פעולות דשבורד',
  maintenance_forms: 'טפסי תחזוקה',
  system_builtin_forms: 'טפסים ממסמכי ארגון (org_documents)',
  admin_debug: 'מנהל — דיבוג',
};

const FLEET_UI_PERMISSION_SECTION_ORDER: FleetUiPermissionSection[] = [
  'header_ui',
  'dashboard_actions',
  'maintenance_forms',
  'system_builtin_forms',
  'admin_debug',
];

function appendFleetUiPermissionModalStaticSections(rows: FleetPermissionModalEditableRow[]) {
  for (const sec of FLEET_UI_PERMISSION_SECTION_ORDER) {
    if (sec === 'system_builtin_forms') continue;

    const inSection = FLEET_UI_FEATURE_CATALOG.filter((e) => e.permissionModal && e.permissionSection === sec);
    let first = true;
    for (const e of inSection) {
      rows.push({
        sectionHeadingBefore: first ? FLEET_UI_PERMISSION_SECTION_LABELS[sec] : undefined,
        token: e.token,
        line: e.line,
        title: e.title,
        indent: sec === 'maintenance_forms',
      });
      first = false;
    }
  }
}

function appendFleetUiPermissionModalOrgDocumentSection(
  rows: FleetPermissionModalEditableRow[],
  orgDocPermissionEntries: FleetOrgDocumentPermissionEntry[]
) {
  const sec = 'system_builtin_forms' as const;
  let first = true;
  for (const e of orgDocPermissionEntries) {
    rows.push({
      sectionHeadingBefore: first ? FLEET_UI_PERMISSION_SECTION_LABELS[sec] : undefined,
      token: e.token,
      line: e.line,
      title: e.title,
      indent: true,
    });
    first = false;
  }
}

/** שורות מודאל הרשאות — רק קטלוג סטטי (ללא טפסים מ־org_documents). */
export function getFleetUiPermissionModalCatalogRowsOnly(): FleetPermissionModalEditableRow[] {
  const rows: FleetPermissionModalEditableRow[] = [];
  appendFleetUiPermissionModalStaticSections(rows);
  return rows;
}

/**
 * שורות מודאל הרשאות — קטלוג סטטי + מסמכים מ־`org_documents` (דינמי).
 * `orgDocPermissionEntries` מ־`buildFleetOrgDocPermissionRowsFromDocuments` אחרי fetch מ-Supabase.
 */
export function getFleetUiPermissionModalEditableCandidates(
  orgDocPermissionEntries: FleetOrgDocumentPermissionEntry[] = []
): FleetPermissionModalEditableRow[] {
  const rows: FleetPermissionModalEditableRow[] = [];
  appendFleetUiPermissionModalStaticSections(rows);
  appendFleetUiPermissionModalOrgDocumentSection(rows, orgDocPermissionEntries);
  return rows;
}

export function manifestChangesIncludeToken(lines: string[], token: string): boolean {
  const t = String(token).trim();
  if (!t) return false;
  return lines.some((line) => extractFleetUiFeatureTokenFromLine(String(line)) === t);
}

/** מוסיף שורות UI ברירת מחדל שלא קיימות כבר ב־pending (לפי טוקן) */
export function mergePendingWithDefaultUiTokens(
  existing: string[],
  options?: { omitDefaultTokens?: string[] }
): string[] {
  const next = [...existing];
  const omit = new Set(options?.omitDefaultTokens ?? []);
  const candidates = omit.size
    ? FLEET_UI_DEFAULT_PUBLISH_CANDIDATES.filter((c) => !omit.has(c.token))
    : FLEET_UI_DEFAULT_PUBLISH_CANDIDATES;
  for (const { token, line } of candidates) {
    if (!next.some((l) => String(l).includes(token))) {
      next.push(line);
    }
  }
  return next;
}

/** מזהה טוקן UI_FEATURE_* בשורת צ׳יינג׳לוג */
export function extractFleetUiFeatureTokenFromLine(line: string): string | null {
  const m = String(line).match(/UI_FEATURE_[A-Z0-9_]+/);
  return m ? m[0] : null;
}

/**
 * טוקני UI_FEATURE_* המופיעים במניפסט הגלובלי (אחרי הסרת שורות staging/debug בדומיין פרו).
 */
export function globalManifestUiFeatureTokenSet(
  changeLines: string[],
  isFleetManagerProHostname: boolean
): Set<string> {
  const trimmed = changeLines.map((s) => String(s).trim()).filter((s) => s.length > 0);
  const lines = stripFleetStagingOnlyLinesForProHostname(trimmed, isFleetManagerProHostname);
  const s = new Set<string>();
  for (const line of lines) {
    const t = extractFleetUiFeatureTokenFromLine(line);
    if (t && /^UI_FEATURE_[A-Z0-9_]+$/.test(t)) s.add(t);
  }
  return s;
}

/**
 * מאחד שורות שכבר פורסמו (מניפסט נוכחי) + pending, בלי כפילויות לפי טוקן;
 * אחר כך משלים שורות ברירת מחדל חסרות (mergePendingWithDefaultUiTokens).
 */
export function mergePublishedPendingAndDefaultUiTokens(
  publishedChanges: string[],
  pendingChanges: string[],
  options?: { omitDefaultTokens?: string[] }
): string[] {
  const published = publishedChanges.map((s) => String(s).trim()).filter((s) => s.length > 0);
  const pending = pendingChanges.map((s) => String(s).trim()).filter((s) => s.length > 0);

  const acc: string[] = [];
  const tokensSeen = new Set<string>();

  const addLine = (line: string) => {
    const t = extractFleetUiFeatureTokenFromLine(line);
    if (t) {
      if (tokensSeen.has(t)) return;
      tokensSeen.add(t);
    } else if (acc.some((x) => x === line)) {
      return;
    }
    acc.push(line);
  };

  for (const line of published) addLine(line);
  for (const line of pending) addLine(line);

  return mergePendingWithDefaultUiTokens(acc, options);
}

/** מסיר מ־pending שורות שטוקן שלהן כבר ב־changes שפורסמו */
export function removePendingLinesPublishedInChanges(
  pendingLines: string[],
  publishedChangeLines: string[]
): string[] {
  const publishedTokens = new Set(
    publishedChangeLines
      .map((l) => extractFleetUiFeatureTokenFromLine(l))
      .filter((t): t is string => Boolean(t))
  );
  return pendingLines
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0)
    .filter((line) => {
      const t = extractFleetUiFeatureTokenFromLine(line);
      if (!t) {
        return !publishedChangeLines.some((c) => c.trim() === line);
      }
      return !publishedTokens.has(t);
    });
}

/** מאחד שני מערכי pending בלי כפילויות לפי טוקן */
/**
 * מועמדים לפרסום: רק שורות שעדיין לא במניפסט (לפי טוקן) — לא מציגים שוב פיצ'רים שכבר פורסמו כ־checkbox.
 */
export function buildPendingOnlyPublishCandidates(
  pendingChanges: string[],
  publishedChanges: string[],
  options?: { omitDefaultTokens?: string[]; isProPublishHost?: boolean }
): string[] {
  const published = publishedChanges.map((s) => String(s).trim()).filter((s) => s.length > 0);
  const publishedTokens = new Set(
    published.map((l) => extractFleetUiFeatureTokenFromLine(l)).filter((t): t is string => Boolean(t))
  );
  const pendingTrim = pendingChanges.map((s) => String(s).trim()).filter((s) => s.length > 0);
  const merged = mergePendingWithDefaultUiTokens(pendingTrim, options);
  const next = merged.filter((line) => {
    const t = extractFleetUiFeatureTokenFromLine(line);
    if (t) return !publishedTokens.has(t);
    return !published.some((p) => p === line.trim());
  });
  return stripFleetStagingOnlyLinesForProHostname(next, Boolean(options?.isProPublishHost));
}

export function mergeUniquePendingChangeLines(a: string[], b: string[]): string[] {
  const acc: string[] = [];
  const tokensSeen = new Set<string>();
  const add = (line: string) => {
    const s = String(line).trim();
    if (!s) return;
    const t = extractFleetUiFeatureTokenFromLine(s);
    if (t) {
      if (tokensSeen.has(t)) return;
      tokensSeen.add(t);
    } else if (acc.some((x) => x === s)) return;
    acc.push(s);
  };
  for (const x of a) add(x);
  for (const x of b) add(x);
  return acc;
}

const FLEET_PUBLISH_ALWAYS_DEFAULT_CHECKED_TOKENS: string[] = [
  FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN,
  FLEET_UI_FEATURE_STAR_HEADER_TOKEN,
];

/**
 * ברירת מחדל לסימון במודאל פרסום:
 * - אין עדיין שורות במניפסט שפורסם: הכל מסומן (התקנה ראשונה).
 * - אחרת: מסומן אם השורה הייתה ב־published או ב־pending (נשארת פעילה), או טוקן "שחזור" (TREATMENT / STAR).
 * - שורות חדשות רק מברירת מחדל: לא מסומנות — אלא אם כן תוסיף אותן מ־pending או תסמן ידנית.
 */
export function buildPublishCheckboxDefaults(
  candidates: string[],
  publishedChanges: string[],
  pendingChanges: string[]
): boolean[] {
  const pub = publishedChanges.map((s) => String(s).trim()).filter((s) => s.length > 0);
  const pend = pendingChanges.map((s) => String(s).trim()).filter((s) => s.length > 0);

  if (pub.length === 0) {
    return candidates.map(() => true);
  }

  return candidates.map((line) => {
    const token = extractFleetUiFeatureTokenFromLine(line);
    if (token && FLEET_PUBLISH_ALWAYS_DEFAULT_CHECKED_TOKENS.includes(token)) {
      return true;
    }
    if (token) {
      return pub.some((l) => l.includes(token)) || pend.some((l) => l.includes(token));
    }
    const trimmed = line.trim();
    return pub.includes(trimmed) || pend.includes(trimmed);
  });
}
