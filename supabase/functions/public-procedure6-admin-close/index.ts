/**
 * Manager closes a Procedure 6 complaint via response_token (from email CTA).
 * Sets status=closed, action_taken, then emails topic subscribers a summary.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyProcedure6StatusUpdate } from '../_shared/notifyProcedure6StatusUpdate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

const ACTION_OPTIONS = new Set([
  'טופל',
  'הוזהר',
  'הועבר להמשך טיפול',
  'אין ממצא',
  'אחר',
]);

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
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      action_taken?: string;
    };
    const token = clean(body.token);
    const actionTaken = clean(body.action_taken);
    if (!token) return json({ ok: false, error: 'Missing token' });
    if (!actionTaken || !ACTION_OPTIONS.has(actionTaken)) {
      return json({ ok: false, error: 'נא לבחור פעולה שננקטה' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: 'Missing server secrets' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: loadErr } = await admin
      .from('procedure6_complaints')
      .select(
        'id, org_id, vehicle_number, report_date_time, location, description, reporter_name, driver_name, driver_response, status, closed_at, report_id, response_token',
      )
      .eq('response_token', token)
      .maybeSingle();

    if (loadErr) return json({ ok: false, error: loadErr.message });
    if (!row) return json({ ok: false, error: 'הקישור אינו תקף' });
    if (row.status === 'closed' || row.closed_at) {
      return json({ ok: false, error: 'התלונה כבר נסגרה' });
    }

    const previousStatus = clean(row.status) || 'in_progress';
    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from('procedure6_complaints')
      .update({
        status: 'closed',
        closed_at: nowIso,
        action_taken: actionTaken,
      })
      .eq('id', row.id)
      .eq('response_token', token);

    if (updErr) {
      console.error('[public-procedure6-admin-close] update', updErr);
      return json({ ok: false, error: updErr.message });
    }

    try {
      await notifyProcedure6StatusUpdate(admin, {
        org_id: String(row.org_id ?? ''),
        vehicle_number: row.vehicle_number,
        report_date_time: row.report_date_time,
        location: row.location,
        description: row.description,
        reporter_name: row.reporter_name,
        driver_name: row.driver_name,
        driver_response: row.driver_response,
        action_taken: actionTaken,
        previous_status: previousStatus,
        status: 'closed',
        report_id: row.report_id,
        include_manager_actions: false,
      });
    } catch (notifyErr) {
      console.error('[public-procedure6-admin-close] notify', notifyErr);
    }

    return json({ ok: true, status: 'closed' });
  } catch (err) {
    console.error('[public-procedure6-admin-close]', err);
    return json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
});
