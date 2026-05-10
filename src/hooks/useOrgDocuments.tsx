import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildFleetOrgDocPermissionRowsFromDocuments,
  type FleetOrgDocumentLike,
  type FleetOrgDocumentPermissionEntry,
} from '@/lib/fleetSystemFormRegistry';
import { uploadOrgPdf } from './useUiLabels';

interface OrgDocumentHookOptions {
  storageFolder?: string;
}

export interface OrgDocument {
  id: string;
  title: string;
  /** שם תצוגה — אם ריק, משתמשים ב־title */
  name?: string | null;
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

/** מפתח שאילתת מסמכי ארגון (כולל לא פעילים) — לייצוא סנאפשוט / ריענון מפורש */
export const ORG_DOCUMENTS_ADMIN_QUERY_KEY = [...QUERY_KEY, 'admin'] as const;

export async function fetchOrgDocumentsAdmin(): Promise<OrgDocument[]> {
  const { data, error } = await (supabase as any)
    .from('org_documents')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgDocument[];
}

const ORG_DOCS_PERMISSION_REGISTRY_KEY = [...QUERY_KEY, 'permission-registry'] as const;

/**
 * כל שורות `org_documents` → טוקני הרשאה דינמיים (כותרת מ-DB).
 */
export function useOrgDocumentsPermissionRegistry() {
  return useQuery<FleetOrgDocumentPermissionEntry[]>({
    queryKey: ORG_DOCS_PERMISSION_REGISTRY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('org_documents')
        .select('id, title, name, json_schema, sort_order, is_active')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return buildFleetOrgDocPermissionRowsFromDocuments((data ?? []) as FleetOrgDocumentLike[]);
    },
    staleTime: 15_000,
  });
}

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
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** All docs including inactive (for admin panel) */
export function useOrgDocumentsAdmin() {
  return useQuery<OrgDocument[]>({
    queryKey: ORG_DOCUMENTS_ADMIN_QUERY_KEY,
    queryFn: fetchOrgDocumentsAdmin,
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
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ORG_DOCS_PERMISSION_REGISTRY_KEY });
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
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ORG_DOCS_PERMISSION_REGISTRY_KEY });
    },
  });
}

/**
 * הסרה רכה (ארכיון בלבד) — סומן ב-`is_active=false`. ניתן לשחזור.
 */
export function useArchiveOrgDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any)
        .from('org_documents')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('לא בוצע עדכון — ייתכן שאין לך הרשאה (RLS) או שהמסמך כבר נמחק.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ORG_DOCS_PERMISSION_REGISTRY_KEY });
    },
  });
}

/**
 * תאימות לאחור — שמירת השם הקודם `useDeleteOrgDocument` כדי לא לשבור צרכנים
 * שעדיין מצפים להתנהגות הישנה (ארכיון). למחיקה מלאה השתמש ב-`useHardDeleteOrgDocument`.
 */
export const useDeleteOrgDocument = useArchiveOrgDocument;

/**
 * חילוץ נתיב הקובץ ב-Storage מתוך `file_url` ציבורי. תומך גם בנתיבי
 * `/object/sign/...` (חתומים) וגם ב-`/object/public/...`.
 */
function storagePathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    /** הצורה הסטנדרטית: /storage/v1/object/public/<bucket>/<path...> */
    const m = u.pathname.match(
      new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/(.+)$`),
    );
    if (m && m[1]) return decodeURIComponent(m[1].split('?')[0]);
    return null;
  } catch {
    return null;
  }
}

/**
 * מחיקה מלאה (Hard Delete) של מסמך ארגוני: מסיר מ-`org_documents` *וגם*
 * מנסה למחוק את הקובץ מ-Storage כדי לא להשאיר זבל. אם המחיקה ב-DB מוצלחת
 * אבל קובץ ה-Storage לא נמצא/לא נמחק — לא נכשלים, רק כותבים אזהרה ב-console.
 */
export function useHardDeleteOrgDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      /** קודם נטען את שורת המסמך כדי לזכור את ה-`file_url` למחיקה ב-Storage. */
      const { data: existing, error: loadErr } = await (supabase as any)
        .from('org_documents')
        .select('id, file_url')
        .eq('id', id)
        .maybeSingle();
      if (loadErr) {
        console.warn('[useHardDeleteOrgDocument] load row failed', loadErr.message);
      }
      const fileUrl = (existing as { file_url?: string | null } | null)?.file_url ?? null;

      /** DELETE — `.select()` מחזיר את השורות שנמחקו, כדי לזהות מצב שבו RLS חסם בשקט. */
      const { data, error } = await (supabase as any)
        .from('org_documents')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error(
          'המחיקה לא בוצעה — ייתכן שאין לך הרשאה (RLS) או שהמסמך כבר נמחק. רענן/י את המסך ונסה/י שוב.',
        );
      }

      /** Storage cleanup — best-effort: לא נכשלים אם הקובץ כבר לא קיים. */
      const path = storagePathFromPublicUrl(fileUrl, 'vehicle-documents');
      if (path) {
        try {
          const { error: rmErr } = await supabase.storage
            .from('vehicle-documents')
            .remove([path]);
          if (rmErr) {
            console.warn('[useHardDeleteOrgDocument] storage remove failed', rmErr.message, path);
          }
        } catch (e) {
          console.warn('[useHardDeleteOrgDocument] storage remove threw', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ORG_DOCS_PERMISSION_REGISTRY_KEY });
    },
  });
}
