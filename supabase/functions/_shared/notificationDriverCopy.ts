import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DRIVER_COPY_PREF_KEY,
  parseTopicPrefs,
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
): boolean {
  for (const [emailKey, row] of Object.entries(prefs)) {
    if (!want.has(emailKey)) continue;
    if (row && typeof row === 'object' && row[DRIVER_COPY_PREF_KEY] === true) {
      return true;
    }
  }
  return false;
}

/**
 * האם יש לפחות כתובת staff שמקבלת את המייל ומסומנת «עותק לנהג» (באחת משורות הניתוב או ב-legacy).
 */
export async function shouldAppendDriverCopyForRecipients(
  admin: SupabaseClient,
  orgId: string | null | undefined,
  recipientEmails: string[],
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
        const prefs = parseTopicPrefs(r?.topic_prefs);
        if (driverCopyTrueForRecipientsInPrefs(prefs, want)) return true;
      }
    }
  }

  try {
    const { data } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_email_topic_prefs')
      .maybeSingle();
    const prefs = parseTopicPrefs((data as { value?: unknown } | null)?.value);
    if (driverCopyTrueForRecipientsInPrefs(prefs, want)) return true;
  } catch {
    // ignore
  }
  return false;
}
