/**
 * הרשאות משותפות: הזמנת מייל (send-invite) והסרת חבר צוות (remove-team-member).
 * כולל: מלכי / is_system_admin, RPC אם קיים, ו-fallback עם service role.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_MAIN_FLEET_ORG_ID = '857f2311-2ec5-41d3-8e32-dacd450a9a77';
const DEFAULT_RAVID_FLEET_ORG_ID = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';

const INVITE_OWNER_EMAILS = new Set([
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com',
  'ravid.malachi@gmail.com',
]);

export type AdminClient = ReturnType<typeof createClient>;

/** האם המשתמש המחובר רשאי לפעולות ניהול צוות (הזמנה / הסרה) על org_id */
export async function callerMayManageOrgForTeamActions(
  admin: AdminClient,
  uid: string,
  orgId: string,
  jwtEmail: string,
): Promise<boolean> {
  const { data: orgRow, error: orgErr } = await admin.from('organizations').select('id').eq('id', orgId).maybeSingle();
  if (orgErr) console.warn('[team-admin] org lookup', orgErr.message);
  if (!orgRow) {
    console.warn('[team-admin] org not found', orgId);
    return false;
  }

  const emailNorm = (jwtEmail ?? '').trim().toLowerCase();

  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select('org_id, email, permissions')
    .eq('id', uid)
    .maybeSingle();
  if (pErr) console.warn('[team-admin] profile', pErr.message);

  const profRow = prof as {
    org_id?: string | null;
    email?: string | null;
    permissions?: Record<string, unknown>;
  } | null;

  const profileEmail = String(profRow?.email ?? '')
    .trim()
    .toLowerCase();
  const effectiveEmail = profileEmail || emailNorm;

  if (effectiveEmail === 'malachiroei@gmail.com') return true;

  const { data: rpcOk, error: rpcErr } = await admin.rpc('inviter_may_send_org_invite_email', {
    _viewer: uid,
    _org_id: orgId,
  });
  if (!rpcErr && rpcOk === true) return true;
  if (rpcErr) {
    console.warn('[team-admin] RPC inviter_may_send_org_invite_email — fallback', rpcErr.message);
  }

  const { data: om } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', uid)
    .eq('org_id', orgId)
    .maybeSingle();

  const profOrg = String(profRow?.org_id ?? '').trim();

  const ravidStillOnMainInDb =
    INVITE_OWNER_EMAILS.has(effectiveEmail) &&
    effectiveEmail !== 'malachiroei@gmail.com' &&
    orgId === DEFAULT_RAVID_FLEET_ORG_ID &&
    profOrg === DEFAULT_MAIN_FLEET_ORG_ID;

  const inOrg =
    profOrg === orgId || Boolean((om as { org_id?: string } | null)?.org_id) || ravidStillOnMainInDb;

  if (!inOrg) {
    console.warn('[team-admin] fallback deny: not in org', { uid, orgId, profOrg, hasOmRow: Boolean(om) });
    return false;
  }

  const perms = profRow?.permissions;
  const manageTeam = Boolean(
    perms && typeof perms === 'object' && (perms as { manage_team?: boolean }).manage_team === true,
  );

  const { data: roles, error: rErr } = await admin.from('user_roles').select('role').eq('user_id', uid);
  if (rErr) console.warn('[team-admin] user_roles', rErr.message);
  const roleList = (roles ?? []) as { role?: string }[];
  const isDbManager = roleList.some((r) => r.role === 'admin' || r.role === 'fleet_manager');

  if (manageTeam || isDbManager) return true;
  if (INVITE_OWNER_EMAILS.has(effectiveEmail)) return true;

  console.warn('[team-admin] fallback deny: role', { effectiveEmail, manageTeam, isDbManager });
  return false;
}
