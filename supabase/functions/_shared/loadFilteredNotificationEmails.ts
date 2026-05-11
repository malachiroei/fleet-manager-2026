import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  emailsSubscribedToTopic,
  parseNotificationEmailList,
  parseTopicPrefs,
  type NotificationEmailTopicId,
} from './notificationEmailRouting.ts';

/** כתובות מ-notification_emails שמופעלות לנושא (לפי notification_email_topic_prefs). */
export async function loadFilteredNotificationEmails(
  admin: SupabaseClient,
  topic: NotificationEmailTopicId,
): Promise<string[]> {
  const [emRes, prefRes] = await Promise.all([
    admin.from('system_settings').select('value').eq('key', 'notification_emails').maybeSingle(),
    admin.from('system_settings').select('value').eq('key', 'notification_email_topic_prefs').maybeSingle(),
  ]);
  const list = parseNotificationEmailList((emRes as { data?: { value?: unknown } | null }).data?.value);
  const prefs = parseTopicPrefs((prefRes as { data?: { value?: unknown } | null }).data?.value);
  return emailsSubscribedToTopic(list, prefs, topic);
}

export function uniqueEmailList(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = String(raw ?? '').trim();
    if (!e.includes('@')) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** כתובות BCC שלא זהות למקבלי to */
export function bccExcludingPrimary(primary: string[], candidates: string[]): string[] {
  const p = new Set(primary.map((e) => e.trim().toLowerCase()));
  const out = uniqueEmailList(candidates).filter((e) => !p.has(e.trim().toLowerCase()));
  return out;
}
