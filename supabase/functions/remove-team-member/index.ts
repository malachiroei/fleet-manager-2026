/**
 * הסרת חבר צוות — Edge Function (לא תלוי ב-RPC ב-PostgREST / schema cache).
 * גוף הלוגיקה תואם remove_team_member_from_org במיגרציה.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForTeamActions } from '../_shared/teamAdminActionPermission.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: { org_id?: string; member_user_id?: string; suspend_account?: boolean };
    try {
      body = (await req.json()) as {
        org_id?: string;
        member_user_id?: string;
        suspend_account?: boolean;
      };
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orgId = typeof body.org_id === 'string' ? body.org_id.trim() : '';
    const memberUserId = typeof body.member_user_id === 'string' ? body.member_user_id.trim() : '';
    const suspendAccount = body.suspend_account === true;
    if (!orgId || !memberUserId) {
      return new Response(JSON.stringify({ error: 'Missing org_id or member_user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
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
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (uid === memberUserId) {
      return new Response(JSON.stringify({ error: 'cannot remove yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const allowed = await callerMayManageOrgForTeamActions(admin, uid, orgId, userData?.user?.email ?? '');
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerRow } = await admin.from('profiles').select('id').eq('id', uid).maybeSingle();
    let callerProfileId = (callerRow as { id?: string } | null)?.id ?? null;
    if (!callerProfileId) {
      const { data: alt } = await admin.from('profiles').select('id').eq('user_id', uid).maybeSingle();
      callerProfileId = (alt as { id?: string } | null)?.id ?? null;
    }

    const { error: delErr } = await admin.from('org_members').delete().eq('org_id', orgId).eq('user_id', memberUserId);
    if (delErr) {
      console.error('[remove-team-member] org_members delete', delErr);
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: remaining } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', memberUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const nextOrgId = (remaining as { org_id?: string } | null)?.org_id ?? null;

    const { data: memberProf } = await admin
      .from('profiles')
      .select('id, org_id, parent_admin_id, managed_by_user_id, user_id')
      .or(`id.eq.${memberUserId},user_id.eq.${memberUserId}`)
      .maybeSingle();

    const mp = memberProf as {
      id?: string;
      user_id?: string | null;
      org_id?: string | null;
      parent_admin_id?: string | null;
      managed_by_user_id?: string | null;
    } | null;

    const profileRowId = (mp?.id ?? memberUserId).trim();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (mp?.org_id === orgId) {
      updates.org_id = nextOrgId;
    }
    if (callerProfileId) {
      if (mp?.parent_admin_id === callerProfileId) updates.parent_admin_id = null;
      if (mp?.managed_by_user_id === callerProfileId) updates.managed_by_user_id = null;
    }
    if (suspendAccount) {
      updates.status = 'suspended';
    }

    const { error: upErr } = await admin.from('profiles').update(updates).eq('id', profileRowId);
    if (upErr) {
      console.error('[remove-team-member] profiles update', upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[remove-team-member]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
