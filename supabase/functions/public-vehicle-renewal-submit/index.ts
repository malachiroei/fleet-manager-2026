import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DOC_BUCKET = 'vehicle-documents';

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
    const body = (await req.json()) as {
      token?: string;
      document_image_data_url?: string;
      proposed_expiry?: string;
    };
    const token = clean(body.token);
    const docUrl = clean(body.document_image_data_url);
    const proposedYmd = ymdOrNull(body.proposed_expiry);
    if (!token) return json({ error: 'Missing token' }, 400);
    if (!docUrl) return json({ error: 'Missing document image' }, 400);
    if (!proposedYmd) return json({ error: 'Invalid proposed_expiry (YYYY-MM-DD)' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: reqRow, error: reqErr } = await admin
      .from('compliance_requests')
      .select('id, org_id, entity_id, task_key, status')
      .eq('request_token', token)
      .maybeSingle();

    if (reqErr) return json({ error: reqErr.message }, 500);
    if (!reqRow) return json({ error: 'Request not found' }, 404);
    if (reqRow.status === 'completed' || reqRow.status === 'expired') {
      return json({ error: 'This link is no longer valid' }, 410);
    }
    if (reqRow.status === 'pending_admin_review') {
      return json({ error: 'Already submitted and awaiting admin approval' }, 409);
    }

    const parsed = parseDataUrl(docUrl);
    /** URL ייחודי בכל העלאה — אחרת אותו נתיב + getPublicUrl גורמים לדפדפן/CDN להציג תמונה ישנה ממטמון אחרי שליחה מחדש */
    const unique = `${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const path = `vehicle-external-renewal/${reqRow.org_id}/${reqRow.entity_id}/${reqRow.id}/${unique}.${parsed.ext}`;
    const up = await admin.storage.from(DOC_BUCKET).upload(path, parsed.bytes, {
      contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: false,
    });
    if (up.error) return json({ error: up.error.message }, 500);

    const pub = admin.storage.from(DOC_BUCKET).getPublicUrl(path);
    const fileUrl = clean(pub.data.publicUrl);

    const { error: updErr } = await admin
      .from('compliance_requests')
      .update({
        status: 'pending_admin_review',
        proposed_expiry_date: proposedYmd,
        submitted_document_url: fileUrl,
      })
      .eq('id', reqRow.id);

    if (updErr) {
      if (
        /proposed_expiry|submitted_document|column/i.test(updErr.message) ||
        updErr.message.includes('schema cache')
      ) {
        return json(
          {
            error:
              'מיגרציית מסד חסרה — יש להפעיל את 20260501153000_compliance_requests_leasing_flow.sql',
          },
          500,
        );
      }
      return json({ error: updErr.message }, 500);
    }

    return json({
      success: true,
      message: 'המסמך הוגש בהצלחה וממתין לאישור מנהל בארגון.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
