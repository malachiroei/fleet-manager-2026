import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgSettings {
  id: string;
  org_name: string;
  org_id_number: string;
  admin_email: string;
  health_statement_text: string;
  vehicle_policy_text: string;
  updated_at: string;
}

const QUERY_KEY = ['org-settings'] as const;

export function useOrgSettings() {
  return useQuery<OrgSettings | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('organization_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as OrgSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<OrgSettings, 'id' | 'updated_at'>>) => {
      // Fetch existing row id first
      const { data: existing } = await (supabase as any)
        .from('organization_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      const payload = { ...updates, updated_at: new Date().toISOString() };

      if (existing?.id) {
        const { error } = await (supabase as any)
          .from('organization_settings')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('organization_settings')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/** Parse newline-separated vehicle_policy_text into clause objects */
export function parsePolicyClauses(
  text: string | null | undefined,
): Array<{ id: number; text: string }> {
  if (!text?.trim()) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => ({ id: i + 1, text: line }));
}

/** Parse newline-separated health_statement_text into health-item objects */
export function parseHealthItems(
  text: string | null | undefined,
): Array<{ id: string; text: string; checked: boolean }> {
  if (!text?.trim()) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => ({ id: `item_${i}`, text: line, checked: false }));
}
