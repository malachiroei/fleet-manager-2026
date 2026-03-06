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

/** Hardcoded defaults — guarantees the tab always shows all items even if DB is empty */
export const DEFAULT_UI_LABELS: Omit<UiLabel, 'id' | 'updated_at'>[] = [
  { key: 'nav.home',             default_label: 'בית',               custom_label: '', is_visible: true, group_name: 'ניווט ראשי' },
  { key: 'nav.vehicles',         default_label: 'רכבים',             custom_label: '', is_visible: true, group_name: 'רכבים' },
  { key: 'nav.fleet_management', default_label: 'ניהול צי רכבים',   custom_label: '', is_visible: true, group_name: 'רכבים' },
  { key: 'nav.vehicle_delivery', default_label: 'מסירת רכב',        custom_label: '', is_visible: true, group_name: 'רכבים' },
  { key: 'nav.compliance',       default_label: 'התראות חריגה',      custom_label: '', is_visible: true, group_name: 'רכבים' },
  { key: 'nav.drivers',          default_label: 'נהגים',             custom_label: '', is_visible: true, group_name: 'תפעולי' },
  { key: 'nav.mileage_update',   default_label: 'עדכון קילומטראז',  custom_label: '', is_visible: true, group_name: 'תפעולי' },
  { key: 'nav.reports',          default_label: 'הפקת דוחות',       custom_label: '', is_visible: true, group_name: 'תפעולי' },
  { key: 'nav.accidents',        default_label: 'תאונות',            custom_label: '', is_visible: true, group_name: 'אירועים' },
  { key: 'nav.parking',          default_label: 'דוחות חניה',       custom_label: '', is_visible: true, group_name: 'אירועים' },
  { key: 'nav.complaints',       default_label: 'תלונות נוהל 6',    custom_label: '', is_visible: true, group_name: 'אירועים' },
  { key: 'nav.accounting',       default_label: 'הנהלת חשבונות',    custom_label: '', is_visible: true, group_name: 'כספים' },
  { key: 'nav.fuel',             default_label: 'דלק',               custom_label: '', is_visible: true, group_name: 'כספים' },
  { key: 'nav.settings',         default_label: 'הגדרות',            custom_label: '', is_visible: true, group_name: 'הגדרות' },
  { key: 'nav.org_settings',     default_label: 'הגדרות ארגון',     custom_label: '', is_visible: true, group_name: 'הגדרות' },
  { key: 'entity.driver',        default_label: 'נהג',               custom_label: '', is_visible: true, group_name: 'שמות ישויות' },
  { key: 'entity.drivers',       default_label: 'נהגים',             custom_label: '', is_visible: true, group_name: 'שמות ישויות' },
  { key: 'entity.vehicle',       default_label: 'רכב',               custom_label: '', is_visible: true, group_name: 'שמות ישויות' },
  { key: 'entity.vehicles',      default_label: 'רכבים',             custom_label: '', is_visible: true, group_name: 'שמות ישויות' },
  { key: 'action.add_driver',    default_label: 'הוסף נהג',         custom_label: '', is_visible: true, group_name: 'כפתורי פעולה' },
  { key: 'action.add_vehicle',   default_label: 'הוסף רכב',         custom_label: '', is_visible: true, group_name: 'כפתורי פעולה' },
  { key: 'action.handover',      default_label: 'מסירת רכב',        custom_label: '', is_visible: true, group_name: 'כפתורי פעולה' },
  { key: 'action.return',        default_label: 'החזרת רכב',        custom_label: '', is_visible: true, group_name: 'כפתורי פעולה' },
];

/** Merge DB rows with defaults: DB values take precedence, missing keys use defaults */
function mergeWithDefaults(dbRows: UiLabel[]): UiLabel[] {
  const dbMap = new Map(dbRows.map((r) => [r.key, r]));
  return DEFAULT_UI_LABELS.map((def) => {
    const db = dbMap.get(def.key);
    if (db) return { ...db, group_name: db.group_name || def.group_name };
    return { id: def.key, updated_at: '', ...def } as UiLabel;
  });
}

export function useUiLabels() {
  return useQuery<UiLabel[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ui_customization')
        .select('*');
      if (error) throw error;
      return mergeWithDefaults((data ?? []) as UiLabel[]);
    },
    staleTime: 5 * 60 * 1000,
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
      const def = new Map(DEFAULT_UI_LABELS.map((d) => [d.key, d]));
      const rows = updates.map((u) => ({
        key: u.key,
        default_label: def.get(u.key)?.default_label ?? u.key,
        group_name: def.get(u.key)?.group_name ?? '',
        custom_label: u.custom_label,
        is_visible: u.is_visible ?? true,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from('ui_customization')
        .upsert(rows, { onConflict: 'key' });
      if (error) throw error;
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
