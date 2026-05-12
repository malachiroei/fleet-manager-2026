/**
 * ניתוב התראות מייל: רשימת כתובות גלובלית + העדפות נושא לכל כתובת (ברירת מחדל: הכול מופעל).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';

export const NOTIFICATION_EMAIL_TOPIC_PREFS_KEY = 'notification_email_topic_prefs' as const;

export const NOTIFICATION_EMAIL_TOPIC_IDS = [
  'handover_form',
  'handover_wizard',
  'mileage_update',
  'maintenance_update',
  'vehicle_test_license',
  'vehicle_insurance',
  'vehicle_tires',
  'fleet_misc_updates',
  'vehicle_periodic_inspection',
  'driver_license_docs_update',
  'compliance_driver_copy',
  'compliance_vehicle_renewal_copy',
  'document_share_copy',
] as const;
export type NotificationEmailTopicId = (typeof NOTIFICATION_EMAIL_TOPIC_IDS)[number];

function tryParseJsonUnknown(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** מפתח JSON ב-topic_prefs — legacy: עותק לנהג לכל הנושאים */
export const DRIVER_COPY_PREF_KEY = 'driver_copy' as const;

/** מפתח JSON — עותק לנהג לפי נושא (legacy: בתוך שורת מייל) */
export const DRIVER_COPY_BY_TOPIC_PREF_KEY = 'driver_copy_by_topic' as const;

/** מפתח ברמת מסמך topic_prefs — עותק לנהג פעם אחת לכל סוג התראה (מומלץ) */
export const DRIVER_COPY_TOPICS_META_ROOT_KEY = '__driver_copy_topics__' as const;

export type NotificationEmailPrefsRow = Partial<Record<NotificationEmailTopicId, boolean>> & {
  [DRIVER_COPY_PREF_KEY]?: boolean;
  [DRIVER_COPY_BY_TOPIC_PREF_KEY]?: Partial<Record<NotificationEmailTopicId, boolean>>;
};

/** תוויות לעברית — מסך הגדרות (קצר, כמו בשיחה עם המשתמש) */
export const NOTIFICATION_EMAIL_TOPIC_LABELS_HE: Record<NotificationEmailTopicId, string> = {
  handover_form: 'מסירת רכב (PDF)',
  handover_wizard: 'מסירת רכב (אשף)',
  mileage_update: 'דיווח ק״מ',
  maintenance_update: 'עדכון טיפול',
  vehicle_test_license: 'רישוי שנתי',
  vehicle_insurance: 'ביטוח',
  vehicle_tires: 'צמיגים',
  fleet_misc_updates: 'שטיפה וכו׳',
  vehicle_periodic_inspection: 'ביקורת תקופתית',
  driver_license_docs_update: 'רישיון נהיגה',
  compliance_driver_copy: 'צוות: מייל לנהג (BCC)',
  compliance_vehicle_renewal_copy: 'צוות: חידוש רכב (BCC)',
  document_share_copy: 'צוות: קישור למסמך (BCC)',
};

export type NotificationEmailTopicPrefsMap = Record<string, NotificationEmailPrefsRow>;

function topicFlagsOnlyFromRow(existing?: NotificationEmailPrefsRow): Partial<Record<NotificationEmailTopicId, boolean>> {
  if (!existing) return {};
  const out: Partial<Record<NotificationEmailTopicId, boolean>> = {};
  for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
    const b = existing[tid];
    if (typeof b === 'boolean') out[tid] = b;
  }
  return out;
}

/** עותק לנהג גלובלי לפי נושא מתוך topic_prefs הגולמי (מפתח שורש בלי @) */
export function parseDriverCopyTopicsMeta(value: unknown): Partial<Record<NotificationEmailTopicId, boolean>> {
  let root: unknown = value;
  if (typeof root === 'string') {
    const parsed = tryParseJsonUnknown(root.trim());
    if (parsed !== undefined) root = parsed;
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return {};
  const meta = (root as Record<string, unknown>)[DRIVER_COPY_TOPICS_META_ROOT_KEY];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out: Partial<Record<NotificationEmailTopicId, boolean>> = {};
  for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
    const b = (meta as Record<string, unknown>)[tid];
    if (typeof b === 'boolean') out[tid] = b;
  }
  return out;
}

