/**
 * send-invite (Resend – production)
 * ────────────────────────────────────────────────────────────────────────────
 * Sends an invitation email via Resend API.
 * From: Fleet Manager Pro <invites@fleet-manager-pro.com> (verified domain).
 * Sends to the email provided in the request body.
 *
 * Request body: { org_id: string, email: string, app_origin?: string }
 * Secret: RESEND_API_KEY (npx supabase secrets set RESEND_API_KEY=re_...)
 * Invite link base URL: always https://fleet-manager-pro.com (no vercel.app).
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabasePublicObjectUrl } from '../_shared/supabasePublicUrl.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL_DEFAULT = 'https://fleet-manager-pro.com';

const FROM_EMAIL = 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function shouldForceProductionInvite(appOrigin: string): boolean {
  if (!appOrigin) return false;
  const origin = appOrigin.toLowerCase();
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('staging') ||
    origin.includes('test')
  );
}

/** תואם src/lib/fleetDefaultOrg.ts — לשימוש ב-fallback בלי import מ-Vite */
const DEFAULT_MAIN_FLEET_ORG_ID = '857f2311-2ec5-41d3-8e32-dacd450a9a77';
const DEFAULT_RAVID_FLEET_ORG_ID = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';

const INVITE_OWNER_EMAILS = new Set([
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com',
  'ravid.malachi@gmail.com',
]);

/**
 * הרשאת שליחת מייל: קודם RPC ב-DB (אם קיים), אחרת בדיקת service role —
 * כדי שלא יישארו על 403 אם המיגרציה לא רצה בפרו או profile.org_id לא מסונכרן.
 */
