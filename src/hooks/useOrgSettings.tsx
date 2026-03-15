import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgSettings {
  id: string;
  /** FK to organizations — column is organization_id in DB (not org_id) */
  organization_id?: string | null;
  org_name: string;
  org_id_number: string;
  admin_email: string;
  health_statement_text: string;
  vehicle_policy_text: string;
  health_statement_pdf_url: string | null;
  vehicle_policy_pdf_url: string | null;
  updated_at: string;
}

const QUERY_KEY = ['org-settings'] as const;
const BUCKET = 'vehicle-documents';

/** Upload a PDF template and return its public URL */
export async function uploadTemplatePdf(file: File, slotName: 'health' | 'policy'): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `org-templates/${slotName}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Fetch organization_settings. When organizationId is provided, filter by organization_id (DB column name). */
export function useOrgSettings(organizationId?: string | null) {
  return useQuery<OrgSettings | null>({
    queryKey: [...QUERY_KEY, organizationId ?? null],
    queryFn: async () => {
      let query = (supabase as any).from('organization_settings').select('*');
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return data as OrgSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Update organization_settings. Use organization_id (DB column), never org_id.
 * Payload only includes columns that exist: organization_id, org_id_number,
 * health_statement_text, vehicle_policy_text, health_statement_pdf_url,
 * vehicle_policy_pdf_url, updated_at.
 */
export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      updates: Partial<Omit<OrgSettings, 'id' | 'updated_at'>> & { organization_id?: string | null }
    ) => {
      const organizationId = updates.organization_id ?? undefined;
      // Build payload with only valid columns — never send org_id (DB has organization_id)
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        org_id_number: updates.org_id_number ?? '',
        health_statement_text: updates.health_statement_text ?? '',
        vehicle_policy_text: updates.vehicle_policy_text ?? '',
        health_statement_pdf_url: updates.health_statement_pdf_url ?? null,
        vehicle_policy_pdf_url: updates.vehicle_policy_pdf_url ?? null,
      };
      if (organizationId != null) {
        payload.organization_id = organizationId;
      }

      let query = (supabase as any).from('organization_settings').select('id');
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      const { data: existing } = await query.limit(1).maybeSingle();

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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.organization_id ?? null] });
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
