import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/fleet';
import type { ProfilePermissions } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { getDefaultPermissions } from '@/lib/permissions';
import { sendInvitationEmail } from '@/lib/sendInvitationEmail';
import { useAuth } from '@/hooks/useAuth';
import { isSuperAdminPermissionBypass } from '@/lib/allowedFeatures';
import { isPlatformSuperOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';

export const TEAM_MEMBERS_QUERY_KEY = ['team-members'] as const;
const TEAM_QUERY_KEY = TEAM_MEMBERS_QUERY_KEY;
export const ORG_INVITATIONS_QUERY_KEY = ['org-invitations'] as const;

/** @deprecated השתמש ב-SUPER_ADMIN_PERMISSION_EMAIL / isSuperAdminPermissionBypass מ-allowedFeatures */
export const SUPER_ADMIN_TEAM_VIEWER_EMAIL = 'malachiroei@gmail.com';

/** תצוגת «כל הארגונים» וכו׳ — מזהה כמו PermissionGuard (אימייל + VITE_FLEET_SUPER_ADMIN_USER_IDS). */
export function isRoeySuperAdminProfile(profile: Profile | null | undefined): boolean {
  return isSuperAdminPermissionBypass(profile);
}

export interface TeamMemberSummary {
  id: string;
  full_name: string;
  email: string | null;
  org_id?: string | null;
  source: 'profile' | 'invitation';
  /** למחליף ארגון / View-As: היררכיה והרשאות */
  parent_admin_id?: string | null;
  managed_by_user_id?: string | null;
  permissions?: ProfilePermissions | null;
  is_system_admin?: boolean | null;
}

export type UseTeamMembersOptions = {
  /** סופר־אדמין: טוען את כל ה-profiles; אחרת מסנן לפי org_id */
  loadAllOrgs?: boolean;
  /** Subject manager id for hierarchy scope (supports View As depth). */
  subjectManagerUserId?: string | null;
  /** Subject system-admin flag (supports View As depth). */
  subjectIsSystemAdmin?: boolean;
  /** מנהל ארגון: הצגה לפי managed_by/parent_admin בלבד (ללא כל הארגון). */
  managedScopeOnly?: boolean;
};

/**
 * profiles.id אמור להתאים ל-auth.users.id (האפליקציה נשענת על כך).
 * ברירת מחדל: רק פרופילים עם org_id = הארגון הפעיל (פחות רעש, תואם RLS חדש).
 */
export function useTeamMembers(orgId: string | null | undefined, options?: UseTeamMembersOptions) {
  const { profile } = useAuth();
  const loadAllOrgs = options?.loadAllOrgs === true;
  const subjectManagerUserId = options?.subjectManagerUserId ?? null;
  const subjectIsSystemAdmin = options?.subjectIsSystemAdmin === true;
  const managedScopeOnly = options?.managedScopeOnly === true;

  const enabled = Boolean(profile) && (loadAllOrgs || Boolean(orgId));

  return useQuery({
    queryKey: [
      ...TEAM_QUERY_KEY,
      loadAllOrgs ? 'all-orgs' : 'org',
      orgId ?? 'none',
      subjectManagerUserId ?? 'none',
      subjectIsSystemAdmin ? 'sys-admin' : 'regular',
      'scope-org-or-direct-reports',
    ],
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      let q = supabase.from('profiles').select('*').order('full_name', { ascending: true });
      if (!loadAllOrgs && orgId) {
        if (subjectManagerUserId) {
          if (managedScopeOnly) {
            // מבנה היררכי: מנהל רואה רק מי שמשויך אליו.
            q = q.or(
              `parent_admin_id.eq.${subjectManagerUserId},managed_by_user_id.eq.${subjectManagerUserId}`,
            );
          } else {
            q = q.or(
              `org_id.eq.${orgId},parent_admin_id.eq.${subjectManagerUserId},managed_by_user_id.eq.${subjectManagerUserId}`,
            );
          }
        } else {
          q = q.eq('org_id', orgId);
        }
      }
      if (!loadAllOrgs) {
        if (subjectIsSystemAdmin) {
          // System admins can see full org team, including unmanaged (NULL) rows.
        } else if (subjectManagerUserId) {
          // ניהול צוות: כל חברי הארגון פחות המשתמש הנוכחי (תואם כותרת «חברי הארגון»).
          q = q.neq('id', subjectManagerUserId);
        } else {
          return [];
        }
      }
      const { data, error } = await q;
      if (error) {
        console.error('Supabase Error (useTeamMembers):', error);
        return [];
      }
      return (data ?? []) as Profile[];
    },
  });
}

export interface OrgInvitation {
  id: string;
  email: string;
  org_id?: string | null;
  role?: string | null;
  status?: string | null;
  permissions?: ProfilePermissions | null;
  invited_by?: string | null;
  created_at?: string;
}

