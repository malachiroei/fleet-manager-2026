import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/fleet';
import type { ProfilePermissions } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { formatSupabaseLikeError } from '@/lib/supabaseErrorMessage';
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
};

/**
 * profiles.id אמור להתאים ל-auth.users.id (האפליקציה נשענת על כך).
 * ברירת מחדל: רק פרופילים עם org_id = הארגון הפעיל (פחות רעש, תואם RLS חדש).
 */
export function useTeamMembers(orgId: string | null | undefined, options?: UseTeamMembersOptions) {
  const { profile } = useAuth();
  const loadAllOrgs = options?.loadAllOrgs === true;

  const enabled = Boolean(profile) && (loadAllOrgs || Boolean(orgId));

  return useQuery({
    queryKey: [...TEAM_QUERY_KEY, loadAllOrgs ? 'all-orgs' : 'org', orgId ?? 'none', 'scope-org'],
    enabled,
    /** רענון אוטומטי כל 20 שניות — כדי שהמנהל יראה משתמשים שזה עתה
     *  השלימו רישום בעקבות הזמנה, גם בלי ריענון ידני. */
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Profile[]> => {
      let q = supabase.from('profiles').select('*').order('full_name', { ascending: true });

      if (loadAllOrgs) {
        const { data, error } = await q;
        if (error) {
          console.error('Supabase Error (useTeamMembers):', error);
          return [];
        }
        return (data ?? []) as Profile[];
      }

      if (!orgId) return [];

      q = q.eq('org_id', orgId);
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
    /** רענון תקופתי — שורת "הזמנות פתוחות" משקפת את המצב כשמוזמן השלים רישום
     *  (אז ההזמנה נמחקת ב-signUp) בלי שצריך לרענן ידנית. */
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
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
    queryKey: ['tenant-fleet-admins-platform-switcher', user?.id, 'v3-from-profiles'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantFleetAdminOption[]> => {
      /**
       * שאיבת מקור-אמת ישירה מ-profiles: מנהלים מזוהים לפי is_system_admin
       * או הרשאות (manage_team / admin_access). מסתמך על RLS שכבר מאפשרת
       * למנהל הפלטפורמה לקרוא את כל ה-profiles. אם ל-org יש כמה אדמינים,
       * אנחנו בוחרים את הראשון לפי סדר א״ב כברירת מחדל.
       */
      /** ב-DB של הלקוח אין עמודת `user_id` בטבלת profiles — `profiles.id` זה
       *  ה-auth.uid() ישירות. כל בקשה שכוללת user_id חוזרת 400. */
      const { data: profs, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, org_id, status, permissions, is_system_admin, is_approved');
      if (error) {
        console.warn('[useTenantFleetAdminsForPlatformSwitcher] profiles failed', error.message);
        return [];
      }

      type Row = {
        id: string;
        full_name: string | null;
        email: string | null;
        org_id: string | null;
        status?: string | null;
        permissions?: Record<string, unknown> | null;
        is_system_admin?: boolean | null;
        is_approved?: boolean | null;
      };

      const candidatesByOrg = new Map<string, Row[]>();
      for (const p of (profs ?? []) as Row[]) {
        const oid = String(p.org_id ?? '').trim();
        if (!oid) continue;
        if (isPlatformSuperOwnerEmail(p.email)) continue;
        if (String(p.status ?? '').trim().toLowerCase() === 'pending_approval') continue;
        /** מנהל שלא אושר עדיין לא מופיע בסוויצ'ר — אין טעם לאפשר היכנסות לצי שלו. */
        if (p.is_approved === false) continue;

        const perms = (p.permissions ?? {}) as Record<string, boolean>;
        const isAdminLike =
          p.is_system_admin === true ||
          perms.manage_team === true ||
          perms.admin_access === true;
        if (!isAdminLike) continue;

        const list = candidatesByOrg.get(oid) ?? [];
        list.push(p);
        candidatesByOrg.set(oid, list);
      }

      const out: TenantFleetAdminOption[] = [];
      for (const [oid, list] of candidatesByOrg.entries()) {
        list.sort((a, b) => {
          const la = (a.full_name || a.email || a.id).toLowerCase();
          const lb = (b.full_name || b.email || b.id).toLowerCase();
          return la.localeCompare(lb, 'he');
        });
        const top = list[0];
        out.push({
          id: top.id,
          full_name: top.full_name ?? null,
          email: top.email ?? null,
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
      createsNewOrg = false,
    }: {
      orgId: string;
      email: string;
      permissions: ProfilePermissions;
      invitedBy: string | null;
      /** True when the platform super admin invites a new tenant admin (own org). */
      createsNewOrg?: boolean;
    }): Promise<CreateInvitationResult> => {
      const { data, error } = await (supabase as any)
        .from('org_invitations')
        .insert({
          org_id: orgId,
          email: email.trim().toLowerCase(),
          permissions: { ...permissions, report_mileage: true },
          invited_by: invitedBy,
          creates_new_org: createsNewOrg,
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
    onError: (err: unknown) => {
      toast({
        title: 'שגיאה בשמירת ההזמנה',
        description: formatSupabaseLikeError(err),
        variant: 'destructive',
      });
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

/**
 * מחיקה קבועה ובלתי הפיכה של חבר צוות מכל המערכת — דורש סיסמת המנהל המבצע.
 * Edge Function `delete-team-member-permanent` מבצע re-auth ומפעיל
 * `auth.admin.deleteUser` יחד עם ניקוי profiles / org_members / user_roles.
 * החזרה למערכת לאחר מחיקה — באמצעות הרשמה מחדש בלבד.
 */
export function useDeleteTeamMemberPermanent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orgId,
      memberUserId,
      password,
    }: {
      orgId: string;
      memberUserId: string;
      password: string;
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('נדרשת התחברות מחדש');

      const { data, error } = await supabase.functions.invoke('delete-team-member-permanent', {
        body: {
          org_id: orgId,
          member_user_id: memberUserId,
          password,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      /** ב-supabase-js, גם 4xx וגם רגרסיות חוזרות כ-FunctionsHttpError עם
       *  `context: Response`. הגוף שלנו מחזיק `{ error }` בעברית — נחלץ אותו
       *  כדי שהטוסט יציג את הסיבה האמיתית במקום ההודעה הגנרית. */
      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof (ctx as Response).json === 'function') {
          try {
            const body = (await (ctx as Response).json()) as { error?: string };
            const m = String(body?.error ?? '').trim();
            if (m) throw new Error(m);
          } catch {
            /* lint: parsing failure → ניפול ל-throw error */
          }
        }
        throw error;
      }
      const respData = data as
        | { error?: string; deleted?: number; subordinates_deleted?: number }
        | null;
      const errMsg = respData?.error;
      if (errMsg && String(errMsg).trim()) {
        throw new Error(String(errMsg));
      }
      return respData ?? null;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ORG_INVITATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['tenant-fleet-admins-platform-switcher'] });
      if (variables.orgId) {
        queryClient.invalidateQueries({ queryKey: ['organization', variables.orgId] });
      }
      const subs = data?.subordinates_deleted ?? 0;
      toast({
        title: 'המשתמש נמחק לחלוטין מהמערכת',
        description: subs > 0 ? `נמחקו גם ${subs} משתמשים שהיו תחת המנהל` : undefined,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'מחיקה נכשלה', description: err.message, variant: 'destructive' });
    },
  });
}

export function useApproveMember() {
  const queryClient = useQueryClient();
  const { refreshMemberOrganizations } = useAuth();

  return useMutation({
    mutationFn: async ({ profileId }: { profileId: string }) => {
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
          is_approved: true,
          permissions: nextPerms,
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
      /** מנהל פלטפורמה אישר אדמין חדש בארגון נפרד — מרעננים את הסוויצ'ר
       *  ואת רשימת אדמינים-לבחירת-צי, אחרת המשתמש החדש לא יופיע עד רענון. */
      queryClient.invalidateQueries({ queryKey: ['tenant-fleet-admins-platform-switcher'] });
      void refreshMemberOrganizations();
      toast({ title: 'המשתמש אושר בהצלחה' });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה באישור משתמש', description: err.message, variant: 'destructive' });
    },
  });
}

/**
 * עדכון הרשאות בסיס של חבר צוות (`profiles.permissions`). אדמין יכול לשנות אחרי
 * שהמשתמש כבר רשום באפליקציה — כדי לפתוח/לסגור פיצ'רים שהוגדרו בהזמנה.
 */
export function useUpdateMemberPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      permissions,
    }: {
      profileId: string;
      permissions: Record<string, boolean>;
    }) => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .update({
          permissions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId)
        .select('id, permissions, org_id')
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; permissions: Record<string, boolean>; org_id: string | null };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      if (data?.org_id) {
        queryClient.invalidateQueries({ queryKey: ['organization', data.org_id] });
      }
      toast({ title: 'ההרשאות עודכנו' });
    },
    onError: (err: Error) => {
      toast({
        title: 'עדכון הרשאות נכשל',
        description: err.message,
        variant: 'destructive',
      });
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
