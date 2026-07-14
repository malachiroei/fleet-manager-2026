/**
 * Notify org staff about a new Procedure 6 complaint (manual create / XML import).
 * Auth required. Body: { complaint_id: string }
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyProcedure6NewComplaint } from '../_shared/notifyProcedure6NewComplaint.ts';

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Missing server secrets' }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as { complaint_id?: string };
    const complaintId = clean(body.complaint_id);
    if (!complaintId) return json({ error: 'complaint_id required' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: loadErr } = await admin
      .from('procedure6_complaints')
      .select(
        'id, org_id, vehicle_number, report_date_time, location, description, reporter_name, reporter_cell_phone, driver_name, report_id',
      )
      .eq('id', complaintId)
      .maybeSingle();

    if (loadErr) return json({ error: loadErr.message }, 500);
    if (!row?.org_id) return json({ error: 'Complaint not found' }, 404);

    const orgId = clean(row.org_id);
    const { data: belongs } = await admin.rpc('user_belongs_to_org', {
      _user_id: user.id,
      _org_id: orgId,
    });
    if (!belongs) {
      const { data: mayWrite } = await admin.rpc('can_org_admin_write', {
        _user_id: user.id,
        _org_id: orgId,
      });
      if (!mayWrite) return json({ error: 'Forbidden' }, 403);
    }

    const result = await notifyProcedure6NewComplaint(admin, {
      org_id: orgId,
      vehicle_number: row.vehicle_number,
      report_date_time: row.report_date_time,
      location: row.location,
      description: row.description,
      reporter_name: row.reporter_name,
      reporter_cell_phone: row.reporter_cell_phone,
      driver_name: row.driver_name,
      report_id: row.report_id,
    });

    return json({ ok: true, ...result });
  } catch (err) {
    console.error('[send-procedure6-new-complaint-email]', err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
