import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/fleet';
import type { ProfilePermissions } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';

const TEAM_QUERY_KEY = ['team-members'] as const;
const INVITATIONS_QUERY_KEY = ['org-invitations'] as const;

export interface TeamMemberSummary {
  id: string;
  full_name: string;
  email: string | null;
  org_id?: string | null;
  source: 'profile' | 'invitation';
}

export function useTeamMembers(orgId: string | null | undefined) {
  return useQuery({
    queryKey: [...TEAM_QUERY_KEY, orgId ?? null],
    enabled: !!orgId,
    queryFn: async (): Promise<Profile[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('profiles')
        // Keep this select minimal and aligned with actual columns to avoid 400 errors
        .select('id, full_name, email, org_id, status')
        .eq('org_id', orgId)
        .order('full_name');

      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  permissions: ProfilePermissions | null;
  invited_by: string | null;
  created_at: string;
}

export function useOrgInvitations(orgId: string | null | undefined) {
  return useQuery({
    queryKey: [...INVITATIONS_QUERY_KEY, orgId ?? null],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgInvitation[]> => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('org_invitations')
        .select('id, org_id, email, permissions, invited_by, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as OrgInvitation[];
    },
  });
}

export function useTeamMembersForSwitcher(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['team-members-switcher', orgId ?? null],
    enabled: !!orgId,
    queryFn: async (): Promise<TeamMemberSummary[]> => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, org_id, status')
        .eq('org_id', orgId)
        .order('full_name');

      if (error) throw error;

      console.log('RAW DATA FROM DB (team-members-switcher):', { orgId, data });

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
          permissions,
          invited_by: invitedBy,
        })
        .select()
        .single();

      if (error) throw error;
      const invitation = data as OrgInvitation;

      let emailSent = false;
      try {
        const { error: fnError } = await supabase.functions.invoke('send-invite', {
          body: { org_id: orgId, email: invitation.email },
        });
        emailSent = !fnError;
      } catch {
        // Invitation is saved; email failure is non-fatal
      }

      return { invitation, emailSent };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: [...INVITATIONS_QUERY_KEY, variables.orgId] });
      if (result.emailSent) {
        toast({ title: 'ההזמנה נשמרה ומייל ההזמנה נשלח' });
      } else {
        toast({
          title: 'ההזמנה נשמרה',
          description: 'שליחת מייל ההזמנה נכשלה. ניתן לשלוח שוב מאוחר יותר.',
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
    mutationFn: async ({ profileId }: { profileId: string }) => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .update({ status: 'active', updated_at: new Date().toISOString() })
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
