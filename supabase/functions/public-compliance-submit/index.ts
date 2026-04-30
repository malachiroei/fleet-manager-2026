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
  health_signature_data_url?: string;
  license_image_data_url?: string;
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
      const sigUrl = clean(body.health_signature_data_url);
      if (!sigUrl) return json({ error: 'Missing signature' }, 400);
      const parsed = parseDataUrl(sigUrl);
      const path = `compliance-requests/${requestRow.org_id}/${requestRow.driver_id}/${requestRow.id}-health-signature.${parsed.ext}`;
      const up = await admin.storage.from(DOC_BUCKET).upload(path, parsed.bytes, {
        contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
      if (up.error) return json({ error: up.error.message }, 500);
      const pub = admin.storage.from(DOC_BUCKET).getPublicUrl(path);
      const fileUrl = clean(pub.data.publicUrl);

      const { error: updErr } = await admin
        .from('drivers')
        .update({
          health_declaration_date: nowIsoDate,
          health_declaration_url: fileUrl,
          status: 'active',
        })
        .eq('id', requestRow.driver_id)
        .eq('org_id', requestRow.org_id);
      if (updErr) return json({ error: updErr.message }, 500);

      const { error: docErr } = await admin.from('compliance_docs').insert({
        request_id: requestRow.id,
        org_id: requestRow.org_id,
        driver_id: requestRow.driver_id,
        task_key: requestRow.task_key,
        file_url: fileUrl,
        file_kind: 'signature',
      });
      if (docErr) return json({ error: docErr.message }, 500);

      await admin.from('driver_documents').insert({
        driver_id: requestRow.driver_id,
        title: 'הצהרת בריאות - חתימה',
        file_url: fileUrl,
      });
    } else if (requestRow.task_key === 'driver_license') {
      const licenseUrl = clean(body.license_image_data_url);
      if (!licenseUrl) return json({ error: 'Missing license image' }, 400);
      const parsed = parseDataUrl(licenseUrl);
      const path = `compliance-requests/${requestRow.org_id}/${requestRow.driver_id}/${requestRow.id}-license.${parsed.ext}`;
      const up = await admin.storage.from(DOC_BUCKET).upload(path, parsed.bytes, {
        contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
      if (up.error) return json({ error: up.error.message }, 500);
      const pub = admin.storage.from(DOC_BUCKET).getPublicUrl(path);
      const fileUrl = clean(pub.data.publicUrl);

      const { error: updErr } = await admin
        .from('drivers')
        .update({
          license_front_url: fileUrl,
          status: 'pending_approval',
        })
        .eq('id', requestRow.driver_id)
        .eq('org_id', requestRow.org_id);
      if (updErr) return json({ error: updErr.message }, 500);

      const { error: docErr } = await admin.from('compliance_docs').insert({
        request_id: requestRow.id,
        org_id: requestRow.org_id,
        driver_id: requestRow.driver_id,
        task_key: requestRow.task_key,
        file_url: fileUrl,
        file_kind: 'license_photo',
      });
      if (docErr) return json({ error: docErr.message }, 500);

      await admin.from('driver_documents').insert({
        driver_id: requestRow.driver_id,
        title: 'רישיון נהיגה - ממתין לאישור',
        file_url: fileUrl,
      });
    } else {
      return json({ error: 'This task is not yet supported in public submit flow' }, 400);
    }

    const { error: closeErr } = await admin
      .from('compliance_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        consumed_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id);
    if (closeErr) return json({ error: closeErr.message }, 500);

    return json({ success: true, message: 'Thank you, your record has been updated!' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
