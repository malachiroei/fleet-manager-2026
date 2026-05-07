import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForComplianceActions } from '../_shared/complianceActionPermission.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL_DEFAULT = 'https://fleet-manager-pro.com';
const FROM_EMAIL = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

type ReqBody = {
  org_id?: string;
  vehicle_id?: string;
  task_key?: string;
  task_label?: string;
  due_field?: string;
  due_date?: string | null;
  external_recipient_email?: string;
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

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDueHebrew(ymd: string | null): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return escHtml(ymd);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return new Intl.DateTimeFormat('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
}

function buildLeasingEmailHtml(params: {
  taskLabel: string;
  plate: string;
  manufacturer: string;
  model: string;
  dueYmd: string | null;
  primaryHref: string;
}): string {
  const lbl = escHtml(params.taskLabel);
  return `
<div dir="rtl" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;text-align:right;">
  <div style="border-bottom:2px solid #0ea5e9;padding-bottom:12px;margin-bottom:16px;">
    <h1 style="margin:0;font-size:20px;color:#0369a1;">עדכון ${lbl}</h1>
    <p style="margin:6px 0 0;color:#64748b;font-size:14px;">מערכת ניהול צי רכבים</p>
  </div>
  <p style="line-height:1.7;color:#334155;">שלום,</p>
  <p style="line-height:1.75;color:#1e293b;">רישוי הרכב שלהלן <strong>עומד לפקוע / פג תוקף</strong> במערכת. נא לסרוק רישיון (או פוליס ביטוח, לפי העניין) <strong>בתוקף</strong>, לצרף בתמונה ברורה ולעדכן <strong>תאריך תוקף חדש</strong> בטופס המאובטח.</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:18px 0;">
    <p style="margin:0 0 8px;"><strong>מספר רישוי:</strong> ${escHtml(params.plate)}</p>
    <p style="margin:0 0 8px;"><strong>יצרן:</strong> ${escHtml(params.manufacturer)}</p>
    <p style="margin:0 0 8px;"><strong>דגם:</strong> ${escHtml(params.model)}</p>
    <p style="margin:8px 0 0;"><strong>תוקף נוכחי במערכת:</strong> ${formatDueHebrew(params.dueYmd)}</p>
  </div>
  <div style="text-align:center;margin:28px 0;">
    <a href="${params.primaryHref}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold;font-size:15px;">
      מעבר לטופס סריקה ועדכון תוקף
    </a>
  </div>
  <p style="font-size:12px;color:#64748b;word-break:break-all;">אם הכפתור לא נפתח:<br/><span dir="ltr">${escHtml(params.primaryHref)}</span></p>
  <p style="font-size:11px;color:#94a3b8;margin-top:24px;">נשלח אוטומטית · אין להשיב להודעה</p>
</div>`.trim();
}

function isMissingColumns(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('external_recipient') || m.includes('schema cache') || m.includes('column');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as ReqBody;
    const orgId = clean(body.org_id);
    const vehicleId = clean(body.vehicle_id);
    const taskKey = clean(body.task_key);
    const taskLabel = clean(body.task_label) || 'עדכון מסמך';
    const dueField = clean(body.due_field);
    const dueDate = ymdOrNull(body.due_date);
    const externalTo = clean(body.external_recipient_email).toLowerCase();

    if (!orgId || !vehicleId || !taskKey || !dueField) {
      return json({ error: 'Missing required fields' }, 400);
    }
    if (taskKey !== 'annual_licensing' && taskKey !== 'insurance') {
      return json({ error: 'Unsupported task for external leasing flow' }, 400);
    }
    if (!externalTo.includes('@')) {
      return json({ error: 'Invalid external recipient email' }, 400);
    }

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
    const mayManage = await callerMayManageOrgForComplianceActions(admin, viewerId, orgId, authData?.user?.email ?? '');
    if (!mayManage) return json({ error: 'Forbidden' }, 403);

    const { data: v, error: verr } = await admin
      .from('vehicles')
      .select('id, org_id, plate_number, manufacturer, model, assigned_driver_id')
      .eq('id', vehicleId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (verr) return json({ error: verr.message }, 400);
    if (!v) return json({ error: 'Vehicle not found in organization' }, 404);

    const { data: pending } = await admin
      .from('compliance_requests')
      .select('id')
      .eq('org_id', orgId)
      .eq('entity_type', 'vehicle')
      .eq('entity_id', vehicleId)
      .eq('task_key', taskKey)
      .eq('status', 'pending_admin_review')
      .maybeSingle();
    if (pending?.id) {
      return json(
        {
          error: 'יש הגשה קיימת הממתינה לאישור מנהל למסמך זה',
          existing_request_id: pending.id,
          code: 'pending_admin_review_exists',
        },
        409,
      );
    }

    await admin
      .from('compliance_requests')
      .update({ status: 'expired' })
      .eq('org_id', orgId)
      .eq('entity_type', 'vehicle')
      .eq('entity_id', vehicleId)
      .eq('task_key', taskKey)
      .in('status', ['sent', 'opened']);

    const { count: priorRowsCount, error: countErr } = await admin
      .from('compliance_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('entity_type', 'vehicle')
      .eq('entity_id', vehicleId)
      .eq('task_key', taskKey);
    if (countErr) return json({ error: countErr.message }, 500);
    const notifySequence = (priorRowsCount ?? 0) + 1;

    const baseUrl = clean(Deno.env.get('COMPLIANCE_UPDATE_BASE_URL')) || APP_URL_DEFAULT;
    const appBase = baseUrl.replace(/\/+$/, '');
    const token = randomToken();
    const magicLinkUrl = `${appBase}/vehicle-renewal/${token}`;

    const ins = await admin
      .from('compliance_requests')
      .insert({
        org_id: orgId,
        entity_type: 'vehicle',
        entity_id: vehicleId,
        driver_id: v.assigned_driver_id ?? null,
        driver_email: null,
        driver_name: clean(String(v.plate_number ?? '')) || null,
        external_recipient_email: externalTo,
        task_key: taskKey,
        task_label: taskLabel,
        due_field: dueField,
        due_date: dueDate,
        request_token: token,
        request_url: magicLinkUrl,
        created_by: viewerId,
        metadata: {
          flow: 'leasing_renewal',
          vehicle_plate: v.plate_number,
          manufacturer: v.manufacturer,
          model: v.model,
          notify_sequence: notifySequence,
        },
      })
      .select('id')
      .single();

    if (ins.error) {
      if (isMissingColumns(ins.error.message ?? '')) {
        return json(
          {
            error:
              'מיגרציית מסד חסרה: הרצו 20260501153000_compliance_requests_leasing_flow.sql והפעילו מחדש את פרויקט Supabase.',
          },
          500,
        );
      }
      return json({ error: ins.error.message }, 500);
    }

    const html = buildLeasingEmailHtml({
      taskLabel,
      plate: String(v.plate_number ?? '—'),
      manufacturer: String(v.manufacturer ?? '—'),
      model: String(v.model ?? '—'),
      dueYmd: dueDate,
      primaryHref: magicLinkUrl,
    });

    const subject =
      taskKey === 'insurance'
        ? `בקשת עדכון ביטוח — רכב ${v.plate_number ?? ''}`.trim()
        : `בקשת עדכון רישוי שנתי — רכב ${v.plate_number ?? ''}`.trim();

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [externalTo],
        subject,
        html,
      }),
    });

    const resendText = await resendResp.text();
    if (!resendResp.ok) {
      await admin.from('compliance_requests').update({ status: 'expired' }).eq('id', ins.data!.id);
      return json({ error: `Resend API error (${resendResp.status}): ${resendText}` }, 502);
    }

    let emailId = '';
    try {
      const parsed = JSON.parse(resendText) as { id?: string };
      emailId = clean(parsed.id);
    } catch {
      // noop
    }
    if (!emailId) {
      await admin.from('compliance_requests').update({ status: 'expired' }).eq('id', ins.data!.id);
      return json({ error: `שליחת מייל לא אושרה: ${resendText.slice(0, 400)}` }, 502);
    }

    await admin.from('compliance_requests').update({ email_id: emailId }).eq('id', ins.data!.id);

    return json({ success: true, sent_to: externalTo, token, notify_sequence: notifySequence });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
