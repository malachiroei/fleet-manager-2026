import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadFilteredNotificationEmails } from '../_shared/loadFilteredNotificationEmails.ts';
import { shouldAppendDriverCopyForRecipients } from '../_shared/notificationDriverCopy.ts';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  vehicle_id?: string;
  odometer_value?: number;
  photo_url?: string | null;
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

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uniqueEmails(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (!v || !v.includes('@') || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

async function sendResendEmail(params: {
  resendApiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, error: `Resend error: ${errText}` };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail =
      Deno.env.get('NOTIFY_FROM_EMAIL') || 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

    const body = (await req.json()) as Body;
    const vehicleId = clean(body.vehicle_id);
    const odometerValue = num(body.odometer_value);
    const photoUrlIn = clean(body.photo_url);

    if (!vehicleId || !isUuid(vehicleId)) return json({ error: 'Missing or invalid vehicle_id' }, 400);
    if (!Number.isFinite(odometerValue) || odometerValue <= 0) return json({ error: 'Missing or invalid odometer_value' }, 400);

    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (!jwt) return json({ error: 'Not authenticated' }, 401);

    // auth client: who is calling?
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: u, error: userErr } = await authed.auth.getUser();
    if (userErr) {
      return json({ error: `Invalid JWT: ${userErr.message}` }, 401);
    }
    const uid = String(u?.user?.id ?? '').trim();
    if (!uid || !isUuid(uid)) return json({ error: 'Not authenticated' }, 401);

    // admin client: write bypassing RLS, but enforce checks ourselves
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: vrow, error: vErr } = await admin
      .from('vehicles')
      .select('id, org_id, plate_number, manufacturer, model, assigned_driver_id, current_odometer')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vErr) return json({ error: vErr.message }, 500);
    if (!vrow) return json({ error: 'Vehicle not found' }, 404);

    const orgId = String((vrow as any).org_id ?? '').trim();
    const plate = String((vrow as any).plate_number ?? '').trim();
    const vehicleLabel = `${String((vrow as any).manufacturer ?? '').trim()} ${String((vrow as any).model ?? '').trim()}`.trim();
    const assignedDriverId = String((vrow as any).assigned_driver_id ?? '').trim();

    // caller profile/org + permissions/roles
    const { data: prof } = await admin
      .from('profiles')
      .select('org_id, permissions, email')
      .eq('id', uid)
      .maybeSingle();
    const profOrg = String((prof as any)?.org_id ?? '').trim();
    const perms = (prof as any)?.permissions as Record<string, unknown> | null | undefined;
    const hasReportMileagePerm =
      perms == null ||
      (typeof perms === 'object' && (((perms as any).report_mileage === true) || Object.keys(perms).length === 0));

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
      const { data: a } = await admin
        .from('driver_vehicle_assignments')
        .select('driver_id, unassigned_at')
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

    const origin =
      req.headers.get('origin')?.trim() ||
      (() => {
        const ref = req.headers.get('referer')?.trim() ?? '';
        try {
          return ref ? new URL(ref).origin : '';
        } catch {
          return '';
        }
      })();
    const vehicleUrl = origin ? `${origin}/vehicles/${vehicleId}` : '';
    const docUrlFallback = vehicleUrl ? `${vehicleUrl}#documents` : 'about:blank';

    // Insert mileage log (photo optional, but DB might require it; we retry with fallback if needed)
    const preferredPhotoUrl = photoUrlIn || null;
    const insertMileage = async (photo: string | null) => {
      return await admin
        .from('mileage_logs')
        .insert({
          vehicle_id: vehicleId,
          odometer_value: odometerValue,
          photo_url: photo,
          user_id: uid,
        } as any)
        .select('id')
        .maybeSingle();
    };

    let logId: string | null = null;
    {
      const r1 = await insertMileage(preferredPhotoUrl);
      if (r1.error) {
        const msg = String((r1.error as any)?.message ?? '');
        const wantsPhoto = msg.toLowerCase().includes('photo_url') && msg.toLowerCase().includes('null');
        if (wantsPhoto) {
          const r2 = await insertMileage(docUrlFallback);
          if (r2.error) return json({ error: r2.error.message }, 500);
          logId = String((r2.data as any)?.id ?? '') || null;
        } else {
          return json({ error: r1.error.message }, 500);
        }
      } else {
        logId = String((r1.data as any)?.id ?? '') || null;
      }
    }

    // Update vehicle odometer
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

    // Insert a vehicle document row (so it appears in vehicle documents)
    const docUrl = preferredPhotoUrl || docUrlFallback;
    const docTitle = `עדכון ק"מ - ${plate || '—'} - ${Number(odometerValue).toLocaleString('he-IL')} ק"מ`;
    const { error: docErr } = await admin.from('vehicle_documents').insert({
      vehicle_id: vehicleId,
      title: docTitle,
      file_url: docUrl,
      document_type: 'mileage_update',
      metadata: {
        odometer_value: odometerValue,
        photo_url: preferredPhotoUrl || null,
        created_by: uid,
        log_id: logId,
        vehicle_url: vehicleUrl || null,
      },
    } as any);
    if (docErr) return json({ error: docErr.message }, 500);

    // Resolve recipients: ui_settings.admin_email + ניתוב מיילים לארגון (כל אדמין + legacy)
    let recipients: string[] = [];
    try {
      const { data: ui } = await admin
        .from('ui_settings')
        .select('admin_email')
        .eq('org_id', orgId)
        .maybeSingle();
      const uiEmail = String((ui as any)?.admin_email ?? '').trim();

      const kvEmails = await loadFilteredNotificationEmails(admin, 'mileage_update', orgId);

      recipients = uniqueEmails([uiEmail, ...kvEmails]);
      let driverEmail = '';
      if (assignedDriverId && isUuid(assignedDriverId)) {
        const { data: dr } = await admin.from('drivers').select('email').eq('id', assignedDriverId).maybeSingle();
        driverEmail = String((dr as { email?: string | null } | null)?.email ?? '').trim();
      }
      if (driverEmail.includes('@') && recipients.length > 0) {
        if (await shouldAppendDriverCopyForRecipients(admin, orgId, recipients)) {
          recipients = uniqueEmails([...recipients, driverEmail]);
        }
      }
    } catch {
      recipients = [];
    }

    // Send email best-effort (do not fail the update if email fails)
    let emailError: string | null = null;
    if (resendApiKey && recipients.length > 0) {
      const safeDocUrl = escHtml(docUrl);
      const safeVehicleUrl = escHtml(vehicleUrl || '');
      const innerHtml = `
        <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
          <h2 style="margin-bottom: 8px;">עדכון ק״מ</h2>
          <p style="margin: 0 0 10px 0;">
            <strong dir="ltr">${escHtml(plate || '')}</strong>
            ${vehicleLabel ? `<span> · ${escHtml(vehicleLabel)}</span>` : ''}
          </p>
          <table style="border-collapse:collapse;width:100%;max-width:560px;">
            <tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;">ק״מ חדש</td><td style="padding:6px 0;">${Number(odometerValue).toLocaleString('he-IL')} ק״מ</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;">צילום</td><td style="padding:6px 0;">${preferredPhotoUrl ? 'צורף' : 'לא צורף'}</td></tr>
          </table>
          ${safeVehicleUrl ? `<p style="margin-top:12px;"><a href="${safeVehicleUrl}" target="_blank" rel="noopener noreferrer">פתיחת כרטיס רכב</a></p>` : ''}
          ${safeDocUrl ? `<p style="margin-top:6px;"><a href="${safeDocUrl}" target="_blank" rel="noopener noreferrer">פתיחת מסמך</a></p>` : ''}
          <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">נשלח אוטומטית ממערכת Fleet Manager Pro.</p>
        </div>
      `.trim();

      const html = wrapEmailBodyWithBrand(supabaseUrl, innerHtml);

      const subject = `עדכון ק״מ — ${plate || 'רכב'} — ${Number(odometerValue).toLocaleString('he-IL')} ק״מ`;
      const send = await sendResendEmail({
        resendApiKey,
        from: fromEmail,
        to: recipients,
        subject,
        html,
      });
      if (!send.ok) emailError = send.error;
    } else if (!resendApiKey && recipients.length > 0) {
      emailError = 'Missing RESEND_API_KEY';
    }

    return json({
      ok: true,
      log_id: logId,
      recipients,
      ...(emailError ? { email_error: emailError } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[update-mileage] error', msg);
    return json({ error: msg }, 500);
  }
});

