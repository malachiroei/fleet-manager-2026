/**
 * Public load of Procedure 6 complaint for manager quick-action page (by response_token).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
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
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = clean(body.token);
    if (!token) return json({ ok: false, error: 'Missing token' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: 'Missing server secrets' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error } = await admin
      .from('procedure6_complaints')
      .select(
        'id, org_id, vehicle_number, report_type, location, description, report_date_time, driver_name, driver_response, action_taken, status, closed_at, reporter_name, forwarded_to_email, driver_id',
      )
      .eq('response_token', token)
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message });
    if (!row) return json({ ok: false, error: 'הקישור אינו תקף' });

    return json({
      ok: true,
      closed: row.status === 'closed' || Boolean(row.closed_at),
      complaint: {
        vehicle_number: row.vehicle_number,
        report_type: row.report_type ?? 'תלונה',
        location: row.location,
        description: row.description,
        report_date_time: row.report_date_time,
        driver_name: row.driver_name,
        driver_response: row.driver_response,
        action_taken: row.action_taken,
        status: row.status,
        reporter_name: row.reporter_name,
        has_driver_email: Boolean(clean(row.forwarded_to_email)) || Boolean(row.driver_id),
      },
    });
  } catch (err) {
    return json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
});