/** לאיחוד טעינה: מטא שורש + legacy פר־מייל */
export function mergeDriverMetaFromLegacyPrefs(
  prefs: NotificationEmailTopicPrefsMap,
  rawTopicPrefs: unknown,
): Partial<Record<NotificationEmailTopicId, boolean>> {
  const out: Partial<Record<NotificationEmailTopicId, boolean>> = { ...parseDriverCopyTopicsMeta(rawTopicPrefs) };
  for (const row of Object.values(prefs)) {
    if (!row) continue;
    if (row[DRIVER_COPY_PREF_KEY] === true) {
      for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) out[tid] = true;
    }
    const dct = row[DRIVER_COPY_BY_TOPIC_PREF_KEY];
    if (dct && typeof dct === 'object') {
      for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
        if (dct[tid] === true) out[tid] = true;
      }
    }
  }
  return out;
}

/** מסמך JSON לשמירה ב-topic_prefs: מפתחות מייל + מטא עותק לנהג */
export function buildTopicPrefsDocumentForDb(
  emailPrefs: NotificationEmailTopicPrefsMap,
  driverMeta: Partial<Record<NotificationEmailTopicId, boolean>>,
): Record<string, unknown> {
  const metaOut: Record<string, boolean> = {};
  for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
    if (driverMeta[tid] === true) metaOut[tid] = true;
  }
  const doc: Record<string, unknown> = {};
  if (Object.keys(metaOut).length > 0) {
    doc[DRIVER_COPY_TOPICS_META_ROOT_KEY] = metaOut;
  }
  for (const [k, row] of Object.entries(emailPrefs)) {
    if (!k.includes('@')) continue;
    const clean: Record<string, boolean> = {};
    for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
      const b = row[tid];
      if (typeof b === 'boolean') clean[tid] = b;
    }
    doc[k] = clean;
  }
  return doc;
}

export function defaultTopicFlagsTrue(): Record<NotificationEmailTopicId, boolean> {
  return Object.fromEntries(NOTIFICATION_EMAIL_TOPIC_IDS.map((id) => [id, true])) as Record<
    NotificationEmailTopicId,
    boolean
  >;
}

export function normalizeNotificationEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmailsFromTextarea(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && e.includes('@'));
}

/** מערך מיילים מתוך עמודת jsonb / תגובת RPC — כולל מחרוזת JSON או אלמנטים לא-מחרוזתיים */
export function parseNotificationEmailList(raw: unknown): string[] {
  let v: unknown = raw;
  if (typeof v === 'string') {
    const parsed = tryParseJsonUnknown(v.trim());
    if (parsed !== undefined) v = parsed;
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (typeof e === 'string' ? e : e == null ? '' : String(e)))
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));
}

export function parseTopicPrefs(value: unknown): NotificationEmailTopicPrefsMap {
  let root: unknown = value;
  if (typeof root === 'string') {
    const parsed = tryParseJsonUnknown(root.trim());
    if (parsed !== undefined) root = parsed;
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return {};
  const out: NotificationEmailTopicPrefsMap = {};
  for (const [k, v] of Object.entries(root as Record<string, unknown>)) {
    if (!k.includes('@')) continue;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) continue;
    const flags: NotificationEmailPrefsRow = {};
    for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
      const b = (v as Record<string, unknown>)[tid];
      if (typeof b === 'boolean') flags[tid] = b;
    }
    const dc = (v as Record<string, unknown>)[DRIVER_COPY_PREF_KEY];
    if (typeof dc === 'boolean') flags[DRIVER_COPY_PREF_KEY] = dc;
    const rawDct = (v as Record<string, unknown>)[DRIVER_COPY_BY_TOPIC_PREF_KEY];
    if (rawDct && typeof rawDct === 'object' && !Array.isArray(rawDct)) {
      const byTopic: Partial<Record<NotificationEmailTopicId, boolean>> = {};
      for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
        const b = (rawDct as Record<string, unknown>)[tid];
        if (typeof b === 'boolean') byTopic[tid] = b;
      }
      flags[DRIVER_COPY_BY_TOPIC_PREF_KEY] = byTopic;
    }
    out[normalizeNotificationEmailKey(k)] = flags;
  }
  return out;
}

