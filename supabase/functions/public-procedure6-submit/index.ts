/**
 * Public submit of Procedure 6 driver response.
 * Always returns JSON the client can read (HTTP 200 for business errors) so
 * supabase-js does not hide the real message behind "non-2xx".
 * Updates by response_token via service role — no login / no RLS dependency.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';
import {
  bccExcludingPrimary,
  loadFilteredNotificationEmails,
  uniqueEmailList,
} from '../_shared/loadFilteredNotificationEmails.ts';
import { procedure6ManagerActionButtonsHtml } from '../_shared/procedure6ManagerActions.ts';
import { appendProcedure6ProcessLog } from '../_shared/appendProcedure6ProcessLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

const FROM_EMAIL = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

type SubmitBody = {
  token?: string;
  driver_name?: string;
  driver_response?: string;
};

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
    const body = (await req.json().catch(() => ({}))) as SubmitBody;
    const token = clean(body.token);
    const driverName = clean(body.driver_name);
    const driverResponse = clean(body.driver_response);
    if (!token) return json({ ok: false, error: 'Missing token' });
    if (!driverResponse) return json({ ok: false, error: 'חסרה תגובת הנהג' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[public-procedure6-submit] missing secrets');
      return json({ ok: false, error: 'Missing server secrets' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: loadErr } = await admin
      .from('procedure6_complaints')
      .select(
        'id, org_id, vehicle_number, location, description, report_date_time, status, closed_at, forwarded_by, forwarded_to_email, driver_name, response_token',
      )
      .eq('response_token', token)
      .maybeSingle();

    if (loadErr) {
      console.error('[public-procedure6-submit] load', loadErr);
      return json({ ok: false, error: loadErr.message });
    }
    if (!row) return json({ ok: false, error: 'הקישור אינו תקף או שפג תוקפו' });
    if (row.status === 'closed' || row.closed_at) {
      return json({ ok: false, error: 'התלונה כבר נסגרה' });
    }

    const nowIso = new Date().toISOString();
    const patchBase: Record<string, unknown> = {
      driver_response: driverResponse,
    };
    if (driverName) patchBase.driver_name = driverName;

    // Prefer in_progress; fallback without status if DB rejects the value
    // Do not touch last_update_time — column may be missing in some envs; updated_at trigger covers it
    {
      const { error: updErr } = await admin
        .from('procedure6_complaints')
        .update({ ...patchBase, status: 'in_progress' })
        .eq('id', row.id)
        .eq('response_token', token);
      if (updErr) {
        console.warn('[public-procedure6-submit] update with status', updErr.message);
        const { error: retryErr } = await admin
          .from('procedure6_complaints')
          .update(patchBase)
          .eq('id', row.id)
          .eq('response_token', token);
        if (retryErr) {
          console.error('[public-procedure6-submit] update fallback', retryErr);
          return json({ ok: false, error: retryErr.message || updErr.message });
        }
      }
    }

    await appendProcedure6ProcessLog(admin, {
      id: row.id,
      response_token: token,
      org_id: row.org_id,
      line: `תגובת נהג: ${driverResponse}`,
    });

    // Notify staff — never fail the driver submit if mail breaks
    try {
      const recipients: string[] = [];
      if (clean(row.forwarded_to_email)) recipients.push(clean(row.forwarded_to_email));

      if (row.forwarded_by) {
        try {
          const { data: profile } = await admin
            .from('profiles')
            .select('email')
            .eq('id', row.forwarded_by)
            .maybeSingle();
          const pe = clean((profile as { email?: string } | null)?.email);
          if (pe) recipients.push(pe);
        } catch (profileErr) {
          console.warn('[public-procedure6-submit] profile', profileErr);
        }
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(row.forwarded_by);
          const ae = clean(authUser?.user?.email);
          if (ae) recipients.push(ae);
        } catch (authErr) {
          console.warn('[public-procedure6-submit] auth user', authErr);
        }
      }

      const topicEmails = await loadFilteredNotificationEmails(
        admin,
        'procedure6_complaints',
        row.org_id,
      );
      recipients.push(...topicEmails);

      const toList = uniqueEmailList(recipients);
      if (toList.length > 0 && resendApiKey) {
        const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || FROM_EMAIL;
        const plate = escHtml(row.vehicle_number ?? '');
        const loc = escHtml(row.location ?? '—');
        const when = escHtml(row.report_date_time ?? '—');
        const resp = escHtml(driverResponse).replace(/\n/g, '<br/>');
        const dName = escHtml(driverName || row.driver_name || '—');

        const actionsHtml = token
          ? procedure6ManagerActionButtonsHtml(token)
          : '';

        const inner = `
<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;color:#0f172a;">
  <h2 style="margin:0 0 12px;font-size:18px;">תגובת נהג לתלונת נוהל 6</h2>
  <p style="margin:0 0 8px;">הנהג הגיב על התלונה. הסטטוס עודכן ל־<strong>בטיפול</strong>.</p>
  <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;">
    <tr><td style="padding:6px 0;color:#64748b;">רכב</td><td style="padding:6px 0;">${plate}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">נהג</td><td style="padding:6px 0;">${dName}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">מועד</td><td style="padding:6px 0;">${when}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">מיקום</td><td style="padding:6px 0;">${loc}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top;">תגובת הנהג</td><td style="padding:6px 0;">${resp}</td></tr>
  </table>
  ${actionsHtml}
</div>`;

        const html = wrapEmailBodyWithBrand(supabaseUrl, inner);
        const primary = toList.slice(0, 1);
        const bcc = bccExcludingPrimary(primary, toList.slice(1));

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
            subject: `תגובת נהג לתלונת נוהל 6 — רכב ${row.vehicle_number}`,
            html,
          }),
        });
        if (!resendRes.ok) {
          console.error('[public-procedure6-submit] resend', await resendRes.text());
        }
      }
    } catch (notifyErr) {
      console.error('[public-procedure6-submit] notify', notifyErr);
    }

    return json({ ok: true, status: 'in_progress' });
  } catch (err) {
    console.error('[public-procedure6-submit]', err);
    return json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
});
