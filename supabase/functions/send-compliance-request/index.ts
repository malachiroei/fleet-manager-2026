import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForComplianceActions } from '../_shared/complianceActionPermission.ts';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';
import { bccExcludingPrimary, loadFilteredNotificationEmails } from '../_shared/loadFilteredNotificationEmails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL_DEFAULT = 'https://fleet-app.com';
const FROM_EMAIL = 'מערכת ניהול צי רכבים <invites@fleet-manager-pro.com>';

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
  /** הערה למקבל המייל (למשל מייל חזרה ממסך «ממתין לאישור מנהל») */
  admin_note?: string | null;
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

/** תאריך יעד YYYY-MM-DD לתצוגה בעברית */
function formatDueHebrewUtc(ymd: string | null): string {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return escHtml(ymd);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
}

/** יישור עם `src/lib/healthDeclarationLegalHe.tsx` — טקסט ההצהרה במייל */
function healthDeclarationEmailLegalHtml(driverName: string): string {
  const signer = escHtml(driverName.trim() || '________________');
  const paragraphs: string[] = [
    'מצהיר בזה כי לא נתגלו אצלי, למיטב ידיעתי, מגבלות במערכת העצבים, העצמות, הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.',
    '1. לא נפסלתי מלהחזיק ברישיון נהיגה מבית משפט רשות הרישוי או קצין משטרה, ולחלופין רישיון הנהיגה אשר ברשותי לא הושעה על ידי גורמים כאמור.',
    '2. אין לי כל מגבלה בריאותית או רפואית המונעת ממני להחזיק ברישיון נהיגה.',
    '3. אינני צורך סמים.',
    '4. אינני צורך אלכוהול מעבר לכמות המותרת על פי דין בעת נהיגה. אני מתחייב/ת כי במידה ויוטלו הגבלות איזה שהן על רישיון הנהיגה אשר ברשותי ולחלופין, במידה יחול שינוי במצב בריאותי באופן המונע ממני מלהמשיך ולנהוג, אדווח על כך מיידית לקצין הבטיחות.',
    '5. הנני מצהיר/ה בזאת כי קיבלתי הדרכה לצורך תפעול וההפעלה של הרכב.',
    'ידוע לי שלפי תקנה 585א קצין הבטיחות בתעבורה בחברה מחויב לבדוק את נתוני רישיון הנהיגה שלי במשרד הרישוי.',
    'אני מצהיר בזה כי הצהרתי הנ״ל אמת.',
  ];
  const inner = paragraphs
    .map(
      (t) =>
        `<p style="margin:10px 0;line-height:1.75;color:#1e293b;font-size:14px;">${escHtml(t)}</p>`,
    )
    .join('');
  return `
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:18px 0;background:#f8fafc;text-align:right;">
    <p style="margin:0 0 14px;font-size:16px;font-weight:bold;color:#0f172a;">אני החתום מטה: ${signer}</p>
    ${inner}
    <p style="margin:18px 0 6px;font-weight:bold;color:#0f172a;font-size:14px;">חתימה:</p>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">במסך הבא תחתמו בעט דיגיטלי; לאחר השליחה יישמר במערכת קובץ תמונה הכולל את נוסח ההצהרה, את שמכם ואת החתימה בעמוד אחד.</p>
  </div>`;
}

function buildHebrewComplianceEmail(params: {
  taskKey: string;
  driverName: string;
  taskLabel: string;
  tabLabel: string;
  dueDateYmd: string | null;
  primaryHref: string;
  persistedToken: boolean;
  adminNotePlain?: string | null;
}): string {
  const name = escHtml(params.driverName.trim() || 'שלום');
  const taskLbl = escHtml(params.taskLabel);
  const tabLbl = escHtml(params.tabLabel);
  const dueLine = params.dueDateYmd
    ? `<p style="margin:12px 0;line-height:1.6;"><strong>תאריך התוקף במערכת:</strong> ${formatDueHebrewUtc(params.dueDateYmd)}</p>`
    : '';
  const adminNoteTrimmed = clean(params.adminNotePlain ?? '');
  const adminNoteBlock = adminNoteTrimmed
    ? `<div style="border-right:4px solid #f59e0b;padding:12px 14px;margin:18px 0;background:#fffbeb;border-radius:8px;text-align:right;">
  <p style="margin:0 0 6px;font-weight:bold;color:#92400e;font-size:14px;">הערת מנהל</p>
  <p style="margin:0;line-height:1.65;color:#78350f;font-size:14px;white-space:pre-wrap;">${escHtml(adminNoteTrimmed)}</p>
</div>`
    : '';

  const middleSection =
    params.taskKey === 'driver_license'
      ? `
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin:18px 0;text-align:right;line-height:1.65;color:#0c4a6e;">
    <p style="margin:0 0 8px;"><strong>נדרש רישיון נהיגה עדכני</strong></p>
    <p style="margin:0;">אנא צלמו או הסריקו את <strong>רישיון הנהיגה החדש</strong> באופן <strong>ברור וקריא</strong> (כל הפרטים חייבים להיות גלויים), והעלו את הקובץ דרך כפתור המעקב למטה.</p>
  </div>`
      : params.taskKey === 'health_declaration'
        ? healthDeclarationEmailLegalHtml(params.driverName)
        : `
  <p style="text-align:right;line-height:1.65;color:#334155;margin:14px 0;">נדרש ממך עדכון המסמך עבור: <strong>${tabLbl}</strong>. פרטים מלאים בדף הקישור.</p>`;

  const btnLabel = params.persistedToken ? 'מעבר לטופס העלאה מאובטח' : 'כניסה למערכת';
  const introNoLink = params.persistedToken
    ? ''
    : `<p style="text-align:right;line-height:1.65;color:#b45309;margin:14px 0;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fcd34d;">מיגרציית מסד הנתונים לבקשות ציות טרם הופעלה בפרויקט. יש להיכנס למערכת דרך הכפתור למטה ולהשלים את העדכון משם.</p>`;

  return `
<div dir="rtl" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;text-align:right;">
  <div style="border-bottom:2px solid #0ea5e9;padding-bottom:12px;margin-bottom:16px;">
    <h1 style="margin:0;font-size:20px;color:#0369a1;">מערכת ניהול צי רכבים</h1>
    <p style="margin:6px 0 0;color:#64748b;font-size:14px;">בקשת עדכון מסמכים</p>
  </div>
  <p style="font-size:17px;line-height:1.5;"><strong>${name},</strong></p>
  <p style="line-height:1.65;color:#334155;margin:14px 0;">הוזמנת לעדכן במערכת: <strong>${taskLbl}</strong> (${tabLbl}).</p>
  ${dueLine}
  ${adminNoteBlock}
  ${middleSection}
  ${introNoLink}
  <div style="text-align:center;margin:28px 0;">
    <a href="${params.primaryHref}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold;font-size:15px;">
      ${btnLabel}
    </a>
  </div>
  <p style="font-size:12px;color:#64748b;word-break:break-all;text-align:right;">אם הכפתור לא נפתח, העתיקו את הקישור:<br/><span dir="ltr" style="display:inline-block;margin-top:6px;">${escHtml(params.primaryHref)}</span></p>
  <p style="font-size:11px;color:#94a3b8;margin-top:24px;text-align:right;">נשלח אוטומטית מהמערכת · אין להשיב להודעה זו</p>
</div>`.trim();
}

