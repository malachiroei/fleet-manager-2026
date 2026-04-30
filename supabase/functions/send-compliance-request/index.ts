import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForTeamActions } from '../_shared/teamAdminActionPermission.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL_DEFAULT = 'https://fleet-app.com';
const FROM_EMAIL = 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

type ReqBody = {
  org_id?: string;
  entity_type?: 'vehicle' | 'driver';
  entity_id?: string;
  task_key?: string;
  task_label?: string;
  due_field?: string;
  due_date?: string | null;
  driver_id?: string | null;
  driver_email?: string | null;
  driver_name?: string | null;
  tab_label?: string | null;
  cta_text?: string | null;
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

function ymdOrNull(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m?.[1] ?? null;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${crypto.randomUUID().replace(/-/g, '')}${hex}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as ReqBody;
    const orgId = clean(body.org_id);
    const entityType = body.entity_type === 'vehicle' ? 'vehicle' : body.entity_type === 'driver' ? 'driver' : null;
    const entityId = clean(body.entity_id);
    const taskKey = clean(body.task_key);
    const taskLabel = clean(body.task_label) || 'Update Required Document';
    const dueField = clean(body.due_field);
    const dueDate = ymdOrNull(body.due_date);
    const ctaText = clean(body.cta_text) || 'Please upload the requested update.';
    const tabLabel = clean(body.tab_label) || taskLabel;

    if (!orgId || !entityType || !entityId || !taskKey || !dueField) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) {
      return json({ error: 'Server is missing required Supabase/Resend secrets' }, 500);
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = bearerMatch?.[1]?.trim() ?? '';
    if (!accessToken) return json({ error: 'Missing Authorization' }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authErr } = await authClient.auth.getUser(accessToken);
    const viewerId = authData?.user?.id ?? '';
    if (authErr || !viewerId) return json({ error: 'Invalid or expired session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const mayManage = await callerMayManageOrgForTeamActions(admin, viewerId, orgId, authData?.user?.email ?? '');
    if (!mayManage) return json({ error: 'Forbidden' }, 403);

    let driverId = clean(body.driver_id);
    let driverEmail = clean(body.driver_email).toLowerCase();
    let driverName = clean(body.driver_name);

    if (entityType === 'driver') {
      const { data: d, error: derr } = await admin
        .from('drivers')
        .select('id, org_id, email, full_name')
        .eq('id', entityId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (derr) return json({ error: derr.message }, 400);
      if (!d) return json({ error: 'Driver not found in organization' }, 404);
      driverId = d.id;
      driverEmail = clean(d.email).toLowerCase();
      driverName = clean(d.full_name);
    } else {
      const { data: v, error: verr } = await admin
        .from('vehicles')
        .select('id, org_id, assigned_driver_id')
        .eq('id', entityId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (verr) return json({ error: verr.message }, 400);
      if (!v) return json({ error: 'Vehicle not found in organization' }, 404);
      if (!v.assigned_driver_id) return json({ error: 'Vehicle has no assigned driver' }, 400);
      driverId = String(v.assigned_driver_id);
      const { data: d, error: derr } = await admin
        .from('drivers')
        .select('id, org_id, email, full_name')
        .eq('id', driverId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (derr) return json({ error: derr.message }, 400);
      if (!d) return json({ error: 'Assigned driver not found in organization' }, 404);
      driverEmail = clean(d.email).toLowerCase();
      driverName = clean(d.full_name);
    }

    if (!driverEmail || !driverEmail.includes('@')) {
      return json({ error: 'Driver has no valid email' }, 400);
    }

    const baseUrl = clean(Deno.env.get('COMPLIANCE_UPDATE_BASE_URL')) || APP_URL_DEFAULT;
    const appBase = baseUrl.replace(/\/+$/, '');
    const token = randomToken();
    const requestUrl = `${appBase}/update/${token}`;

    const { data: inserted, error: insErr } = await admin
      .from('compliance_requests')
      .insert({
        org_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        driver_id: driverId || null,
        driver_email: driverEmail,
        driver_name: driverName || null,
        task_key: taskKey,
        task_label: taskLabel,
        due_field: dueField,
        due_date: dueDate,
        request_token: token,
        request_url: requestUrl,
        created_by: viewerId,
        metadata: {
          tab_label: tabLabel,
          cta_text: ctaText,
        },
      })
      .select('id')
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    const html = `
<div dir="ltr" style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <h2 style="margin: 0 0 12px;">Compliance Update Request</h2>
  <p>Hello ${driverName || 'Driver'},</p>
  <p>${ctaText}</p>
  <p><strong>Task:</strong> ${taskLabel}</p>
  <p><strong>Section:</strong> ${tabLabel}</p>
  <p style="margin: 20px 0;">
    <a href="${requestUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;">
      Open update page
    </a>
  </p>
  <p style="color:#64748b;font-size:12px;">If the button does not work, copy this link:<br/>${requestUrl}</p>
</div>`.trim();

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [driverEmail],
        subject: `Compliance request: ${taskLabel}`,
        html,
      }),
    });

    const resendText = await resendResp.text();
    if (!resendResp.ok) {
      return json({ error: `Resend API error (${resendResp.status}): ${resendText}` }, 500);
    }

    let emailId = '';
    try {
      const parsed = JSON.parse(resendText) as { id?: string };
      emailId = clean(parsed.id);
    } catch {
      // noop
    }

    if (emailId) {
      await admin.from('compliance_requests').update({ email_id: emailId }).eq('id', inserted.id);
    }

    return json({
      success: true,
      token,
      request_url: requestUrl,
      email_id: emailId || null,
      sent_to: driverEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
