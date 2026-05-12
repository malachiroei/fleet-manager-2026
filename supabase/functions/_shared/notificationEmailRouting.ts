/**
 * עותק לוגיקה ל-Edge Functions (Deno) — לשמור מסונכן עם src/lib/notificationEmailRouting.ts
 */

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

/** מפתח JSON ב-topic_prefs — legacy: עותק לנהג לכל הנושאים */
export const DRIVER_COPY_PREF_KEY = 'driver_copy' as const;

/** מפתח JSON — עותק לנהג לפי נושא (legacy: בתוך שורת מייל) */
export const DRIVER_COPY_BY_TOPIC_PREF_KEY = 'driver_copy_by_topic' as const;

/** מפתח ברמת מסמך topic_prefs — עותק לנהג פעם אחת לכל סוג התראה */
export const DRIVER_COPY_TOPICS_META_ROOT_KEY = '__driver_copy_topics__' as const;

export type NotificationEmailPrefsRow = Partial<Record<NotificationEmailTopicId, boolean>> & {
  [DRIVER_COPY_PREF_KEY]?: boolean;
  [DRIVER_COPY_BY_TOPIC_PREF_KEY]?: Partial<Record<NotificationEmailTopicId, boolean>>;
};

export type NotificationEmailTopicPrefsMap = Record<string, NotificationEmailPrefsRow>;

function normalizeNotificationEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function tryParseJsonUnknown(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

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

export function emailsSubscribedToTopic(
  emails: string[],
  prefs: NotificationEmailTopicPrefsMap,
  topic: NotificationEmailTopicId,
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

export function coerceEmailTopic(raw: unknown): NotificationEmailTopicId {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if ((NOTIFICATION_EMAIL_TOPIC_IDS as readonly string[]).includes(s)) {
    return s as NotificationEmailTopicId;
  }
  return 'fleet_misc_updates';
}
