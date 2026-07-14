/**
 * Manager asks driver for clarification via response_token.
 * Sets status back to open and emails the driver a re-response link.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';
import { loadDriverContact } from '../_shared/loadDriverContact.ts';
import { buildProcedure6RespondUrl } from '../_shared/procedure6PublicUrl.ts';
import { appendProcedure6ProcessLog } from '../_shared/appendProcedure6ProcessLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

const FROM_EMAIL = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      clarification?: string;
      driver_email?: string;
    };
    const token = clean(body.token);
    const clarification = clean(body.clarification);
    if (!token) return json({ ok: false, error: 'Missing token' });
    if (!clarification) return json({ ok: false, error: 'נא לכתוב שאלה או בקשת הבהרה' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: 'Missing server secrets' });
    }
    if (!resendApiKey) return json({ ok: false, error: 'Missing RESEND_API_KEY' });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: loadErr } = await admin
      .from('procedure6_complaints')
      .select(
        'id, org_id, vehicle_number, location, description, report_date_time, driver_name, driver_response, status, closed_at, forwarded_to_email, driver_id, response_token',
      )
      .eq('response_token', token)
      .maybeSingle();

    if (loadErr) return json({ ok: false, error: loadErr.message });
    if (!row) return json({ ok: false, error: 'הקישור אינו תקף' });
    if (row.status === 'closed' || row.closed_at) {
      return json({ ok: false, error: 'לא ניתן לבקש הבהרה מתלונה שנסגרה' });
    }

    const contact = await loadDriverContact(admin, row.driver_id, row.org_id);
    const driverEmail =
      clean(body.driver_email).toLowerCase() ||
      clean(row.forwarded_to_email).toLowerCase() ||
      clean(contact?.email).toLowerCase();

    if (!driverEmail.includes('@')) {
      return json({
        ok: false,
        error: 'לא נמצא מייל נהג. הזינו כתובת מייל לשליחה.',
        needs_email: true,
      });
    }

    const { error: updErr } = await admin
      .from('procedure6_complaints')
      .update({
        status: 'open',
        forwarded_to_email: driverEmail,
      })
      .eq('id', row.id)
      .eq('response_token', token);

    if (updErr) {
      console.error('[send-procedure6-clarification-request] update', updErr);
      return json({ ok: false, error: updErr.message });
    }

    await appendProcedure6ProcessLog(admin, {
      id: row.id,
      response_token: token,
      org_id: row.org_id,
      line: `בקשת הבהרה לנהג (${driverEmail}): ${clarification}`,
    });

    const respondUrl = buildProcedure6RespondUrl(token);
    const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || FROM_EMAIL;
    const plate = escHtml(row.vehicle_number ?? '');
    const dName = escHtml(row.driver_name || contact?.full_name || 'נהג/ת');
    const q = escHtml(clarification).replace(/\n/g, '<br/>');
    const prev = escHtml(row.driver_response ?? '—').replace(/\n/g, '<br/>');

    const inner = `
<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;color:#0f172a;">
  <h2 style="margin:0 0 12px;font-size:18px;">נדרשת הבהרה — נוהל 6</h2>
  <p style="margin:0 0 12px;">שלום ${dName},</p>
  <p style="margin:0 0 12px;">צוות הצי מבקש הבהרה נוספת לגבי הפנייה על רכב <strong>${plate}</strong>:</p>
  <div style="margin:0 0 16px;padding:12px 14px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;">
    ${q}
  </div>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b;">תגובתך הקודמת:</p>
  <p style="margin:0 0 16px;font-size:14px;">${prev}</p>
  <p style="margin:0 0 16px;text-align:center;">
    <a href="${escHtml(respondUrl)}"
       style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
      לחץ כאן להשלמת התגובה
    </a>
  </p>
</div>`;

    const html = wrapEmailBodyWithBrand(supabaseUrl, inner);
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [driverEmail],
        subject: `נוהל 6 — נדרשת הבהרה לרכב ${row.vehicle_number || ''}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('[send-procedure6-clarification-request] resend', errText);
      return json({ ok: false, error: `שליחת המייל לנהג נכשלה: ${errText.slice(0, 200)}` });
    }

    return json({ ok: true, status: 'open', emailed: driverEmail });
  } catch (err) {
    console.error('[send-procedure6-clarification-request]', err);
    return json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
});
