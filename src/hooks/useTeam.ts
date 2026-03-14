import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/fleet';
import type { ProfilePermissions } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';

const TEAM_QUERY_KEY = ['team-members'] as const;
const INVITATIONS_QUERY_KEY = ['org-invitations'] as const;

export function useTeamMembers(orgId: string | null | undefined) {
  return useQuery({
    queryKey: [...TEAM_QUERY_KEY, orgId ?? null],
    enabled: !!orgId,
    queryFn: async (): Promise<Profile[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, phone, org_id, permissions, created_at, updated_at')
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
    }) => {
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
      return data as OrgInvitation;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...INVITATIONS_QUERY_KEY, variables.orgId] });
      toast({ title: 'ההזמנה נשמרה' });
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
