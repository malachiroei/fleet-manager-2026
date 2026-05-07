/**
 * הרשאות לפעולות ציות (שליחת בקשה/מיילים לליסינג/אישור חידוש).
 *
 * חשוב: לא להשתמש ב-manage_team כאן. משתמשי "צוות" שאינם אדמינים יכולים לקבל הרשאת `compliance`
 * ולהיות מורשים לשלוח התראות, בלי אפשרות לניהול צוות.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForTeamActions } from './teamAdminActionPermission.ts';

export type AdminClient = ReturnType<typeof createClient>;

/** האם המשתמש המחובר רשאי לפעולות ציות על org_id */
export async function callerMayManageOrgForComplianceActions(
  admin: AdminClient,
  uid: string,
  orgId: string,
  jwtEmail: string,
): Promise<boolean> {
  // Backward compatible: team admins are also allowed.
  const teamOk = await callerMayManageOrgForTeamActions(admin, uid, orgId, jwtEmail);
  if (teamOk) return true;

  const { data: orgRow, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();
  if (orgErr) console.warn('[compliance-action] org lookup', orgErr.message);
  if (!orgRow) return false;

  const emailNorm = (jwtEmail ?? '').trim().toLowerCase();

  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select('org_id, email, permissions, is_system_admin')
    .eq('id', uid)
    .maybeSingle();
  if (pErr) console.warn('[compliance-action] profile', pErr.message);

  const profRow = (prof ?? null) as
    | {
        org_id?: string | null;
        email?: string | null;
        is_system_admin?: boolean | null;
        permissions?: Record<string, unknown> | null;
      }
    | null;

  if (profRow?.is_system_admin === true) return true;

  const effectiveEmail = String(profRow?.email ?? '').trim().toLowerCase() || emailNorm;
  if (effectiveEmail === 'malachiroei@gmail.com') return true;

  const { data: om } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', uid)
    .eq('org_id', orgId)
    .maybeSingle();

  const profOrg = String(profRow?.org_id ?? '').trim();
  const inOrg = profOrg === orgId || Boolean((om as { org_id?: string } | null)?.org_id);
  if (!inOrg) return false;

  const perms = (profRow?.permissions ?? null) as Record<string, unknown> | null;
  const canCompliance = Boolean(perms && typeof perms === 'object' && (perms as { compliance?: boolean }).compliance);
  const canAdminAccess = Boolean(
    perms && typeof perms === 'object' && (perms as { admin_access?: boolean }).admin_access,
  );

  const { data: roles, error: rErr } = await admin.from('user_roles').select('role').eq('user_id', uid);
  if (rErr) console.warn('[compliance-action] user_roles', rErr.message);
  const roleList = (roles ?? []) as { role?: string }[];
  const isDbManager = roleList.some((r) => r.role === 'admin' || r.role === 'fleet_manager');

  return canCompliance || canAdminAccess || isDbManager;
}

