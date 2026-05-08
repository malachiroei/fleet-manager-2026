import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  vehicle_id?: string;
  odometer_value?: number;
  photo_url?: string;
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

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim()) return Number(v);
  return NaN;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const body = (await req.json()) as Body;
    const vehicleId = clean(body.vehicle_id);
    const odometerValue = num(body.odometer_value);
    const photoUrl = clean(body.photo_url);

    if (!vehicleId || !isUuid(vehicleId)) return json({ error: 'Missing or invalid vehicle_id' }, 400);
    if (!Number.isFinite(odometerValue) || odometerValue <= 0) return json({ error: 'Missing or invalid odometer_value' }, 400);
    if (!photoUrl || photoUrl.length < 8) return json({ error: 'Missing or invalid photo_url' }, 400);

    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\\s+/i, '').trim() ?? '';
    if (!jwt) return json({ error: 'Not authenticated' }, 401);

    // auth client: who is calling?
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: u, error: userErr } = await authed.auth.getUser();
    if (userErr) return json({ error: userErr.message }, 401);
    const uid = String(u?.user?.id ?? '').trim();
    if (!uid || !isUuid(uid)) return json({ error: 'Not authenticated' }, 401);

    // admin client: write bypassing RLS, but enforce checks ourselves
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: vrow, error: vErr } = await admin
      .from('vehicles')
      .select('id, org_id, assigned_driver_id, current_odometer')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vErr) return json({ error: vErr.message }, 500);
    if (!vrow) return json({ error: 'Vehicle not found' }, 404);

    const orgId = String((vrow as any).org_id ?? '').trim();
    const assignedDriverId = String((vrow as any).assigned_driver_id ?? '').trim();

    const { data: prof } = await admin.from('profiles').select('org_id, permissions, email').eq('id', uid).maybeSingle();
    const profOrg = String((prof as any)?.org_id ?? '').trim();
    const perms = (prof as any)?.permissions as Record<string, unknown> | null | undefined;
    const hasReportMileagePerm =
      perms == null ||
      (typeof perms === 'object' &&
        (((perms as any).report_mileage === true) || Object.keys(perms).length === 0));

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', uid);
    const roleList = (roles ?? []) as Array<{ role?: string }>;
    const hasRole = roleList.some((r) => {
      const rr = String(r.role ?? '').trim().toLowerCase();
      return rr === 'admin' || rr === 'fleet_manager';
    });

    if (!hasReportMileagePerm && !hasRole) {
      return json({ error: 'Forbidden: missing report_mileage permission' }, 403);
    }

    // access to this vehicle: same org OR driver owning assignment
    let mayVehicle = false;
    if (orgId && profOrg && orgId === profOrg) mayVehicle = true;
    if (!mayVehicle && assignedDriverId) {
      const { data: d } = await admin.from('drivers').select('id, user_id').eq('id', assignedDriverId).maybeSingle();
      if (String((d as any)?.user_id ?? '').trim() === uid) mayVehicle = true;
    }
    if (!mayVehicle) {
      // check active assignment history
      const { data: a } = await admin
        .from('driver_vehicle_assignments')
        .select('id, driver_id, unassigned_at')
        .eq('vehicle_id', vehicleId)
        .is('unassigned_at', null)
        .limit(10);
      const driverIds = (a ?? []).map((x: any) => String(x.driver_id ?? '').trim()).filter(Boolean);
      if (driverIds.length > 0) {
        const { data: ds } = await admin.from('drivers').select('id, user_id').in('id', driverIds);
        if ((ds ?? []).some((x: any) => String(x.user_id ?? '').trim() === uid)) mayVehicle = true;
      }
    }
    if (!mayVehicle) return json({ error: 'Forbidden: vehicle access' }, 403);

    // write
    const { data: logRow, error: insErr } = await admin
      .from('mileage_logs')
      .insert({
        vehicle_id: vehicleId,
        odometer_value: odometerValue,
        photo_url: photoUrl,
        user_id: uid,
      })
      .select('id')
      .maybeSingle();
    if (insErr) return json({ error: insErr.message }, 500);

    const curr = Number((vrow as any).current_odometer ?? 0);
    const next = Math.max(curr, Math.ceil(odometerValue));
    const { error: upErr } = await admin
      .from('vehicles')
      .update({
        current_odometer: next,
        last_odometer_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vehicleId);
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, log_id: (logRow as any)?.id ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[submit-mileage-report] error', msg);
    return json({ error: msg }, 500);
  }
});