/** DB migration not applied — PostgREST «schema cache» / missing relation */
function isMissingComplianceRequestsTable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('compliance_requests') &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find'))
  );
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
    const adminNote = clean(body.admin_note);

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
    const mayManage = await callerMayManageOrgForComplianceActions(admin, viewerId, orgId, authData?.user?.email ?? '');
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

    const { count: priorRowsCount, error: seqCountErr } = await admin
      .from('compliance_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('task_key', taskKey);
    if (seqCountErr) return json({ error: seqCountErr.message }, 500);
    const notifySequence = (priorRowsCount ?? 0) + 1;

    /** מונע מצב שבו נשארות שתי בקשות sent/opened לאותו נהג+משימה — חתימה סוגרת רק אחת והמגדל נשאר «ממתין» */
    await admin
      .from('compliance_requests')
      .update({ status: 'expired' })
      .eq('org_id', orgId)
      .eq('driver_id', driverId)
      .eq('task_key', taskKey)
      .in('status', ['sent', 'opened']);

    const baseUrl = clean(Deno.env.get('COMPLIANCE_UPDATE_BASE_URL')) || APP_URL_DEFAULT;
    const appBase = baseUrl.replace(/\/+$/, '');
    const token = randomToken();
    const magicLinkUrl = `${appBase}/update/${token}`;

    let insertedId: string | null = null;
    let persistedToken = true;

    const ins = await admin
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
        request_url: magicLinkUrl,
        created_by: viewerId,
        metadata: {
          tab_label: tabLabel,
          cta_text: ctaText,
          notify_sequence: notifySequence,
          ...(adminNote ? { admin_note: adminNote } : {}),
        },
      })
      .select('id')
      .single();

    if (ins.error) {
      if (!isMissingComplianceRequestsTable(ins.error.message ?? '')) {
        return json({ error: ins.error.message }, 500);
      }
      console.warn(
        '[send-compliance-request] compliance_requests table missing / not in schema cache — sending email without persisted token. Apply migration 20260430110000_create_compliance_requests.sql',
      );
      persistedToken = false;
    } else {
      insertedId = ins.data?.id ?? null;
    }

    const primaryHref = persistedToken ? magicLinkUrl : `${appBase}/auth`;
    const innerHtml = buildHebrewComplianceEmail({
      taskKey,
      driverName,
      taskLabel,
      tabLabel,
      dueDateYmd: dueDate,
      primaryHref,
      persistedToken,
      adminNotePlain: adminNote || null,
    });
    const html = wrapEmailBodyWithBrand(supabaseUrl, innerHtml);
    const staffBcc = bccExcludingPrimary(
      [driverEmail],
      await loadFilteredNotificationEmails(admin, 'compliance_driver_copy', orgId || null),
    );

    /** נושא בעברית בלבד */
    const emailSubject =
      taskKey === 'driver_license' ? 'נדרש עדכון רישיון נהיגה' : `נדרש עדכון מסמך: ${taskLabel}`;

    const resendPayload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to: [driverEmail],
      subject: emailSubject,
      html,
    };
    if (staffBcc.length > 0) resendPayload.bcc = staffBcc;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
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

    if (!emailId) {
      return json(
        { error: `שליחת המייל לא אושרה: לא התקבל מזהה הודעה מ-Resend. פלט: ${resendText.slice(0, 400)}` },
        502,
      );
    }

    if (emailId && insertedId) {
      await admin.from('compliance_requests').update({ email_id: emailId }).eq('id', insertedId);
    }

    return json({
      success: true,
      token,
      request_url: persistedToken ? magicLinkUrl : primaryHref,
      email_id: emailId || null,
      sent_to: driverEmail,
      persisted_token: persistedToken,
      ...(insertedId ? { notify_sequence: notifySequence } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
