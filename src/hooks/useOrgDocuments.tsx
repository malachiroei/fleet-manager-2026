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
  show_date?: boolean | null;
  show_time?: boolean | null;
  show_driver_name?: boolean | null;
  show_license_plate?: boolean | null;
  show_employee_id?: boolean | null;
  show_id_number?: boolean | null;
  show_mobile?: boolean | null;
  show_signature_block?: boolean | null;
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
      const { data, error } = await (supabase as any)
        .from('org_documents')
        .update({ ...updates, file_url, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) {
        throw new Error(
          'העדכון לא הוחל — ייתכן שאין הרשאה (RLS) או שהמסמך לא נמצא. בדקו הרשאות מנהל צי.',
        );
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
 * מחיקה מלאה (Hard Delete) של מסמכי ארגון. עוברת דרך Edge Function
 * `delete-org-document` שמשתמשת ב-service role ולכן עוקפת RLS — חיוני כי
 * בפרודקשן זוהו מקרים בהם המדיניות חסמה בשקט (DELETE שהחזיר 0 שורות בלי
 * שגיאה) למרות שהקורא הוא platform owner.
 *
 * נתמך גם מזהה יחיד (string) וגם רשימה (string[]).
 *
 * הפרמטר `password` נדרש (מצריך אימות מנהל באותו ערך כמו `DELETE_FORMS_PASSWORD`
 * בלקוח — `2101`). אם הסיסמה חסרה הפונקציה משתדלת להחזיר שגיאה ברורה.
 */
export interface HardDeleteOrgDocumentInput {
  ids: string | string[];
  password: string;
}

export interface HardDeleteOrgDocumentResult {
  ok: boolean;
  deleted: number;
  storage_removed: number;
  failures: { id: string; message: string }[];
}

export function useHardDeleteOrgDocument() {
  const queryClient = useQueryClient();
  return useMutation<HardDeleteOrgDocumentResult, Error, HardDeleteOrgDocumentInput>({
    mutationFn: async ({ ids, password }) => {
      const idArray = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : []);
      if (idArray.length === 0) {
        throw new Error('לא נשלחו מזהי מסמכים למחיקה');
      }
      if (!password || password.trim().length === 0) {
        throw new Error('סיסמת מנהל נדרשת');
      }

      const { data, error } = await supabase.functions.invoke('delete-org-document', {
        body: { ids: idArray, password },
      });
      if (error) {
        /** ה-SDK של Supabase עוטף 4xx ב-FunctionsHttpError גנרי. כדי לחלץ
         *  את ההודעה האמיתית קוראים ל-`context.response.json()`. */
        const ctx = (error as { context?: { response?: Response } }).context;
        if (ctx?.response) {
          try {
            const j = await ctx.response.clone().json();
            if (j && typeof j === 'object' && 'error' in j) {
              throw new Error(String((j as { error: unknown }).error));
            }
          } catch {
            /* fall through */
          }
        }
        throw new Error(error.message || 'המחיקה נכשלה');
      }

      const result = (data ?? {}) as Partial<HardDeleteOrgDocumentResult> & { error?: string };
      if (typeof result.error === 'string') {
        throw new Error(result.error);
      }
      const final: HardDeleteOrgDocumentResult = {
        ok: Boolean(result.ok),
        deleted: typeof result.deleted === 'number' ? result.deleted : 0,
        storage_removed: typeof result.storage_removed === 'number' ? result.storage_removed : 0,
        failures: Array.isArray(result.failures) ? result.failures : [],
      };
      if (final.deleted === 0 && idArray.length > 0) {
        throw new Error('המחיקה לא בוצעה — ייתכן שהמסמכים כבר נמחקו או שאין הרשאה');
      }
      return final;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ORG_DOCS_PERMISSION_REGISTRY_KEY });
    },
  });
}
