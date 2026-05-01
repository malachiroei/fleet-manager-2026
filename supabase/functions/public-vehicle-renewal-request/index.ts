import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as { token?: string };
    const token = clean(body.token);
    if (!token) return json({ error: 'Missing token' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: reqRow, error } = await admin
      .from('compliance_requests')
      .select(
        'id, org_id, entity_id, task_key, task_label, due_date, status, external_recipient_email',
      )
      .eq('request_token', token)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!reqRow) return json({ error: 'Request not found' }, 404);
    if (reqRow.status === 'completed' || reqRow.status === 'expired') {
      return json({ error: 'הקישור אינו פעיל עוד' }, 410);
    }
    if (reqRow.task_key !== 'annual_licensing' && reqRow.task_key !== 'insurance') {
      return json({ error: 'Unsupported request type' }, 400);
    }

    const { data: v, error: verr } = await admin
      .from('vehicles')
      .select('plate_number, manufacturer, model, test_expiry, insurance_expiry')
      .eq('id', reqRow.entity_id)
      .eq('org_id', reqRow.org_id)
      .maybeSingle();

    if (verr) return json({ error: verr.message }, 500);
    if (!v) return json({ error: 'Vehicle not found' }, 404);

    if (reqRow.status === 'sent') {
      await admin.from('compliance_requests').update({ status: 'opened' }).eq('id', reqRow.id);
    }

    return json({
      success: true,
      item: {
        task_key: reqRow.task_key,
        task_label: reqRow.task_label,
        due_date: reqRow.due_date,
        status: reqRow.status,
        vehicle: {
          plate_number: v.plate_number,
          manufacturer: v.manufacturer,
          model: v.model,
          test_expiry: v.test_expiry,
          insurance_expiry: v.insurance_expiry,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
