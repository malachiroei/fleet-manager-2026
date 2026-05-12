/**
 * Secrets (Supabase → Edge Functions): RESEND_API_KEY (חובה).
 * אופציונלי: NOTIFY_FROM_EMAIL — חייב להיות דומיין מאומת ב-Resend (לא onboarding@resend.dev לייצור).
 *
 * שני מצבים:
 * - ברירת מחדל (ללא notificationType או `service`): מייל טיפול — כמו קודם.
 * - `notificationType: "fleet_field"`: מייל גנרי לטסט / ביטוח / צמיגים (אותו endpoint פרוס כמו טיפול).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';
import {
  coerceEmailTopic,
  type NotificationEmailTopicId,
} from '../_shared/notificationEmailRouting.ts';
import { loadFilteredNotificationEmails, uniqueEmailList } from '../_shared/loadFilteredNotificationEmails.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export interface FleetFieldUpdateRow {
  label: string;
  value: string;
}

export interface ServiceUpdateNotificationBody {
  /** לאיחוד ניתוב מיילים per-admin לארגון */
  orgId?: string;
  /** `fleet_field` — מייל גנרי (טסט, ביטוח, צמיגים); חסר או `service` — מייל טיפול */
  notificationType?: 'service' | 'fleet_field';
  /** אופציונלי — תואם send-mileage-notification (ברירת מחדל malachiroei@gmail.com) */
  to?: string;
  subject: string;
  plateNumber: string;
  vehicleLabel: string;
  serviceDate: string;
  nextServiceDate: string;
  currentMileage: number;
  nextServiceKm: number | null;
  serviceIntervalKm: number | null;
  invoicePhotoUrl: string;
  /** fleet_field בלבד — נושא לניתוב מייל בהגדרות */
  emailTopic?: string;
  /** fleet_field בלבד */
  headline?: string;
  rows?: FleetFieldUpdateRow[];
  documentUrl?: string | null;
  /** קישור יחיד בתחתית המייל (טפסי ציות) */
  primaryLinkUrl?: string;
  primaryLinkLabel?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail =
      Deno.env.get('NOTIFY_FROM_EMAIL') || 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
        : null;

    async function resolveRecipients(
      topic: NotificationEmailTopicId,
      toOverride: string | undefined,
      orgId?: string | null,
    ): Promise<string[]> {
      const extra = toOverride && String(toOverride).includes('@') ? [String(toOverride).trim()] : [];
      const fromDb = admin ? await loadFilteredNotificationEmails(admin, topic, orgId ?? null) : [];
      const list = uniqueEmailList([...extra, ...fromDb]);
      return list.length > 0 ? list : ['malachiroei@gmail.com'];
    }

    const body = (await req.json()) as ServiceUpdateNotificationBody;
    const mode = body.notificationType === 'fleet_field' ? 'fleet_field' : 'service';

    if (mode === 'fleet_field') {
      const subject = (body.subject?.trim() || 'עדכון במערכת').slice(0, 200);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: 'fleet_field: נדרש מערך rows לא ריק' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const fleetTopic = coerceEmailTopic(body.emailTopic);
      const orgIdTrim = String(body.orgId ?? '').trim() || null;
      const recipients = await resolveRecipients(fleetTopic, body.to, orgIdTrim);
      const headline = esc(body.headline?.trim() || subject);
      const safeDoc = String(body.documentUrl ?? '').trim().replace(/"/g, '');

      let tableRows = '';
      for (const r of rows) {
        const lab = esc(String(r.label ?? ''));
        const val = esc(String(r.value ?? ''));
        tableRows += `<tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;">${lab}</td><td style="padding:6px 0;">${val}</td></tr>`;
      }

      const plateBlock =
        body.plateNumber || body.vehicleLabel
          ? `<p style="margin:12px 0;"><strong dir="ltr">${esc(body.plateNumber ?? '')}</strong>
           ${body.vehicleLabel ? `<span> · ${esc(body.vehicleLabel)}</span>` : ''}</p>`
          : '';

      const docBlock = safeDoc
        ? `<p style="margin-top:14px;"><strong>מסמך / צילום:</strong><br/>
         <a href="${safeDoc}" target="_blank" rel="noopener noreferrer">פתיחת קישור</a></p>`
        : '';
      const ctaHrefRaw = String(body.primaryLinkUrl ?? '').trim().replace(/["'<>]/g, '');
      const ctaLbl = esc(String(body.primaryLinkLabel ?? '').trim()) || 'פתיחת הטופס';
      const ctaBlock =
        ctaHrefRaw && ctaHrefRaw.startsWith('http')
          ? `<p style="margin-top:18px;"><a href="${ctaHrefRaw}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;background:#0891b2;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">${ctaLbl}</a></p>`
          : '';

      const innerHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2 style="margin-bottom:8px;">${headline}</h2>
        ${plateBlock}
        <table style="border-collapse:collapse;width:100%;max-width:520px;">${tableRows}</table>
        ${ctaBlock}
        ${docBlock}
        <p style="font-size:12px;color:#6b7280;margin-top:20px;">נשלח אוטומטית ממערכת Fleet Manager Pro.</p>
      </div>
    `.trim();

      const html = supabaseUrl ? wrapEmailBodyWithBrand(supabaseUrl, innerHtml) : innerHtml;

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: recipients,
          subject,
          html,
        }),
      });

      if (!resendResp.ok) {
        const errText = await resendResp.text();
        console.error('Resend Error (fleet_field):', errText);
        return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await resendResp.json();
      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = body.subject?.trim() || 'עדכון טיפול';
    const orgIdTrim = String(body.orgId ?? '').trim() || null;
    const recipients = await resolveRecipients('maintenance_update', body.to, orgIdTrim);

    const kmStr = (n: number | null | undefined) =>
      n != null && Number.isFinite(n) ? `${Number(n).toLocaleString('he-IL')} ק"מ` : '—';

    const safePhotoHref = String(body.invoicePhotoUrl ?? '').replace(/"/g, '');

    const innerHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2>${esc(subject)}</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 480px;">
          <tr><td style="padding: 6px 0; color: #6b7280;">מספר רישוי</td><td style="padding: 6px 0;"><strong dir="ltr">${esc(body.plateNumber || '')}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">רכב</td><td style="padding: 6px 0;">${esc(body.vehicleLabel || '')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">תאריך טיפול</td><td style="padding: 6px 0;">${esc(body.serviceDate || '')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">תאריך טיפול הבא (אוטומטי +שנה)</td><td style="padding: 6px 0;">${esc(body.nextServiceDate || '')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">קילומטראז׳ בטיפול</td><td style="padding: 6px 0;" dir="ltr">${kmStr(body.currentMileage)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">ק״מ לטיפול הבא (מחושב)</td><td style="padding: 6px 0;" dir="ltr">${kmStr(body.nextServiceKm)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">מרווח טיפול בק״מ (יצרן)</td><td style="padding: 6px 0;" dir="ltr">${kmStr(body.serviceIntervalKm)}</td></tr>
        </table>
        <p style="margin-top: 16px;"><strong>חשבונית / צילום טיפול:</strong><br/>
          <a href="${safePhotoHref}" target="_blank" rel="noopener noreferrer">פתיחת קישור לתמונה</a>
        </p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">נשלח אוטומטית ממערכת Fleet Manager Pro.</p>
      </div>
    `.trim();

    const html = supabaseUrl ? wrapEmailBodyWithBrand(supabaseUrl, innerHtml) : innerHtml;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error('Resend Error:', errText);
      return new Response(
        JSON.stringify({ error: `Resend error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await resendResp.json();
    return new Response(JSON.stringify({ success: true, result: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-service-update-notification error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
