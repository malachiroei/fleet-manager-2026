/**
 * sendHandoverEmail
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends the handover wizard completion email **directly from the browser**
 * using the Resend REST API (no Supabase Edge Function required).
 *
 * Requires:  VITE_RESEND_API_KEY  in your .env file.
 *
 * All signed document URLs and the license photos are fetched, base64-encoded,
 * and attached to the email.  The recipient list is always:
 *   • The driver's own email address (primary)
 *   • Every address stored in system_settings → notification_emails (CC)
 *
 * Usage:
 *   await sendHandoverEmail({ docs, driverName, driverEmail, vehicleLabel,
 *                             licenseNumber, supabaseClient });
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HandoverDoc {
  title: string;
  file_url: string;
}

export interface SendHandoverEmailParams {
  docs:          HandoverDoc[];
  driverName:    string;
  driverEmail:   string | null | undefined;
  vehicleLabel:  string;
  licenseNumber: string;
  supabase:      SupabaseClient;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DOC_LABEL: Record<string, string> = {
  handover_receipt:    'טופס קבלת רכב (חתימה)',
  procedure_agreement: 'נוהל 04-05-001 — אישור תנאי שימוש (חתימה)',
  health_declaration:  'הצהרת בריאות (חתימה)',
  license_front:       'רישיון נהיגה — צד א׳',
  license_back:        'רישיון נהיגה — צד ב׳',
};

function labelFor(title: string): string {
  const key = Object.keys(DOC_LABEL).find((k) => title.startsWith(k));
  return key ? DOC_LABEL[key] : title.split(' | ')[0];
}

function filenameFor(title: string, url: string): string {
  const nameMap: Record<string, string> = {
    handover_receipt:    'טופס-קבלת-רכב-חתימה',
    procedure_agreement: 'נוהל-04-05-001-חתימה',
    health_declaration:  'הצהרת-בריאות-חתימה',
    license_front:       'רישיון-נהיגה-צד-א',
    license_back:        'רישיון-נהיגה-צד-ב',
  };
  const key  = Object.keys(nameMap).find((k) => title.startsWith(k)) ?? '';
  const name = nameMap[key] ?? title.split(' | ')[0];
  const ext  = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'png';
  return `${name}.${ext}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sendHandoverEmail({
  docs,
  driverName,
  driverEmail,
  vehicleLabel,
  licenseNumber,
  supabase,
}: SendHandoverEmailParams): Promise<{ success: boolean; error?: string }> {

  // ── 1. API key guard ───────────────────────────────────────────────────────
  const apiKey = import.meta.env.VITE_RESEND_API_KEY as string | undefined;
  if (!apiKey) {
    console.warn('sendHandoverEmail: VITE_RESEND_API_KEY is not set — skipping email');
    return { success: false, error: 'VITE_RESEND_API_KEY not configured' };
  }

  // ── 2. Driver email guard ──────────────────────────────────────────────────
  if (!driverEmail) {
    console.warn('sendHandoverEmail: driver has no email address — skipping');
    return { success: false, error: 'driver has no email' };
  }

  // ── 3. Read notification_emails from system_settings ──────────────────────
  let ccEmails: string[] = [];
  try {
    const { data } = await (supabase as any)
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_emails')
      .maybeSingle() as { data: { value: unknown } | null };
    const arr = data?.value;
    if (Array.isArray(arr)) {
      ccEmails = (arr as string[]).filter((e) => typeof e === 'string' && e.includes('@'));
    }
  } catch (e) {
    console.warn('sendHandoverEmail: could not read system_settings:', e);
  }

  // Build recipient list: driver first, then CCs (deduped)
  const recipients = [driverEmail];
  for (const cc of ccEmails) {
    if (!recipients.includes(cc)) recipients.push(cc);
  }

  // ── 4. Build attachments using Resend's `path` field ─────────────────────
  // Resend downloads each URL server-side — avoids browser CORS restrictions.
  interface Attachment { filename: string; path: string; }
  const attachments: Attachment[] = docs.map((doc) => ({
    filename: filenameFor(doc.title, doc.file_url),
    path:     doc.file_url,
  }));

  // ── 5. Build HTML body ─────────────────────────────────────────────────────
  const sentAt = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const docListHtml = docs
    .map((d) => `<li style="padding:4px 0">📎 ${labelFor(d.title)}</li>`)
    .join('');

  const html = `
<div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc">
  <div style="background:linear-gradient(135deg,#0d1b2e 0%,#1e3a5f 100%);padding:32px 28px;border-radius:12px 12px 0 0">
    <h1 style="color:#22d3ee;margin:0 0 6px;font-size:22px">✅ אשף מסירת רכב — הושלם בהצלחה</h1>
    <p style="color:rgba(255,255,255,0.6);margin:0;font-size:14px">מערכת ניהול ציי רכב — Fleet Manager 2026</p>
  </div>
  <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
    <p style="font-size:16px;color:#1e293b;margin-top:0">שלום <strong>${driverName}</strong>,</p>
    <p style="color:#475569;line-height:1.7">
      תהליך קבלת הרכב הושלם בהצלחה. כל המסמכים שנחתמו ונסרקו נשמרו בתיק הנהג שלך במערכת.
      מצורפים לאימייל זה <strong>${attachments.length} קבצים</strong>:
    </p>
    <ul style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 24px;color:#334155;font-size:14px;line-height:1.8">
      ${docListHtml}
    </ul>
    <p style="color:#64748b;font-size:13px">רכב: <strong>${vehicleLabel}</strong></p>
    ${licenseNumber ? `<p style="color:#64748b;font-size:13px;margin-top:0">מספר רישיון נהיגה: <strong>${licenseNumber}</strong></p>` : ''}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
    <p style="font-size:12px;color:#94a3b8;margin:0">נשלח אוטומטית על-ידי Fleet Manager 2026 · ${sentAt}</p>
  </div>
</div>`.trim();

  // ── 6. POST to Resend ──────────────────────────────────────────────────────
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:        'Fleet Manager <onboarding@resend.dev>',
        to:          recipients,
        subject:     `✅ מסמכי מסירת רכב — ${driverName} | ${vehicleLabel} | ${sentAt}`,
        html,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          path:     a.path,
        })),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Resend ${resp.status}: ${errText}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
