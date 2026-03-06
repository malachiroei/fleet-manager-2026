import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UiLabel {
  id: string;
  key: string;
  default_label: string;
  custom_label: string;
  is_visible: boolean;
  group_name: string;
  updated_at: string;
}

const QUERY_KEY = ['ui-customization'] as const;
const BUCKET = 'vehicle-documents';

export function useUiLabels() {
  return useQuery<UiLabel[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ui_customization')
        .select('*')
        .order('group_name')
        .order('key');
      if (error) throw error;
      return (data ?? []) as UiLabel[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Returns a function `label(key, fallback?)` — resolves custom override → default → fallback */
export function useLabel() {
  const { data: labels } = useUiLabels();
  return (key: string, fallback?: string): string => {
    const row = labels?.find((l) => l.key === key);
    if (row?.custom_label?.trim()) return row.custom_label.trim();
    if (row?.default_label) return row.default_label;
    return fallback ?? key;
  };
}

/** Returns a function `isVisible(key)` — true by default when data is not yet loaded */
export function useIsVisible() {
  const { data: labels } = useUiLabels();
  return (key: string): boolean => {
    const row = labels?.find((l) => l.key === key);
    if (row === undefined) return true;
    return row.is_visible !== false;
  };
}

export function useUpdateUiLabels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Array<{ key: string; custom_label: string; is_visible?: boolean }>) => {
      for (const u of updates) {
        const patch: Record<string, unknown> = {
          custom_label: u.custom_label,
          updated_at: new Date().toISOString(),
        };
        if (u.is_visible !== undefined) patch.is_visible = u.is_visible;
        const { error } = await (supabase as any)
          .from('ui_customization')
          .update(patch)
          .eq('key', u.key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Upload a PDF template to storage, return public URL */
export async function uploadOrgPdf(
  file: File,
  slotName: 'health' | 'policy' | string,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `org-templates/${slotName}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