async function resolveInviterPermission(
  admin: ReturnType<typeof createClient>,
  uid: string,
  orgId: string,
  jwtEmail: string,
): Promise<boolean> {
  const { data: rpcOk, error: rpcErr } = await admin.rpc('inviter_may_send_org_invite_email', {
    _viewer: uid,
    _org_id: orgId,
  });
  if (!rpcErr && rpcOk === true) return true;
  if (rpcErr) {
    console.warn('[send-invite] RPC inviter_may_send_org_invite_email — using fallback', rpcErr.message);
  }

  const emailNorm = (jwtEmail ?? '').trim().toLowerCase();

  const { data: prof, error: pErr } = await admin.from('profiles').select('org_id, email, permissions').eq('id', uid).maybeSingle();
  if (pErr) console.warn('[send-invite] fallback profile', pErr.message);
  const profRow = prof as { org_id?: string | null; email?: string | null; permissions?: Record<string, unknown> } | null;

  const { data: om } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', uid)
    .eq('org_id', orgId)
    .maybeSingle();

  const profileEmail = String(profRow?.email ?? '')
    .trim()
    .toLowerCase();
  const effectiveEmail = profileEmail || emailNorm;
  const profOrg = String(profRow?.org_id ?? '').trim();

  const ravidStillOnMainInDb =
    INVITE_OWNER_EMAILS.has(effectiveEmail) &&
    effectiveEmail !== 'malachiroei@gmail.com' &&
    orgId === DEFAULT_RAVID_FLEET_ORG_ID &&
    profOrg === DEFAULT_MAIN_FLEET_ORG_ID;

  const inOrg =
    profOrg === orgId || Boolean((om as { org_id?: string } | null)?.org_id) || ravidStillOnMainInDb;

  if (!inOrg) {
    console.warn('[send-invite] fallback deny: not in org', { uid, orgId, profOrg, hasOmRow: Boolean(om) });
    return false;
  }

  const perms = profRow?.permissions;
  const manageTeam = Boolean(
    perms && typeof perms === 'object' && (perms as { manage_team?: boolean }).manage_team === true,
  );

  const { data: roles, error: rErr } = await admin.from('user_roles').select('role').eq('user_id', uid);
  if (rErr) console.warn('[send-invite] fallback user_roles', rErr.message);
  const roleList = (roles ?? []) as { role?: string }[];
  const isDbManager = roleList.some((r) => r.role === 'admin' || r.role === 'fleet_manager');

  if (manageTeam || isDbManager) return true;
  if (INVITE_OWNER_EMAILS.has(effectiveEmail)) return true;

  console.warn('[send-invite] fallback deny: role', { effectiveEmail, manageTeam, isDbManager });
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[send-invite] Request received', { method: req.method });

  try {
    let body: { org_id?: string; email?: string; app_origin?: string };
    try {
      body = (await req.json()) as { org_id?: string; email?: string; app_origin?: string };
    } catch (parseErr) {
      console.error('[send-invite] Invalid JSON body:', parseErr);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const orgId = typeof body.org_id === 'string' ? body.org_id.trim() : '';
    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const email = emailRaw && emailRaw.includes('@') ? emailRaw : '';
    const appOriginBody = typeof body.app_origin === 'string' ? normalizeOrigin(body.app_origin) : '';
    const appOriginHeader = normalizeOrigin(req.headers.get('origin') ?? '');
    const appOrigin = appOriginBody || appOriginHeader;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing org_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = bearerMatch?.[1]?.trim() ?? '';
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(accessToken);
    const uid = userData?.user?.id;
    if (userErr || !uid) {
      console.error('[send-invite] auth.getUser failed', userErr?.message ?? userErr);
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const mayInvite = await resolveInviterPermission(admin, uid, orgId, userData?.user?.email ?? '');
    if (!mayInvite) {
      console.warn('[send-invite] user not allowed to invite for org', { uid, orgId });
      return new Response(JSON.stringify({ error: 'Forbidden: cannot invite for this organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[send-invite] Parsed input', {
      org_id: orgId,
      to: `${email.slice(0, 2)}***@***`,
    });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[send-invite] Missing RESEND_API_KEY');
      return new Response(
        JSON.stringify({
          error: 'Missing RESEND_API_KEY. Set with: npx supabase secrets set RESEND_API_KEY=re_...',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const appUrl = APP_URL_DEFAULT.replace(/\/$/, '');
    const forceProductionInvite = shouldForceProductionInvite(appOrigin);
    const inviteBaseUrl = forceProductionInvite ? APP_URL_DEFAULT : appUrl;
    const inviteUrl = `${inviteBaseUrl}/auth?org_id=${encodeURIComponent(orgId)}`;

    let organizationName = 'הארגון';
    const { data: orgRow } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle();
    organizationName = (orgRow as { name?: string } | null)?.name?.trim() || organizationName;

    const logoUrl = supabaseUrl ? supabasePublicObjectUrl(supabaseUrl, 'logos/logo.jpg') : '';
    const html = `
<div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <div style="margin: 0 0 12px; text-align: right;">
    <img src="${logoUrl}" alt="Fleet Manager Pro" style="height: 40px; width: auto; display: inline-block;" />
  </div>
  <h1 style="color: #0f172a;">הזמנה להצטרף לצוות</h1>
  <p><strong>${organizationName}</strong> מזמין/ה אותך להצטרף לצוות.</p>
  <p>ההזמנה נרשמה עבור: <strong>${email}</strong></p>
  <p><a href="${inviteUrl}" style="color: #0891b2;">קבל את ההזמנה ופתח את האפליקציה</a></p>
  <p style="color: #64748b; font-size: 12px;">Fleet Manager Pro</p>
</div>`.trim();

    console.log('[send-invite] invite URL resolved', {
      app_origin: appOrigin || '(missing)',
      force_production: forceProductionInvite,
      invite_url: inviteUrl,
    });

    const resendPayload = {
      from: FROM_EMAIL,
      to: [email],
      subject: `הזמנה להצטרף ל־${organizationName} — Fleet Manager Pro`,
      html,
    };
    console.log('[send-invite] Sending to:', email);

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    const resendBody = await resendResp.text();
    if (!resendResp.ok) {
      console.error('[send-invite] Resend API error', { status: resendResp.status, body: resendBody });
      return new Response(
        JSON.stringify({ error: `Resend API error (${resendResp.status}): ${resendBody}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let resendResult: { id?: string } = {};
    try {
      resendResult = JSON.parse(resendBody) as { id?: string };
    } catch {
      console.warn('[send-invite] Resend response not JSON:', resendBody?.slice(0, 200));
    }
    console.log('[send-invite] Success', { email_id: resendResult.id, sent_to: email });

    return new Response(
      JSON.stringify({
        success: true,
        email_id: resendResult.id,
        sent_to: email,
        invite_for: email,
        organization_name: organizationName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-invite] Error:', message);
    if (err instanceof Error && err.stack) console.error('[send-invite] Stack:', err.stack);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
