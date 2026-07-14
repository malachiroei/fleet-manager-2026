/**
 * Public load of Procedure 6 complaint by response_token (unauthenticated).
 */
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

    const { data: row, error } = await admin
      .from('procedure6_complaints')
      .select(
        'id, vehicle_number, report_type, location, description, report_date_time, driver_name, status, closed_at, action_taken, driver_response',
      )
      .eq('response_token', token)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!row) return json({ error: 'Complaint not found' }, 404);
    if (row.status === 'closed' || row.closed_at) {
      return json({
        ok: true,
        closed: true,
        complaint: {
          vehicle_number: row.vehicle_number,
          location: row.location,
          description: row.description,
          report_date_time: row.report_date_time,
          report_type: row.report_type,
          driver_name: row.driver_name,
          driver_response: row.driver_response,
          action_taken: row.action_taken,
          status: row.status,
        },
      });
    }

    return json({
      ok: true,
      closed: false,
      complaint: {
        vehicle_number: row.vehicle_number,
        location: row.location,
        description: row.description,
        report_date_time: row.report_date_time,
        report_type: row.report_type ?? 'תלונה',
        driver_name: row.driver_name,
        status: row.status,
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
