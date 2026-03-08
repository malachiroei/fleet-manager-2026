import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uploadOrgPdf } from './useUiLabels';

interface OrgDocumentHookOptions {
  storageFolder?: string;
}

export interface OrgDocument {
  id: string;
  title: string;
  description: string;
  category?: 'תפעול' | 'בטיחות' | 'מסמכים אישיים' | string;
  file_url: string | null;
  json_schema?: Record<string, any> | null;
  autofill_fields?: string[] | null;
  include_in_handover: boolean;
  include_in_delivery?: boolean;
  include_in_return?: boolean;
  is_standalone: boolean;
  requires_signature: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['org-documents'] as const;

export function useOrgDocuments() {
  return useQuery<OrgDocument[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('org_documents')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrgDocument[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** All docs including inactive (for admin panel) */
export function useOrgDocumentsAdmin() {
  return useQuery<OrgDocument[]>({
    queryKey: [...QUERY_KEY, 'admin'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('org_documents')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrgDocument[];
    },
  });
}

export function useCreateOrgDocument(options?: OrgDocumentHookOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<OrgDocument, 'id' | 'created_at' | 'updated_at'> & { file?: File },
    ) => {
      let file_url = payload.file_url;
      if (payload.file) {
        file_url = await uploadOrgPdf(payload.file, `doc_${Date.now()}`, options?.storageFolder);
      }
      const { file: _f, ...rest } = payload as any;
      const { error } = await (supabase as any)
        .from('org_documents')
        .insert({ ...rest, file_url });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateOrgDocument(options?: OrgDocumentHookOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      file,
      ...updates
    }: Partial<OrgDocument> & { id: string; file?: File }) => {
      let file_url = updates.file_url;
      if (file) {
        file_url = await uploadOrgPdf(file, `doc_${id}`, options?.storageFolder);
      }
      const { error } = await (supabase as any)
        .from('org_documents')
        .update({ ...updates, file_url, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteOrgDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('org_documents')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
