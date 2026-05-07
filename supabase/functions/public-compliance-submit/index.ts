import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DOC_BUCKET = 'vehicle-documents';

type SubmitBody = {
  token?: string;
  task_key?: string;
  /** תמונת עמוד מלאה: נוסח + שם + חתימה (JPEG/PNG) */
  health_declaration_document_data_url?: string;
  health_signature_data_url?: string;
  /** תאריך תוקף הצהרה מוצהר מהעובד — אופציונלי, YYYY-MM-DD */
  declared_health_expiry?: string;
  license_image_data_url?: string;
  /** השלמה ידנית לפני OCR */
  declared_license_number?: string;
  declared_license_expiry?: string;
  /** תאריך בדיקת תקנה 585 (YYYY-MM-DD) — אופציונלי */
  declared_regulation_585_date?: string;
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
  return /^(\d{4}-\d{2}-\d{2})$/.test(s) ? s : null;
}

/** הצהרת בריאות: תוקף ברירת־מחדל עם חתימה — 3 שנים מתאריך החתימה (ב־UTC) */
function addYearsToYmdUtc(ymd: string, years: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!parts) throw new Error('invalid ymd base');
  const dt = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  dt.setUTCFullYear(dt.getUTCFullYear() + years);
  return dt.toISOString().slice(0, 10);
}

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; ext: string } {
  const m = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('Invalid image payload');
  const mime = m[1].toLowerCase();
  const base64 = m[2];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes('png') ? 'png' : 'jpg';
  return { bytes, ext };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as SubmitBody;
    const token = clean(body.token);
    const taskKey = clean(body.task_key);
    if (!token) return json({ error: 'Missing token' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: requestRow, error: reqErr } = await admin
      .from('compliance_requests')
      .select('id, org_id, driver_id, task_key, status')
      .eq('request_token', token)
      .maybeSingle();
    if (reqErr) return json({ error: reqErr.message }, 500);
    if (!requestRow) return json({ error: 'Request not found' }, 404);
    if (requestRow.status === 'completed' || requestRow.status === 'expired') {
      return json({ error: 'This link is no longer valid' }, 410);
    }
    if (!requestRow.driver_id) return json({ error: 'Request has no driver_id' }, 400);
    if (taskKey && taskKey !== requestRow.task_key) return json({ error: 'Task mismatch' }, 400);

    const nowIsoDate = new Date().toISOString().slice(0, 10);

    if (requestRow.task_key === 'health_declaration') {
      const fullPageUrl = clean(body.health_declaration_document_data_url);
      const sigUrl = clean(body.health_signature_data_url);
      const primaryUrl = fullPageUrl || sigUrl;
      if (!primaryUrl) return json({ error: 'Missing declaration document or signature' }, 400);
      const parsed = parseDataUrl(primaryUrl);
      const fileStem = fullPageUrl ? 'health-declaration-full' : 'health-signature';
      const path = `compliance-requests/${requestRow.org_id}/${requestRow.driver_id}/${requestRow.id}-${fileStem}.${parsed.ext}`;
      const up = await admin.storage.from(DOC_BUCKET).upload(path, parsed.bytes, {
        contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
      if (up.error) return json({ error: up.error.message }, 500);
      const pub = admin.storage.from(DOC_BUCKET).getPublicUrl(path);
      const fileUrl = clean(pub.data.publicUrl);

      const declaredHealthYmd = ymdOrNull(body.declared_health_expiry);
      const healthDateForDriver =
        declaredHealthYmd ??
        /* תוקף ההצהרה במערכת: ברירת מחדל 3 שנים מיום החתימה כשלא הוזן תאריך */
        addYearsToYmdUtc(nowIsoDate, 3);

      const meta = {
        declared_health_expiry: declaredHealthYmd,
        submitted_on_date: nowIsoDate,
        default_three_year_expiry: declaredHealthYmd == null,
        full_declaration_page: Boolean(fullPageUrl),
      };

      /** מסמכים לפני עדכון נהג — כדי שלא יישמר תאריך/URL בנהג אם רישום המסמכים נכשל */
      const { error: docErr } = await admin.from('compliance_docs').insert({
        request_id: requestRow.id,
        org_id: requestRow.org_id,
        driver_id: requestRow.driver_id,
        task_key: requestRow.task_key,
        file_url: fileUrl,
        file_kind: 'signature',
        metadata: meta,
      });
      if (docErr) return json({ error: docErr.message }, 500);

      const { error: ddErr } = await admin.from('driver_documents').insert({
        driver_id: requestRow.driver_id,
        title: fullPageUrl ? 'הצהרת בריאות - מסמך מלא (נוסח וחתימה)' : 'הצהרת בריאות - חתימה',
        file_url: fileUrl,
      });
      if (ddErr) return json({ error: ddErr.message }, 500);

      const { error: updErr } = await admin
        .from('drivers')
        .update({
          health_declaration_date: healthDateForDriver,
          health_declaration_url: fileUrl,
          status: 'active',
        })
        .eq('id', requestRow.driver_id)
        .eq('org_id', requestRow.org_id);
      if (updErr) return json({ error: updErr.message }, 500);
    } else if (requestRow.task_key === 'driver_license') {
      const licenseUrl = clean(body.license_image_data_url);
      if (!licenseUrl) return json({ error: 'Missing license image' }, 400);
      const declaredLicYmd = ymdOrNull(body.declared_license_expiry);
      const declaredLicNo = clean(body.declared_license_number);
      const parsed = parseDataUrl(licenseUrl);
      const path = `compliance-requests/${requestRow.org_id}/${requestRow.driver_id}/${requestRow.id}-license.${parsed.ext}`;
      const up = await admin.storage.from(DOC_BUCKET).upload(path, parsed.bytes, {
        contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
      if (up.error) return json({ error: up.error.message }, 500);
      const pub = admin.storage.from(DOC_BUCKET).getPublicUrl(path);
      const fileUrl = clean(pub.data.publicUrl);

      const driverPatch: Record<string, unknown> = {
        license_front_url: fileUrl,
        status: 'pending_approval',
      };
      if (declaredLicYmd) {
        driverPatch.pending_license_expiry = declaredLicYmd;
      }

      let updErr = (await admin.from('drivers').update(driverPatch).eq('id', requestRow.driver_id).eq('org_id', requestRow.org_id))
        .error;
      if (
        updErr &&
        /pending_license_expiry|column|schema cache/i.test(String(updErr.message ?? ''))
      ) {
        const { pending_license_expiry: _p, ...fallbackPatch } = driverPatch;
        void _p;
        updErr = (await admin
          .from('drivers')
          .update(fallbackPatch)
          .eq('id', requestRow.driver_id)
          .eq('org_id', requestRow.org_id)).error;
      }
      if (updErr) return json({ error: updErr.message }, 500);

      const { error: docErr } = await admin.from('compliance_docs').insert({
        request_id: requestRow.id,
        org_id: requestRow.org_id,
        driver_id: requestRow.driver_id,
        task_key: requestRow.task_key,
        file_url: fileUrl,
        file_kind: 'license_photo',
        metadata: {
          declared_license_expiry: declaredLicYmd,
          declared_license_number: declaredLicNo || null,
        },
      });
      if (docErr) return json({ error: docErr.message }, 500);

      const { error: ddLicenseErr } = await admin.from('driver_documents').insert({
        driver_id: requestRow.driver_id,
        title: 'רישיון נהיגה - ממתין לאישור',
        file_url: fileUrl,
      });
      if (ddLicenseErr) return json({ error: ddLicenseErr.message }, 500);
    } else if (requestRow.task_key === 'regulation_585') {
      const scanUrl = clean(body.license_image_data_url);
      if (!scanUrl) return json({ error: 'Missing regulation 585 scan image' }, 400);
      const declaredInspectYmd = ymdOrNull(body.declared_regulation_585_date);
      const inspectionDateForDriver = declaredInspectYmd ?? nowIsoDate;
      const parsed = parseDataUrl(scanUrl);
      const path = `compliance-requests/${requestRow.org_id}/${requestRow.driver_id}/${requestRow.id}-reg585.${parsed.ext}`;
      const up = await admin.storage.from(DOC_BUCKET).upload(path, parsed.bytes, {
        contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
      if (up.error) return json({ error: up.error.message }, 500);
      const pub = admin.storage.from(DOC_BUCKET).getPublicUrl(path);
      const fileUrl = clean(pub.data.publicUrl);

      const { error: docErr } = await admin.from('compliance_docs').insert({
        request_id: requestRow.id,
        org_id: requestRow.org_id,
        driver_id: requestRow.driver_id,
        task_key: requestRow.task_key,
        file_url: fileUrl,
        /** תואם CHECK קיים בפרו (signature | license_photo) — ללא מיגרציה */
        file_kind: 'license_photo',
        metadata: {
          regulation_585: true,
          declared_regulation_585_date: declaredInspectYmd,
          submitted_on_date: nowIsoDate,
        },
      });
      if (docErr) return json({ error: docErr.message }, 500);

      const { error: ddErr } = await admin.from('driver_documents').insert({
        driver_id: requestRow.driver_id,
        title: 'תקנה 585 ב׳ — סריקת בדיקה',
        file_url: fileUrl,
      });
      if (ddErr) return json({ error: ddErr.message }, 500);

      const { error: updErr } = await admin
        .from('drivers')
        .update({
          regulation_585b_date: inspectionDateForDriver,
          status: 'active',
        })
        .eq('id', requestRow.driver_id)
        .eq('org_id', requestRow.org_id);
      if (updErr) return json({ error: updErr.message }, 500);
    } else {
      return json({ error: 'This task is not yet supported in public submit flow' }, 400);
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let closeErr: { message?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(120 * attempt);
      closeErr = (
        await admin
          .from('compliance_requests')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            consumed_at: new Date().toISOString(),
          })
          .eq('id', requestRow.id)
      ).error;
      const closeMsg = closeErr?.message ?? '';
      if (
        closeErr &&
        (/completed_at|consumed_at|column/i.test(closeMsg) || /schema cache/i.test(closeMsg))
      ) {
        closeErr = (await admin.from('compliance_requests').update({ status: 'completed' }).eq('id', requestRow.id)).error;
      }
      if (!closeErr) break;
    }
    if (closeErr) {
      console.error('[public-compliance-submit] compliance_requests close failed after successful upload:', closeErr);
      const thankByTaskPartial: Record<string, string> = {
        driver_license:
          'הרישיון הועלה בהצלחה. העדכון הועבר לאישור מנהל בארגון — רק לאחר האישור יעודכנו הצילום ותאריך התוקף בכרטיס הנהג.',
        health_declaration: 'הצהרת הבריאות נשמרה בהצלחה. תודה.',
        regulation_585: 'סריקת תקנה 585 נשמרה בכרטיס הנהג. תודה.',
      };
      const messagePartial =
        thankByTaskPartial[String(requestRow.task_key) ?? ''] ?? 'העדכון נקלט בהצלחה. תודה.';
      return json({
        success: true,
        message: messagePartial,
        warning:
          'הנתונים נשמרו; סגירת הקישור במערכת נכשלה — אם מתקבלת הודעת שגיאה בצד הטלפון, אפשר לסגור את הדף. הקישור אינו בשימוש.',
      });
    }

    const thankByTask: Record<string, string> = {
      driver_license:
        'הרישיון הועלה בהצלחה. העדכון הועבר לאישור מנהל בארגון — רק לאחר האישור יעודכנו הצילום ותאריך התוקף בכרטיס הנהג.',
      health_declaration: 'הצהרת הבריאות נשמרה בהצלחה. תודה.',
      regulation_585: 'סריקת תקנה 585 נשמרה בכרטיס הנהג. תודה.',
    };
    const message =
      thankByTask[String(requestRow.task_key) ?? ''] ??
      'העדכון נקלט בהצלחה. תודה.';

    return json({ success: true, message });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