export function useOrgInvitations(_orgId: string | null | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: [...ORG_INVITATIONS_QUERY_KEY, _orgId ?? 'none'],
    enabled: Boolean(profile) && Boolean(_orgId),
    queryFn: async (): Promise<OrgInvitation[]> => {
      if (!_orgId) return [];
      const { data, error } = await (supabase as any).from('org_invitations').select('*').eq('org_id', _orgId);
      if (error) {
        console.error('Supabase Error:', error);
        return [];
      }
      return (data ?? []) as OrgInvitation[];
    },
  });
}

/** מנהל פלטפורמה: אדמיני צי (admin / fleet_manager) לבחירת היקף צפייה בסרגל — לא שמות ארגון גולמיים */
export interface TenantFleetAdminOption {
  id: string;
  full_name: string | null;
  email: string | null;
  org_id: string | null;
}

export function useTenantFleetAdminsForPlatformSwitcher() {
  const { user, profile } = useAuth();
  const sessionEmail = resolveSessionEmail(profile, user);
  const enabled = isPlatformSuperOwnerEmail(sessionEmail) && Boolean(user?.id);

  return useQuery({
    queryKey: ['tenant-fleet-admins-platform-switcher', user?.id],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantFleetAdminOption[]> => {
      const { data: roleRows, error: roleErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin', 'fleet_manager']);
      if (roleErr) {
        console.warn('[useTenantFleetAdminsForPlatformSwitcher] user_roles failed', roleErr.message);
        return [];
      }
      const ids = [
        ...new Set(
          (roleRows ?? [])
            .map((r: { user_id?: string }) => String(r.user_id ?? '').trim())
            .filter((id) => id.length > 0),
        ),
      ];
      if (ids.length === 0) return [];

      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, org_id, status')
        .in('id', ids);
      if (profErr) {
        console.warn('[useTenantFleetAdminsForPlatformSwitcher] profiles failed', profErr.message);
        return [];
      }

      const out: TenantFleetAdminOption[] = [];
      for (const p of profs ?? []) {
        const row = p as {
          id: string;
          full_name: string | null;
          email: string | null;
          org_id: string | null;
          status?: string | null;
        };
        if (isPlatformSuperOwnerEmail(row.email)) continue;
        if (String(row.status ?? '').trim().toLowerCase() === 'pending_approval') continue;
        const oid = String(row.org_id ?? '').trim();
        if (!oid) continue;
        out.push({
          id: row.id,
          full_name: row.full_name ?? null,
          email: row.email ?? null,
          org_id: oid,
        });
      }
      out.sort((a, b) => {
        const la = (a.full_name || a.email || a.id).toLowerCase();
        const lb = (b.full_name || b.email || b.id).toLowerCase();
        return la.localeCompare(lb, 'he');
      });
      return out;
    },
  });
}

export function useTeamMembersForSwitcher(orgId: string | null | undefined) {
  const { profile } = useAuth();
  const loadAllOrgs = isSuperAdminPermissionBypass(profile);
  return useQuery({
    queryKey: ['team-members-switcher', orgId ?? null, 'v2-hierarchy'],
    enabled: !!orgId,
    queryFn: async (): Promise<TeamMemberSummary[]> => {
      if (!orgId) return [];

      let q = supabase
        .from('profiles')
        .select(
          'id, full_name, email, org_id, status, parent_admin_id, managed_by_user_id, permissions, is_system_admin',
        )
        .order('full_name');
      if (!loadAllOrgs) {
        q = q.eq('org_id', orgId);
      }
      const { data, error } = await q;

      if (error) {
        console.warn('[useTeamMembersForSwitcher] profiles query failed — empty list', error);
        return [];
      }

      const profiles = (data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        org_id: string | null;
        parent_admin_id?: string | null;
        managed_by_user_id?: string | null;
        permissions?: ProfilePermissions | null;
        is_system_admin?: boolean | null;
      }>;

      const profileSummaries: TeamMemberSummary[] = profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name || p.email || 'חבר צוות',
        email: p.email ?? null,
        org_id: p.org_id ?? null,
        source: 'profile',
        parent_admin_id: p.parent_admin_id ?? null,
        managed_by_user_id: p.managed_by_user_id ?? null,
        permissions: p.permissions ?? null,
        is_system_admin: p.is_system_admin ?? null,
      }));

      return profileSummaries.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    },
  });
}

