/**
 * Notify org staff (topic: procedure6_complaints) when a new Procedure 6 complaint is created.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from './emailBrandHeader.ts';
import {
  bccExcludingPrimary,
  loadFilteredNotificationEmails,
  uniqueEmailList,
} from './loadFilteredNotificationEmails.ts';

const DEFAULT_FROM = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

export type Procedure6ComplaintEmailFields = {
  org_id: string;
  vehicle_number?: string | null;
  report_date_time?: string | null;
  location?: string | null;
  description?: string | null;
  reporter_name?: string | null;
  reporter_cell_phone?: string | null;
  driver_name?: string | null;
  report_id?: string | null;
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

export async function notifyProcedure6NewComplaint(
  admin: SupabaseClient,
  complaint: Procedure6ComplaintEmailFields,
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
  const phone = escHtml(complaint.reporter_cell_phone ?? '—');
  const driver = escHtml(complaint.driver_name ?? '—');
  const reportId = escHtml(complaint.report_id ?? '—');

  const inner = `
<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;color:#0f172a;">
  <h2 style="margin:0 0 12px;font-size:18px;color:#0e7490;">תלונת נוהל 6 חדשה</h2>
  <p style="margin:0 0 16px;color:#475569;font-size:14px;">
    התקבלה פנייה חדשה במערכת. ניתן לצפות ולטפל בה במסך תלונות נוהל 6 או בכרטיס הנהג.
  </p>
  <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;background:#f8fafc;border-radius:8px;">
    <tr><td style="padding:10px 12px;color:#64748b;width:140px;">מס׳ רכב</td><td style="padding:10px 12px;font-weight:600;font-family:monospace;">${plate}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">תאריך / שעה</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${when}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">מיקום</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${loc}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;vertical-align:top;">תיאור הפנייה</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${desc}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">שם המדווח</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${reporter}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">טלפון</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;direction:ltr;text-align:right;">${phone}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">נהג משויך</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${driver}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b;border-top:1px solid #e2e8f0;">מס׳ דיווח</td><td style="padding:10px 12px;border-top:1px solid #e2e8f0;">${reportId}</td></tr>
  </table>
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
      subject: `תלונת נוהל 6 חדשה — רכב ${complaint.vehicle_number || '—'}`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('[notifyProcedure6NewComplaint] Resend', errText);
    return { sent: false, to: recipients, error: errText.slice(0, 300) };
  }

  return { sent: true, to: recipients };
}
