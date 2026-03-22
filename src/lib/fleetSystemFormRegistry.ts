/**
 * רישום דינמי של הרשאות טופס — נגזר מ־`public.org_documents`.
 * כל שורה במסד → טוקן UI_FEATURE_* יציב; הכותרת לתצוגה מגיעה מ־`title` ב-DB.
 * אין צורך בעדכון קוד כשמוסיפים מסמך חדש (למעט מפתחות builtin ידועים — ראו BUILTIN_TEMPLATE_KEY_TO_TOKEN_SUFFIX).
 */

export type FleetOrgDocumentLike = {
  id: string;
  title: string;
  /** שם תצוגה חלופי (אם קיים ב-DB — עדיפות על `title`) */
  name?: string | null;
  json_schema?: Record<string, unknown> | null;
  sort_order?: number;
  is_active?: boolean;
};

export type FleetOrgDocumentPermissionEntry = {
  orgDocumentId: string;
  token: string;
  /** כותרת מ־DB (למודאל ניהול צוות / הרשאות) */
  title: string;
  line: string;
};

/** מפתח builtin ב־json_schema → סיומת טוקן אחרי UI_FEATURE_FORM_SYS_ (תאימות + שמות מבוקשים) */
export const BUILTIN_TEMPLATE_KEY_TO_TOKEN_SUFFIX: Record<string, string> = {
  'system-return-form': 'RETURN',
  'system-reception-form': 'RECEPTION',
  'system-replacement-usage': 'REPLACEMENT_USAGE',
  'system-health-statement': 'HEALTH_DEPT',
  'system-health-employee': 'HEALTH_EMPLOYEE',
  'system-health-family': 'HEALTH_FAMILY',
  'system-upgrade-request': 'UPGRADE_REQUEST',
  'system-vehicle-policy': 'USAGE_POLICY',
  'system-practical-driving-test': 'PRACTICAL_DRIVING_TEST',
  'system-traffic-liability-annex': 'APPENDIX_A',
};

const LEGACY_SUFFIX_ALIASES: Record<string, string> = {
  /** לפני שינוי שם ל־USAGE_POLICY */
  VEHICLE_POLICY: 'USAGE_POLICY',
  /** לפני שינוי ל־HEALTH_DEPT */
  HEALTH_STATEMENT: 'HEALTH_DEPT',
};

export function extractBuiltinTemplateKey(schema: unknown): string | null {
  if (!schema || typeof schema !== 'object') return null;
  const raw = (schema as Record<string, unknown>).builtin_template_key;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s || null;
}

/** סיומת טוקן ממפתח builtin (או ניחוש מ־system-* אם לא במפה) */
export function tokenSuffixFromBuiltinTemplateKey(builtinKey: string): string {
  const k = builtinKey.trim();
  if (!k) return 'UNKNOWN';
  const mapped = BUILTIN_TEMPLATE_KEY_TO_TOKEN_SUFFIX[k];
  if (mapped) return mapped;
  if (k.startsWith('system-')) {
    const tail = k.slice('system-'.length);
    const guessed = tail
      .split('-')
      .filter(Boolean)
      .map((p) => p.toUpperCase())
      .join('_');
    return guessed || 'UNKNOWN';
  }
  return k
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.toUpperCase())
    .join('_');
}

/** טוקן יציב למסמך עם builtin_template_key */
export function uiFeatureTokenForBuiltinKey(builtinKey: string): string {
  let suffix = tokenSuffixFromBuiltinTemplateKey(builtinKey);
  const alias = LEGACY_SUFFIX_ALIASES[suffix];
  if (alias) suffix = alias;
  return `UI_FEATURE_FORM_SYS_${suffix}`;
}

/** מסמך ללא builtin — טוקן ייחודי לפי מזהה השורה ב-DB */
export function uiFeatureTokenForOrgDocumentId(documentId: string): string {
  const hex = String(documentId).replace(/-/g, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hex)) {
    const safe = String(documentId).replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'UNKNOWN';
    return `UI_FEATURE_ORG_DOC_${safe.toUpperCase()}`;
  }
  return `UI_FEATURE_ORG_DOC_${hex.toUpperCase()}`;
}

/** טוקן UI_FEATURE_* למסמך ארגון */
export function uiFeatureTokenForOrgDocument(doc: FleetOrgDocumentLike): string {
  const builtin = extractBuiltinTemplateKey(doc.json_schema);
  if (builtin) return uiFeatureTokenForBuiltinKey(builtin);
  return uiFeatureTokenForOrgDocumentId(doc.id);
}

/**
 * בונה רשימת הרשאות מכל שורות org_documents.
 * כפילות טוקן (אותו builtin בשני שורות): נשמרת רק הראשונה לפי sort_order.
 */
export function buildFleetOrgDocPermissionRowsFromDocuments(
  docs: readonly FleetOrgDocumentLike[]
): FleetOrgDocumentPermissionEntry[] {
  const sorted = [...docs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const seen = new Set<string>();
  const out: FleetOrgDocumentPermissionEntry[] = [];

  for (const d of sorted) {
    const token = uiFeatureTokenForOrgDocument(d);
    if (seen.has(token)) continue;
    seen.add(token);

    const rawName = String(d.name ?? '').replace(/\s+/g, ' ').trim();
    const rawTitle = String(d.title ?? '').replace(/\s+/g, ' ').trim();
    let title = (rawName || rawTitle).trim();
    if (d.is_active === false) {
      title = title ? `${title} (לא פעיל)` : '(לא פעיל)';
    }
    if (!title) title = token;

    out.push({
      orgDocumentId: d.id,
      token,
      title,
      line: `${token} — ${title}`,
    });
  }

  return out;
}

/** האם הטוקן נחשב «טופס/מסמך ארגון» שעוקף מניפסט גלובלי (הרשאה אישית בלבד) */
export function isFleetOrgDocumentFormBypassToken(token: string): boolean {
  const t = String(token).trim();
  if (/^UI_FEATURE_FORM_SYS_[A-Z0-9_]+$/.test(t)) return true;
  if (/^UI_FEATURE_ORG_DOC_[A-Z0-9]+$/.test(t)) return true;
  return false;
}
