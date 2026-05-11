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

/** תוויות לעברית — מסך הגדרות */
export const NOTIFICATION_EMAIL_TOPIC_LABELS_HE: Record<NotificationEmailTopicId, string> = {
  handover_form: 'טופס מסירה / החזרה (PDF + הודעת מערכת)',
  handover_wizard: 'אשף מסירה דיגיטלי (מסמכים לנהג + עותק צוות)',
  mileage_update: 'עדכון ק״מ מהשטח',
  maintenance_update: 'עדכון טיפול',
  vehicle_test_license: 'טסט / רישיון רכב (עדכון מהיר)',
  vehicle_insurance: 'ביטוח (עדכון מהיר)',
  vehicle_tires: 'צמיגים (עדכון מהיר)',
  fleet_misc_updates: 'אחר (שטיפה וכו׳ — עדכון מהיר)',
  vehicle_periodic_inspection: 'ביקורת תקופתית',
  driver_license_docs_update: 'רישיון נהיגה / סריקות נהג',
  compliance_driver_copy: 'ציות: מייל לנהג (עותק צוות • BCC)',
  compliance_vehicle_renewal_copy: 'ציות: חידוש רכב (עותק צוות • BCC)',
  document_share_copy: 'שיתוף קישור למסמך (עותק צוות • BCC)',
};

export type NotificationEmailTopicPrefsMap = Record<
  string,
  Partial<Record<NotificationEmailTopicId, boolean>>
>;

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

function tryParseJsonUnknown(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
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
    const flags: Partial<Record<NotificationEmailTopicId, boolean>> = {};
    for (const tid of NOTIFICATION_EMAIL_TOPIC_IDS) {
      const b = (v as Record<string, unknown>)[tid];
      if (typeof b === 'boolean') flags[tid] = b;
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
    next[key] = { ...defaults, ...(existing ?? {}) };
  }
  return next;
}

/** טוען מ-system_settings ומסנן לפי נושא; אם אין כלום — מחזיר fallback */
export async function resolveNotificationEmailsForTopic(
  supabase: SupabaseClient,
  topic: NotificationEmailTopicId,
  fallbackEmails: string[]
): Promise<string[]> {
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