export interface CreateInvitationResult {
  invitation: OrgInvitation;
  emailSent: boolean;
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orgId,
      email,
      permissions,
      invitedBy,
    }: {
      orgId: string;
      email: string;
      permissions: ProfilePermissions;
      invitedBy: string | null;
    }): Promise<CreateInvitationResult> => {
      const { data, error } = await (supabase as any)
        .from('org_invitations')
        .insert({
          org_id: orgId,
          email: email.trim().toLowerCase(),
          permissions: { ...permissions, report_mileage: true },
          invited_by: invitedBy,
        })
        .select('id, email, org_id')
        .single();

      if (error) throw error;
      const invitation = data as OrgInvitation;
      const inviteOrgId = String(invitation.org_id ?? orgId);
      const inviteEmail = String(invitation.email ?? email.trim().toLowerCase());

      let emailSent = false;
      try {
        const mail = await sendInvitationEmail({
          orgId: inviteOrgId,
          email: inviteEmail,
        });
        emailSent = mail.ok;
      } catch {
        // Invitation is saved; email failure is non-fatal
      }

      return { invitation, emailSent };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ORG_INVITATIONS_QUERY_KEY });
      if (result.emailSent) {
        toast({ title: 'ההזמנה נשמרה ומייל ההזמנה נשלח' });
      } else {
        toast({
          title: 'ההזמנה נשמרה במערכת',
          description: 'אם המייל נכשל — פרטי השגיאה הוצגו בהודעה אדומה.',
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה בשמירת ההזמנה', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateProfilePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      permissions,
    }: {
      profileId: string;
      permissions: ProfilePermissions | null;
    }) => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .update({ permissions, updated_at: new Date().toISOString() })
        .eq('id', profileId)
        .select()
        .single();

      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['organization', data.org_id] });
      toast({ title: 'הרשאות עודכנו' });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה בעדכון הרשאות', description: err.message, variant: 'destructive' });
    },
  });
}

/** מנהל צוות מסיר משתמש מארגון — Edge Function `remove-team-member` (לא תלוי ב-RPC ב-schema cache). */
export function useRemoveTeamMemberFromOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orgId,
      memberUserId,
      suspendAccount,
    }: {
      orgId: string;
      memberUserId: string;
      suspendAccount?: boolean;
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('נדרשת התחברות מחדש');

      const { data, error } = await supabase.functions.invoke('remove-team-member', {
        body: {
          org_id: orgId,
          member_user_id: memberUserId,
          suspend_account: suspendAccount === true,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg && String(errMsg).trim()) {
        throw new Error(String(errMsg));
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ORG_INVITATIONS_QUERY_KEY });
      if (variables.orgId) {
        queryClient.invalidateQueries({ queryKey: ['organization', variables.orgId] });
      }
      toast({
        title: variables.suspendAccount ? 'המשתמש הוסר והחשבון הושבת' : 'חבר הצוות הוסר מהארגון',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'הסרה נכשלה', description: err.message, variant: 'destructive' });
    },
  });
}

export function useApproveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      parentAdminProfileId,
    }: {
      profileId: string;
      /** profiles.id של המאשר — נשמר כ-parent_admin_id אצל המשתמש המאושר */
      parentAdminProfileId: string | null;
    }) => {
      const { data: existing, error: existingError } = await (supabase as any)
        .from('profiles')
        .select('permissions')
        .eq('id', profileId)
        .maybeSingle();
      if (existingError) throw existingError;

      const currentPerms = (existing as any)?.permissions as Record<string, boolean> | null | undefined;
      const nextPerms =
        currentPerms && typeof currentPerms === 'object' && Object.keys(currentPerms).length > 0
          ? { ...currentPerms, report_mileage: true }
          : { ...getDefaultPermissions(), report_mileage: true };

      const { data, error } = await (supabase as any)
        .from('profiles')
        .update({
          status: 'active',
          permissions: nextPerms,
          ...(parentAdminProfileId
            ? { parent_admin_id: parentAdminProfileId, managed_by_user_id: parentAdminProfileId }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId)
        .select()
        .single();

      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['organization', data.org_id] });
      toast({ title: 'המשתמש אושר בהצלחה' });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה באישור משתמש', description: err.message, variant: 'destructive' });
    },
  });
}

/** מסנכרן target_version של חבר צוות לגרסת המנהל (עדכון שקט — טוסט בלבד). */
export function useSyncMemberTargetVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberProfileId,
      targetVersion,
    }: {
      memberProfileId: string;
      targetVersion: string;
    }) => {
      const v = String(targetVersion ?? '').trim();
      if (!v) throw new Error('חסרה גרסת יעד');
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ target_version: v, updated_at: new Date().toISOString() })
        .eq('id', memberProfileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      toast({ title: 'גרסת היעד עודכנה' });
    },
    onError: (err: Error) => {
      toast({ title: 'עדכון גרסה נכשל', description: err.message, variant: 'destructive' });
    },
  });
}