/** כתובות המנויות לנושא (רק אם לא הוגדר false; חסר = כן) */
export function emailsSubscribedToTopic(
  emails: string[],
  prefs: NotificationEmailTopicPrefsMap,
  topic: NotificationEmailTopicId
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim();
    if (!e.includes('@')) continue;
    const key = normalizeNotificationEmailKey(e);
    const row = prefs[key];
    const allowed = row?.[topic] !== false;
    if (!allowed) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** מוסיף ברירות מחדל לכתובות חדשות ומסיר כתובות שלא ברשימה */
export function mergeTopicPrefsForNewEmails(
  prev: NotificationEmailTopicPrefsMap,
  emails: string[]
): NotificationEmailTopicPrefsMap {
  const defaults = defaultTopicFlagsTrue();
  const next: NotificationEmailTopicPrefsMap = {};
  for (const email of emails) {
    const key = normalizeNotificationEmailKey(email);
    if (!key.includes('@')) continue;
    const existing = prev[key];
    next[key] = { ...defaults, ...topicFlagsOnlyFromRow(existing) };
  }
  return next;
}

export const USER_ORG_NOTIFICATION_ROUTING_TABLE = 'user_org_notification_routing' as const;

/** מאחד את כל שורות הניתוב של הארגון לנושא אחד (חברי הארגון רואים את כל השורות — RLS). */
export async function fetchMergedOrgNotificationEmailsForTopic(
  supabase: SupabaseClient,
  orgId: string | null | undefined,
  topic: NotificationEmailTopicId,
): Promise<string[]> {
  const oid = (orgId ?? '').trim();
  if (!oid) return [];
  const { data: rows, error } = await supabase
    .from(USER_ORG_NOTIFICATION_ROUTING_TABLE)
    .select('emails, topic_prefs')
    .eq('org_id', oid);
  if (error || !Array.isArray(rows) || rows.length === 0) return [];
  const merged: string[] = [];
  for (const r of rows as { emails?: unknown; topic_prefs?: unknown }[]) {
    const list = parseNotificationEmailList(r?.emails);
    const prefs = parseTopicPrefs(r?.topic_prefs);
    merged.push(...emailsSubscribedToTopic(list, prefs, topic));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of merged) {
    const t = e.trim();
    if (!t.includes('@')) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** ניתוב מיילים: קודם per-org (כל אדמין), אחר כך legacy ב-system_settings, אחרון fallback */
export async function resolveNotificationEmailsForTopic(
  supabase: SupabaseClient,
  topic: NotificationEmailTopicId,
  fallbackEmails: string[],
  orgId?: string | null,
): Promise<string[]> {
  const fromOrg = await fetchMergedOrgNotificationEmailsForTopic(supabase, orgId ?? null, topic);
  if (fromOrg.length > 0) return fromOrg;
  try {
    const [emRes, prefRes] = await Promise.all([
      supabase.from(FLEET_KV_TABLE).select('value').eq('key', 'notification_emails').maybeSingle(),
      supabase.from(FLEET_KV_TABLE).select('value').eq('key', NOTIFICATION_EMAIL_TOPIC_PREFS_KEY).maybeSingle(),
    ]);
    const list = parseNotificationEmailList(emRes.data?.value);
    const prefs = parseTopicPrefs(prefRes.data?.value);
    const filtered = emailsSubscribedToTopic(list, prefs, topic);
    if (filtered.length > 0) return filtered;
  } catch {
    // ignore
  }
  return fallbackEmails.map((e) => e.trim()).filter((e) => e.includes('@'));
}
