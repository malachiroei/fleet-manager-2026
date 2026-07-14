/**
 * Notify org staff when a Procedure 6 complaint status changes.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from './emailBrandHeader.ts';
import {
  bccExcludingPrimary,
  loadFilteredNotificationEmails,
  uniqueEmailList,
} from './loadFilteredNotificationEmails.ts';
import { procedure6ManagerActionButtonsHtml } from './procedure6ManagerActions.ts';

const DEFAULT_FROM = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

export type Procedure6StatusUpdateFields = {
  org_id: string;
  vehicle_number?: string | null;
  report_date_time?: string | null;
  location?: string | null;
  description?: string | null;
  reporter_name?: string | null;
  driver_name?: string | null;
  driver_response?: string | null;
  action_taken?: string | null;
  previous_status?: string | null;
  status: string;
  report_id?: string | null;
  /** When set and status is in_progress, include manager close/clarify CTAs */
  response_token?: string | null;
  include_manager_actions?: boolean;
};

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtWhen(iso: string | null | undefined): string {
  const t = String(iso ?? '').trim();
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return escHtml(t);
  return escHtml(d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }));
}

export function procedure6StatusLabelHe(status: string | null | undefined): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'closed' || s === 'resolved') return 'סגור';
  if (s === 'in_progress' || s === 'pending') return 'בטיפול';
  if (s === 'open') return 'פתוח';
  return status?.trim() || '—';
}

export async function notifyProcedure6StatusUpdate(
  admin: SupabaseClient,
  complaint: Procedure6StatusUpdateFields,
): Promise<{ sent: boolean; to: string[]; error?: string }> {
  const orgId = String(complaint.org_id ?? '').trim();
  if (!orgId) return { sent: false, to: [], error: 'missing org_id' };

  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!resendApiKey) return { sent: false, to: [], error: 'missing RESEND_API_KEY' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const recipients = uniqueEmailList(
    await loadFilteredNotificationEmails(admin, 'procedure6_complaints', orgId),
  );
  if (recipients.length === 0) {
    return { sent: false, to: [], error: 'no_recipients' };
  }

  const plate = escHtml(complaint.vehicle_number ?? '—');
  const when = fmtWhen(complaint.report_date_time);
  const loc = escHtml(complaint.location ?? '—');
  const desc = escHtml(complaint.description ?? '—').replace(/\n/g, '<br/>');
  const reporter = escHtml(complaint.reporter_name ?? '—');
  const driver = escHtml(complaint.driver_name ?? '—');
  const response = escHtml(complaint.driver_response ?? '—').replace(/\n/g, '<br/>');
  const action = escHtml(complaint.action_taken ?? '—');
  const prev = procedure6StatusLabelHe(complaint.previous_status);
  const next = procedure6StatusLabelHe(complaint.status);
  const reportId = escHtml(complaint.report_id ?? '—');

  const isClosed =
    String(complaint.status).toLowerCase() === 'closed' ||
    String(complaint.status).toLowerCase() === 'resolved';
  const isInProgress =
    String(complaint.status).toLowerCase() === 'in_progress' ||
    String(complaint.status).toLowerCase() === 'pending';

  const showActions =
    Boolean(complaint.include_manager_actions) &&
    !isClosed &&
    isInProgress &&
    Boolean(String(complaint.response_token ?? '').trim());
  const actionsHtml = showActions
    ? procedure6ManagerActionButtonsHtml(String(complaint.response_token))
    : '';

  const headline = isClosed ? 'תלונת נוהל 6 נסגרה' : 'עדכון סטטוס — תלונת נוהל 6';
  const subject = isClosed
    ? `תלונת נוהל 6 נסגרה — רכב ${complaint.vehicle_number || '—'}`
    : `עדכון סטטוס תלונת נוהל 6 — רכב ${complaint.vehicle_number || '—'} (${next})`;

  const inner = `
<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;color:#0f172a;">
  <h2 style="margin:0 0 12px;font-size:18px;color:#0e7490;">${headline}</h2>
  <p style="margin:0 0 16px;color:#475569;font-size:14px;">
    הסטטוס עודכן מ־<strong>${escHtml(prev)}</strong> ל־<strong>${escHtml(next)}</strong>.
  </p>
  <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;background:#f8fafc;border-radius:8px;">
    <tr><td style="padding:10px 12px;color:#64748b;width:140px;">מס׳ רכב</td><td style="padding:10px 12px;font-weight:600;font-family:monospace;">${plate}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">סטטוס חדש</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-weight:600;">${escHtml(next)}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">תאריך / שעה</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${when}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">מיקום</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${loc}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;vertical-align:top;">תיאור הפנייה</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${desc}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">מדווח</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${reporter}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">נהג</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${driver}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;vertical-align:top;">תגובת הנהג</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${response}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">פעולה שננקטה</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${action}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">מס׳ דיווח</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${reportId}</td></tr>
  </table>
  ${actionsHtml}
</div>`;

  const html = supabaseUrl ? wrapEmailBodyWithBrand(supabaseUrl, inner) : inner;
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || DEFAULT_FROM;
  const primary = recipients.slice(0, 1);
  const bcc = bccExcludingPrimary(primary, recipients.slice(1));

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: primary,
      ...(bcc.length ? { bcc } : {}),
      subject,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('[notifyProcedure6StatusUpdate] Resend', errText);
    return { sent: false, to: recipients, error: errText.slice(0, 300) };
  }

  return { sent: true, to: recipients };
}
