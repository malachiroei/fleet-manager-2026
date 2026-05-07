import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForComplianceActions } from '../_shared/complianceActionPermission.ts';

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

function ymdOrNullFromDb(v: unknown): string | null {
  const s = clean(String(v ?? ''));
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m?.[1] ?? null;
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

/** זהה ל־send-external-vehicle-renewal + בלוק הערת מנהל לפני פרטי הרכב */
function buildLeasingEmailHtmlWithOptionalNote(params: {
  taskLabel: string;
  plate: string;
  manufacturer: string;
  model: string;
  dueYmd: string | null;
  primaryHref: string;
  adminNote: string;
}): string {
  const lbl = escHtml(params.taskLabel);
  const noteBlock =
    params.adminNote.trim().length > 0
      ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin:18px 0;">
    <p style="margin:0 0 8px;font-weight:bold;color:#92400e;">הערת מנהל:</p>
    <p style="margin:0;line-height:1.65;color:#451a03;white-space:pre-wrap;">${escHtml(params.adminNote.trim())}</p>
  </div>`
      : '';

  return `
<div dir="rtl" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;text-align:right;">
  <div style="border-bottom:2px solid #0ea5e9;padding-bottom:12px;margin-bottom:16px;">
    <h1 style="margin:0;font-size:20px;color:#0369a1;">עדכון ${lbl}</h1>
    <p style="margin:6px 0 0;color:#64748b;font-size:14px;">מערכת ניהול צי רכבים</p>
  </div>
  <p style="line-height:1.7;color:#334155;">שלום,</p>
  <p style="line-height:1.75;color:#1e293b;">רישוי הרכב שלהלן <strong>עומד לפקוע / פג תוקף</strong> במערכת. נא לסרוק רישיון (או פוליס ביטוח, לפי העניין) <strong>בתוקף</strong>, לצרף בתמונה ברורה ולעדכן <strong>תאריך תוקף חדש</strong> בטופס המאובטח.</p>
  ${noteBlock}
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

type ReqBody = {
  org_id?: string;
  request_id?: string;
  admin_note?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as ReqBody;
    const orgId = clean(body.org_id);
    const requestId = clean(body.request_id);
    const adminNote = clean(body.admin_note);

    if (!orgId || !requestId) return json({ error: 'Missing org_id or request_id' }, 400);

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

    const { data: reqRow, error: qErr } = await admin
      .from('compliance_requests')
      .select('id, org_id, entity_id, task_key, task_label, status, external_recipient_email, request_url')
      .eq('id', requestId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (qErr) return json({ error: qErr.message }, 500);
    if (!reqRow) return json({ error: 'Request not found' }, 404);
    if (reqRow.status !== 'pending_admin_review') {
      return json({ error: 'הבקשה אינה במצב ממתין לאישור מנהל' }, 400);
    }
    const taskKey = clean(String(reqRow.task_key ?? ''));
    if (taskKey !== 'annual_licensing' && taskKey !== 'insurance') {
      return json({ error: 'Unsupported task' }, 400);
    }

    const externalTo = clean(String(reqRow.external_recipient_email ?? '')).toLowerCase();
    if (!externalTo.includes('@')) {
      return json({ error: 'לא נשמר מייל נציג ליסינג לבקשה זו — לא ניתן לשלוח חזרה' }, 400);
    }

    const magicLink = clean(String(reqRow.request_url ?? ''));
    if (!magicLink.startsWith('http')) {
      return json({ error: 'חסר קישור בקשה במערכת' }, 500);
    }

    const { data: v, error: vErr } = await admin
      .from('vehicles')
      .select('plate_number, manufacturer, model, test_expiry, insurance_expiry')
      .eq('id', reqRow.entity_id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (vErr) return json({ error: vErr.message }, 500);
    if (!v) return json({ error: 'Vehicle not found' }, 404);

    const plate = clean(String(v.plate_number ?? '')) || '—';
    const manufacturer = clean(String(v.manufacturer ?? '')) || '—';
    const model = clean(String(v.model ?? '')) || '—';
    const dueYmd =
      taskKey === 'insurance'
        ? ymdOrNullFromDb(v.insurance_expiry)
        : ymdOrNullFromDb(v.test_expiry);

    const taskLabel = clean(String(reqRow.task_label ?? '')) || 'עדכון מסמך';

    const html = buildLeasingEmailHtmlWithOptionalNote({
      taskLabel,
      plate,
      manufacturer,
      model,
      dueYmd,
      primaryHref: magicLink,
      adminNote,
    });

    const subject =
      taskKey === 'insurance'
        ? `בקשת עדכון ביטוח — רכב ${plate}`.trim()
        : `בקשת עדכון רישוי שנתי — רכב ${plate}`.trim();

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
      return json({ error: `Resend API error (${resendResp.status}): ${resendText.slice(0, 400)}` }, 502);
    }

    const { data: curRow } = await admin.from('compliance_requests').select('metadata').eq('id', requestId).single();
    const prevMeta =
      curRow &&
      typeof (curRow as { metadata?: unknown }).metadata === 'object' &&
      (curRow as { metadata?: unknown }).metadata !== null &&
      !Array.isArray((curRow as { metadata?: unknown }).metadata)
        ? ({ ...((curRow as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>) })
        : ({} as Record<string, unknown>);
    const prevSeq = Number(prevMeta.notify_sequence);
    const nextNotifySeq = Number.isFinite(prevSeq) && prevSeq > 0 ? prevSeq + 1 : 2;

    /** מחזיר את הנציג לשליחה מחדש — טופס ציבורי יקבל שוב (לא pending_admin_review) */
    const { error: updErr } = await admin
      .from('compliance_requests')
      .update({
        status: 'sent',
        proposed_expiry_date: null,
        submitted_document_url: null,
        sent_at: new Date().toISOString(),
        metadata: {
          ...prevMeta,
          notify_sequence: nextNotifySeq,
          last_admin_resend_note: adminNote || null,
          last_admin_resend_at: new Date().toISOString(),
        },
      })
      .eq('id', requestId);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ success: true, sent_to: externalTo, notify_sequence: nextNotifySeq });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
