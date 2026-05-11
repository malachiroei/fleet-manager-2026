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

function normalizeNotificationEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

type NotificationEmailTopicPrefsMap = Record<
  string,
  Partial<Record<NotificationEmailTopicId, boolean>>
>;

export function parseNotificationEmailList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is string => typeof e === 'string' && e.includes('@'))
    .map((e) => e.trim())
    .filter(Boolean);
}

export function parseTopicPrefs(value: unknown): NotificationEmailTopicPrefsMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: NotificationEmailTopicPrefsMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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
