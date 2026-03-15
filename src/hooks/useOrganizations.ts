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

      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, email, created_at, updated_at')
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
    }: {
      id: string;
      name?: string;
      email?: string | null;
    }) => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        throw new Error('Not authenticated. Sign in and try again.');
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;

      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id)
        .select()
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
        .select('id, name, email, created_at, updated_at')
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
