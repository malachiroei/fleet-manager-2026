import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Organization } from '@/types/fleet';

export interface OrganizationWithUserCount extends Organization {
  user_count: number;
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async (): Promise<OrganizationWithUserCount[]> => {
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name, created_at, updated_at')
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
