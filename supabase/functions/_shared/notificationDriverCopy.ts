import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DRIVER_COPY_BY_TOPIC_PREF_KEY,
  DRIVER_COPY_PREF_KEY,
  parseDriverCopyTopicsMeta,
  parseTopicPrefs,
  type NotificationEmailTopicId,
  type NotificationEmailTopicPrefsMap,
} from './notificationEmailRouting.ts';

function recipientKeySet(recipientEmails: string[]): Set<string> {
  const s = new Set<string>();
  for (const raw of recipientEmails) {
    const k = String(raw ?? '').trim().toLowerCase();
    if (k.includes('@')) s.add(k);
  }
  return s;
}

function driverCopyTrueForRecipientsInPrefs(
  prefs: NotificationEmailTopicPrefsMap,
  want: Set<string>,
  topic: NotificationEmailTopicId,
): boolean {
  for (const [emailKey, row] of Object.entries(prefs)) {
    if (!want.has(emailKey)) continue;
    if (!row || typeof row !== 'object') continue;
    const dct = row[DRIVER_COPY_BY_TOPIC_PREF_KEY];
    if (dct && typeof dct === 'object' && dct[topic] === true) return true;
    if (row[DRIVER_COPY_PREF_KEY] === true) return true;
  }
  return false;
}

function routingRowTouchesRecipients(prefs: NotificationEmailTopicPrefsMap, want: Set<string>): boolean {
  for (const k of Object.keys(prefs)) {
    if (want.has(k)) return true;
  }
  return false;
}

function driverCopyFromRoutingRow(
  raw: unknown,
  prefs: NotificationEmailTopicPrefsMap,
  want: Set<string>,
  topic: NotificationEmailTopicId,
): boolean {
  if (parseDriverCopyTopicsMeta(raw)[topic] === true && routingRowTouchesRecipients(prefs, want)) {
    return true;
  }
  return driverCopyTrueForRecipientsInPrefs(prefs, want, topic);
}

/**
 * האם יש לפחות כתובת staff ברשימת הנמענים שמסומנת «עותק לנהג» לאותו נושא (או legacy driver_copy לכל הנושאים).
 */
export async function shouldAppendDriverCopyForRecipients(
  admin: SupabaseClient,
  orgId: string | null | undefined,
  recipientEmails: string[],
  topic: NotificationEmailTopicId,
): Promise<boolean> {
  const want = recipientKeySet(recipientEmails);
  if (want.size === 0) return false;

  const oid = String(orgId ?? '').trim();
  if (oid) {
    const { data: rows, error } = await admin
      .from('user_org_notification_routing')
      .select('topic_prefs')
      .eq('org_id', oid);
    if (!error && Array.isArray(rows)) {
      for (const r of rows as { topic_prefs?: unknown }[]) {
        const raw = r?.topic_prefs;
        const prefs = parseTopicPrefs(raw);
        if (driverCopyFromRoutingRow(raw, prefs, want, topic)) return true;
      }
    }
  }

  try {
    const { data } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_email_topic_prefs')
      .maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const prefs = parseTopicPrefs(raw);
    if (driverCopyFromRoutingRow(raw, prefs, want, topic)) return true;
  } catch {
    // ignore
  }
  return false;
}
