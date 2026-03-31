import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgSettings {
  id: string;
  /** FK to organizations — column is org_id in DB */
  org_id?: string | null;
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

/** עמודות ידועות ב-ui_settings — נמנע select('*') שגורם לשגיאות כשהסכימה בטסט שונה */
const UI_SETTINGS_COLUMNS =
  'id, org_id, org_name, org_id_number, admin_email, health_statement_text, vehicle_policy_text, health_statement_pdf_url, vehicle_policy_pdf_url, updated_at';

function emptyOrgSettings(organizationId?: string | null): OrgSettings {
  return {
    id: '',
    org_id: organizationId ?? null,
    org_name: '',
    org_id_number: '',
    admin_email: '',
    health_statement_text: '',
    vehicle_policy_text: '',
    health_statement_pdf_url: null,
    vehicle_policy_pdf_url: null,
    updated_at: '',
  };
}

/** טבלה חסרה / 404 ב-PostgREST — לא לתקוע את הדף */
function isUiSettingsUnavailableError(error: { code?: string; message?: string; details?: string }): boolean {
  const code = String(error?.code ?? '');
  const msg = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('404') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    (msg.includes('relation') && msg.includes('ui_settings'))
  );
}

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

/** Fetch ui_settings. When organizationId is provided, filter by org_id (DB column name). */
export function useOrgSettings(
  organizationId?: string | null,
  opts?: { enabledOnlyWithOrgId?: boolean },
) {
  const requireOrg = opts?.enabledOnlyWithOrgId === true;
  return useQuery<OrgSettings | null>({
    queryKey: [...QUERY_KEY, organizationId ?? null, requireOrg],
    // Strict: never query ui_settings without a valid org id (prevents 400/RLS issues + accidental cross-org leakage).
    enabled: Boolean(organizationId) && (requireOrg ? Boolean(organizationId) : true),
    queryFn: async () => {
      if (!organizationId) return null;
      let query = (supabase as any).from('ui_settings').select(UI_SETTINGS_COLUMNS);
      if (organizationId) {
        query = query.eq('org_id', organizationId);
      }
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) {
        if (isUiSettingsUnavailableError(error)) {
          console.warn('[useOrgSettings] ui_settings לא זמין (404/חסר בטסט), מחזירים הגדרות ריקות:', error.message);
          return emptyOrgSettings(organizationId);
        }
        throw error;
      }
      return data as OrgSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Update ui_settings. Use org_id (DB column).
 * Payload only includes columns that exist: org_id, org_id_number,
 * health_statement_text, vehicle_policy_text, health_statement_pdf_url,
 * vehicle_policy_pdf_url, updated_at.
 */
export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      updates: Partial<Omit<OrgSettings, 'id' | 'updated_at'>> & { org_id?: string | null }
    ) => {
      const organizationId = updates.org_id ?? undefined;
      // Build payload with only valid columns — never send organization_id (DB has org_id)
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        org_id_number: updates.org_id_number ?? '',
        health_statement_text: updates.health_statement_text ?? '',
        vehicle_policy_text: updates.vehicle_policy_text ?? '',
        health_statement_pdf_url: updates.health_statement_pdf_url ?? null,
        vehicle_policy_pdf_url: updates.vehicle_policy_pdf_url ?? null,
      };
      if (organizationId != null) {
        payload.org_id = organizationId;
      }

      let query = (supabase as any).from('ui_settings').select('id');
      if (organizationId) {
        query = query.eq('org_id', organizationId);
      }
      const { data: existing } = await query.limit(1).maybeSingle();

      if (existing?.id) {
        const { error } = await (supabase as any)
          .from('ui_settings')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('ui_settings')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.org_id ?? null] });
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
