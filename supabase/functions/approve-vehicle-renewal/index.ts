import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForTeamActions } from '../_shared/teamAdminActionPermission.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as { request_id?: string };
    const requestId = clean(body.request_id);
    if (!requestId) return json({ error: 'Missing request_id' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) {
      return json({ error: 'Server is missing required secrets' }, 500);
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    const accessToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
    if (!accessToken) return json({ error: 'Missing Authorization' }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authErr } = await authClient.auth.getUser(accessToken);
    const viewerId = authData?.user?.id ?? '';
    if (authErr || !viewerId) return json({ error: 'Invalid or expired session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: reqRow, error: rErr } = await admin
      .from('compliance_requests')
      .select(
        'id, org_id, entity_id, task_key, status, proposed_expiry_date, submitted_document_url',
      )
      .eq('id', requestId)
      .maybeSingle();

    if (rErr) return json({ error: rErr.message }, 500);
    if (!reqRow) return json({ error: 'Request not found' }, 404);
    if (reqRow.status !== 'pending_admin_review') {
      return json({ error: 'הבקשה אינה במצב ממתין לאישור' }, 400);
    }

    const proposed = clean(String(reqRow.proposed_expiry_date ?? ''));
    const docUrl = clean(String(reqRow.submitted_document_url ?? ''));
    if (!proposed || !/^\d{4}-\d{2}-\d{2}$/.test(proposed)) {
      return json({ error: 'חסר תאריך תוקף מההגשה' }, 400);
    }
    if (!docUrl) return json({ error: 'חסר קישור למסמך מההגשה' }, 400);

    const mayManage = await callerMayManageOrgForTeamActions(
      admin,
      viewerId,
      String(reqRow.org_id),
      authData?.user?.email ?? '',
    );
    if (!mayManage) return json({ error: 'Forbidden' }, 403);

    const { data: vehicle, error: verr } = await admin
      .from('vehicles')
      .select('id, plate_number, manufacturer, model, assigned_driver_id, org_id')
      .eq('id', reqRow.entity_id)
      .eq('org_id', reqRow.org_id)
      .maybeSingle();
    if (verr) return json({ error: verr.message }, 500);
    if (!vehicle) return json({ error: 'Vehicle not found' }, 404);

    const taskKey = String(reqRow.task_key);
    const vUp: Record<string, string> =
      taskKey === 'annual_licensing'
        ? { test_expiry: proposed, license_image_url: docUrl }
        : taskKey === 'insurance'
          ? { insurance_expiry: proposed, insurance_pdf_url: docUrl }
          : {};

    if (Object.keys(vUp).length === 0) return json({ error: 'Unsupported task' }, 400);

    const { error: vuErr } = await admin.from('vehicles').update(vUp).eq('id', vehicle.id);
    if (vuErr) return json({ error: vuErr.message }, 500);

    const docTitle =
      taskKey === 'annual_licensing'
        ? 'רישיון רכב (טסט) — אושר מליסינג'
        : 'פוליסת ביטוח — אושר מליסינג';
    const docType = taskKey === 'annual_licensing' ? 'annual_license' : 'insurance_policy';

    await admin.from('vehicle_documents').insert({
      vehicle_id: vehicle.id,
      title: docTitle,
      file_url: docUrl,
      document_type: docType,
    });

    const { error: closeErr } = await admin
      .from('compliance_requests')
      .update({ status: 'completed' })
      .eq('id', requestId);
    if (closeErr) return json({ error: closeErr.message }, 500);

    let driverEmail = '';
    let driverName = '';
    if (vehicle.assigned_driver_id) {
      const { data: d } = await admin
        .from('drivers')
        .select('email, full_name')
        .eq('id', vehicle.assigned_driver_id)
        .eq('org_id', reqRow.org_id)
        .maybeSingle();
      driverEmail = clean(String(d?.email ?? '')).toLowerCase();
      driverName = clean(String(d?.full_name ?? ''));
    }

    if (driverEmail.includes('@')) {
      const plate = String(vehicle.plate_number ?? '');
      const vehLabel = `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim();
      const html = `
<div dir="rtl" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:560px;margin:0 auto;text-align:right;color:#0f172a;">
  <p style="font-size:17px;"><strong>${driverName ? `שלום ${driverName}` : 'שלום'}</strong>,</p>
  <p style="line-height:1.7;">מצורף צילום מעודכן של ${taskKey === 'insurance' ? 'ביטוח הרכב' : 'רישיון הרכב (טסט)'} עבור רכב החברה.</p>
  <p style="line-height:1.7;"><strong>מספר רישוי:</strong> ${plate}</p>
  <p style="line-height:1.7;"><strong>רכב:</strong> ${vehLabel}</p>
  <p style="line-height:1.7;">נא <strong>להדפיס</strong> ולשים העתק ברכב.</p>
  <p style="margin-top:24px;color:#64748b;">בברכה,<br/>מחלקת רכב</p>
</div>`.trim();

      let attachment:
        | { filename: string; content: string }
        | undefined;
      try {
        const imgRes = await fetch(docUrl);
        if (imgRes.ok) {
          const buf = new Uint8Array(await imgRes.arrayBuffer());
          const ext = /\.png(\?|$)/i.test(docUrl) ? 'png' : 'jpg';
          attachment = {
            filename: taskKey === 'insurance' ? `bituach-${plate}.${ext}` : `rishayon-${plate}.${ext}`,
            content: uint8ToBase64(buf),
          };
        }
      } catch {
        // מייל בלי צרופה אם ההורדה נכשלה
      }

      const payload: Record<string, unknown> = {
        from: FROM_EMAIL,
        to: [driverEmail],
        subject: `עדכון ${taskKey === 'insurance' ? 'ביטוח' : 'רישוי'} — רכב ${plate}`,
        html,
      };
      if (attachment) payload.attachments = [attachment];

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!resendResp.ok) {
        const t = await resendResp.text();
        console.warn('[approve-vehicle-renewal] driver email failed', t);
      }
    }

    return json({ success: true, message: 'הרכב עודכן והמסמך נרשם' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
