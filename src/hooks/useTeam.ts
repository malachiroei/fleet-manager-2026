import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/fleet';
import type { ProfilePermissions } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { getDefaultPermissions } from '@/lib/permissions';
import { sendInvitationEmail } from '@/lib/sendInvitationEmail';
import { useAuth } from '@/hooks/useAuth';
import { isSuperAdminPermissionBypass } from '@/lib/allowedFeatures';

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
}

export type UseTeamMembersOptions = {
  /** סופר־אדמין: טוען את כל ה-profiles; אחרת מסנן לפי org_id */
  loadAllOrgs?: boolean;
  /** Subject manager id for hierarchy scope (supports View As depth). */
  subjectManagerUserId?: string | null;
  /** Subject system-admin flag (supports View As depth). */
  subjectIsSystemAdmin?: boolean;
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

  const enabled = Boolean(profile) && (loadAllOrgs || Boolean(orgId));

  return useQuery({
    queryKey: [
      ...TEAM_QUERY_KEY,
      loadAllOrgs ? 'all-orgs' : 'org',
      orgId ?? 'none',
      subjectManagerUserId ?? 'none',
      subjectIsSystemAdmin ? 'sys-admin' : 'regular',
    ],
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      let q = supabase.from('profiles').select('*').order('full_name', { ascending: true });
      if (!loadAllOrgs && orgId) {
        q = q.eq('org_id', orgId);
      }
      if (!loadAllOrgs) {
        if (subjectIsSystemAdmin) {
          // System admins can see full org team, including unmanaged (NULL) rows.
        } else if (subjectManagerUserId) {
          // Manager sees only directly managed users; never self.
          q = q.eq('managed_by_user_id', subjectManagerUserId).neq('id', subjectManagerUserId);
        } else {
          return [];
        }
      }
      const { data, error } = await q;
      if (error) {
        // Backward-compatible fallback for DBs that still use parent_admin_id only.
        if (!loadAllOrgs && subjectManagerUserId && error.message?.includes('managed_by_user_id')) {
          let fallback = supabase.from('profiles').select('*').order('full_name', { ascending: true });
          if (orgId) fallback = fallback.eq('org_id', orgId);
          fallback = fallback.eq('parent_admin_id', subjectManagerUserId).neq('id', subjectManagerUserId);
          const fallbackRes = await fallback;
          if (fallbackRes.error) {
            console.error('Supabase Error (useTeamMembers fallback):', fallbackRes.error);
            return [];
          }
          return (fallbackRes.data ?? []) as Profile[];
        }
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

export function useTeamMembersForSwitcher(orgId: string | null | undefined) {
  const { profile } = useAuth();
  const loadAllOrgs = isSuperAdminPermissionBypass(profile);
  return useQuery({
    queryKey: ['team-members-switcher', orgId ?? null],
    enabled: !!orgId,
    queryFn: async (): Promise<TeamMemberSummary[]> => {
      if (!orgId) return [];

      let q = supabase.from('profiles').select('id, full_name, email, org_id, status').order('full_name');
      if (!loadAllOrgs) {
        q = q.eq('org_id', orgId);
      }
      const { data, error } = await q;

      if (error) throw error;

      const profiles = (data ?? []) as { id: string; full_name: string | null; email: string | null; org_id: string | null }[];

      const profileSummaries: TeamMemberSummary[] = profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name || p.email || 'חבר צוות',
        email: p.email ?? null,
        org_id: p.org_id ?? null,
        source: 'profile',
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
