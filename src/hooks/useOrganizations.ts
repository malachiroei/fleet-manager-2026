import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'; // single auth-aware client (anon key + user JWT when signed in)
import type { Organization } from '@/types/fleet';

export interface OrganizationWithUserCount extends Organization {
  user_count: number;
}

export function useOrganization(orgId?: string | null) {
  return useQuery({
    queryKey: ['organization', orgId ?? null],
    enabled: !!orgId,
    queryFn: async (): Promise<Organization | null> => {
      if (!orgId) return null;

      // עמודות בסיס בלבד — בטסט לעיתים אין migration ל-release_snapshot_ack_version
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, email')
        .eq('id', orgId)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as Organization | null;
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      email,
      release_snapshot_ack_version,
    }: {
      id: string;
      name?: string;
      email?: string | null;
      release_snapshot_ack_version?: string | null;
    }) => {
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session ?? null;
      const sessionError = sessionRes?.error ?? null;
      if (sessionError) throw sessionError;
      if (!session) {
        throw new Error('Not authenticated. Sign in and try again.');
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (release_snapshot_ack_version !== undefined) {
        updates.release_snapshot_ack_version = release_snapshot_ack_version;
      }

      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id)
        .select('id, name, email')
        .maybeSingle();

      if (error) throw error;
      if (data == null) {
        throw new Error(
          `Organization not found (id: ${id}). Ensure this id matches your profile org_id and RLS allows update for the current user.`
        );
      }
      return data as Organization;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization', data.id] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async (): Promise<OrganizationWithUserCount[]> => {
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');

      if (orgsError) throw orgsError;

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, org_id');

      if (profilesError) throw profilesError;

      const countByOrgId = (profiles ?? []).reduce<Record<string, number>>((acc, p) => {
        const oid = (p as { org_id?: string | null }).org_id;
        if (oid) {
          acc[oid] = (acc[oid] ?? 0) + 1;
        }
        return acc;
      }, {});

      return (orgs ?? []).map((o) => ({
        ...o,
        user_count: countByOrgId[o.id] ?? 0,
      })) as OrganizationWithUserCount[];
    },
  });
}
