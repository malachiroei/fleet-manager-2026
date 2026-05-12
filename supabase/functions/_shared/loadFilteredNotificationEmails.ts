import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  emailsSubscribedToTopic,
  parseNotificationEmailList,
  parseTopicPrefs,
  type NotificationEmailTopicId,
} from './notificationEmailRouting.ts';

async function loadLegacyGlobalFiltered(
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

/**
 * כתובות מנותבות לפי נושא:
 * - אם יש `orgId`: מאחד את כל שורות user_org_notification_routing של הארגון (כל אדמין + ההעדפות שלו).
 * - אם אין תוצאות — נופל ל-legacy ב-system_settings (התאמה לאחור).
 */
export async function loadFilteredNotificationEmails(
  admin: SupabaseClient,
  topic: NotificationEmailTopicId,
  orgId?: string | null,
): Promise<string[]> {
  const oid = typeof orgId === 'string' ? orgId.trim() : '';
  if (oid) {
    const { data: rows, error } = await admin
      .from('user_org_notification_routing')
      .select('emails, topic_prefs')
      .eq('org_id', oid);
    if (!error && Array.isArray(rows) && rows.length > 0) {
      const merged: string[] = [];
      for (const r of rows as { emails?: unknown; topic_prefs?: unknown }[]) {
        const list = parseNotificationEmailList(r?.emails);
        const prefs = parseTopicPrefs(r?.topic_prefs);
        merged.push(...emailsSubscribedToTopic(list, prefs, topic));
      }
      const u = uniqueEmailList(merged);
      if (u.length > 0) return u;
    }
  }
  return await loadLegacyGlobalFiltered(admin, topic);
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
