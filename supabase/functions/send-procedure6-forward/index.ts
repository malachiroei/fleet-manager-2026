/**
 * Staff action: email driver a public response link for a Procedure 6 complaint.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';
import { randomResponseToken } from '../_shared/procedure6EmailParse.ts';
import { buildProcedure6RespondUrl } from '../_shared/procedure6PublicUrl.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FROM_EMAIL = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);
    if (!resendApiKey) return json({ error: 'Missing RESEND_API_KEY' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const userId = userData.user.id;

    const body = (await req.json()) as {
      complaint_id?: string;
      driver_email?: string;
      org_id?: string;
    };
    const complaintId = clean(body.complaint_id);
    const driverEmail = clean(body.driver_email).toLowerCase();
    if (!complaintId) return json({ error: 'Missing complaint_id' }, 400);
    if (!driverEmail.includes('@')) return json({ error: 'כתובת מייל נהג לא תקינה' }, 400);

    const { data: row, error: loadErr } = await admin
      .from('procedure6_complaints')
      .select(
        'id, org_id, vehicle_number, location, description, report_date_time, driver_name, driver_id, status, response_token',
      )
      .eq('id', complaintId)
      .maybeSingle();

    if (loadErr) return json({ error: loadErr.message }, 500);
    if (!row) return json({ error: 'Complaint not found' }, 404);
    if (row.status === 'closed') return json({ error: 'התלונה כבר סגורה' }, 400);

    const orgId = clean(row.org_id) || clean(body.org_id);
    if (!orgId) return json({ error: 'חסר org_id לתלונה' }, 400);

    const { data: mayWrite } = await admin.rpc('can_org_admin_write', {
      _user_id: userId,
      _org_id: orgId,
    });
    if (!mayWrite) return json({ error: 'אין הרשאה להעביר תלונה' }, 403);

    let token = clean(row.response_token);
    if (!token) token = randomResponseToken();

    const { error: updErr } = await admin
      .from('procedure6_complaints')
      .update({
        response_token: token,
        forwarded_by: userId,
        forwarded_to_email: driverEmail,
        status: row.status === 'open' ? 'in_progress' : row.status,
      })
      .eq('id', row.id);
    if (updErr) return json({ error: updErr.message }, 500);

    const link = buildProcedure6RespondUrl(token);
    const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || FROM_EMAIL;
    const plate = escHtml(row.vehicle_number ?? '');
    const loc = escHtml(row.location ?? '—');
    const when = escHtml(row.report_date_time ?? '—');
    const desc = escHtml(row.description ?? '—').replace(/\n/g, '<br/>');
    const dName = escHtml(row.driver_name ?? '—');

    const inner = `
<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;color:#0f172a;">
  <h2 style="margin:0 0 12px;font-size:18px;">עדכון הטיפול בפנייה — נוהל 6</h2>
  <p style="margin:0 0 12px;">שלום ${dName},</p>
  <p style="margin:0 0 12px;">התקבלה פנייה לגבי נהיגה ברכב <strong>${plate}</strong>. יש להגיב בקישור:</p>
  <p style="margin:0 0 16px;"><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">למילוי תגובה</a></p>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b;">או העתק: ${escHtml(link)}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
  <p style="margin:0 0 6px;font-weight:bold;">פרטי הדיווח</p>
  <p style="margin:0 0 4px;font-size:14px;">רכב: ${plate}</p>
  <p style="margin:0 0 4px;font-size:14px;">מועד: ${when}</p>
  <p style="margin:0 0 4px;font-size:14px;">מיקום: ${loc}</p>
  <p style="margin:0 0 4px;font-size:14px;">תיאור: ${desc}</p>
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
        subject: `נוהל 6 — נדרשת תגובתך לרכב ${row.vehicle_number}`,
        html,
      }),
    });
    const resendJson = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return json({ error: 'שליחת המייל נכשלה', detail: resendJson }, 502);
    }

    return json({ ok: true, response_url: link, email_id: (resendJson as { id?: string }).id ?? null });
  } catch (err) {
    console.error('[send-procedure6-forward]', err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
