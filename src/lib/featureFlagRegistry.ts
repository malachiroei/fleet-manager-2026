import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type FeatureFlagCategoryId = 'dashboard' | 'quick_actions' | 'forms';

export const FEATURE_FLAG_CATEGORY_ORDER: FeatureFlagCategoryId[] = ['dashboard', 'quick_actions', 'forms'];

export const FEATURE_FLAG_CATEGORY_LABELS: Record<FeatureFlagCategoryId, string> = {
  dashboard: 'כרטיסי דשבורד',
  quick_actions: 'פעולות מהירות',
  forms: 'טפסים',
};

/** מרכז הטפסים בפעולות מהירות — כיבויו משבית את תתי־הטפסים באפליקציה (גם אם הם מסומנים ב-DB). */
export const QA_FORMS_PARENT_KEY = 'qa_forms' as const;

/** תתי־פיצ׳רים שמוצגים תחת `qa_forms` בדף הניהול וכפופים לו בזמן ריצה. */
export const QA_FORMS_NESTED_KEYS = ['form_delivery', 'form_return'] as const;

const QA_FORMS_NESTED_SET = new Set<string>(QA_FORMS_NESTED_KEYS);

/** מסיר שורות תת־טפס מקבוצת «טפסים» לתצוגה (הן מוצגות תחת `qa_forms`). */
export function isNestedUnderQaFormsRow(row: { feature_key: string }): boolean {
  return QA_FORMS_NESTED_SET.has(row.feature_key);
}

export type FeatureFlagRegistryEntry = {
  key: string;
  display_name_he: string;
  description: string;
  /** Human-readable UI location this toggle controls (for admin clarity). */
  ui_mapping: string;
  category: FeatureFlagCategoryId;
};

export type UiSyncBundle = {
  schema_version: 'ui-sync-bundle.v1';
  ui_version: string;
  generated_at: string;
  source_repo: string;
  feature_flag_registry: FeatureFlagRegistryEntry[];
};

/**
 * מקור האמת לסנכרון מפתחות מול Supabase — הוספת שורות חסרות בלחיצה על «סנכרן מהקוד».
 * התאמה לכרטיסי דשבורד, קישורי פעולות מהירות (דשבורד + סרגל צד), וטפסים.
 */
export const FEATURE_FLAG_REGISTRY: FeatureFlagRegistryEntry[] = [
  {
    key: 'dashboard_vehicles',
    display_name_he: 'רכבים',
    description: 'כרטיס דשבורד — ניהול צי רכבים',
    ui_mapping: 'Dashboard status cards -> רכבים',
    category: 'dashboard',
  },
  {
    key: 'dashboard_drivers',
    display_name_he: 'נהגים',
    description: 'כרטיס דשבורד — ניהול נהגים',
    ui_mapping: 'Dashboard status cards -> נהגים',
    category: 'dashboard',
  },
  {
    key: 'dashboard_replacement_car',
    display_name_he: 'רכב חליפי',
    description: 'כרטיס דשבורד — מרכז רכב חליפי',
    ui_mapping: 'Dashboard status cards -> רכב חליפי',
    category: 'dashboard',
  },
  {
    key: 'dashboard_exception_alerts',
    display_name_he: 'התראות חריגה',
    description: 'כרטיס דשבורד — התראות ציות וחריגות',
    ui_mapping: 'Dashboard status cards -> התראות חריגה',
    category: 'dashboard',
  },
  {
    key: 'qa_procedure6_complaints',
    display_name_he: 'תלונות נוהל 6',
    description: 'קישור מהיר — תלונות נוהל 6',
    ui_mapping: 'Dashboard quick actions -> תלונות נוהל 6',
    category: 'quick_actions',
  },
  {
    key: 'qa_report_mileage',
    display_name_he: 'דיווח קילומטראז׳',
    description: 'קישור מהיר — דיווח ק״מ',
    ui_mapping: 'Dashboard quick actions -> דיווח קילומטראז׳',
    category: 'quick_actions',
  },
  {
    key: 'qa_service_update',
    display_name_he: 'עדכון טיפול',
    description: 'רישום טיפול, חישוב טיפול הבא ומסך עדכון טיפול ברשימת רכבים',
    ui_mapping: 'Dashboard quick actions + Vehicle list -> עדכון טיפול; /vehicles/service-update',
    category: 'quick_actions',
  },
  {
    key: 'qa_admin_settings',
    display_name_he: 'הגדרות מערכת',
    description: 'קישור מהיר — הגדרות מנהל',
    ui_mapping: 'Dashboard quick actions -> הגדרות מערכת',
    category: 'quick_actions',
  },
  {
    key: 'qa_forms',
    display_name_he: 'טפסים',
    description: 'קישור מהיר — מרכז הטפסים',
    ui_mapping: 'Dashboard quick actions + Forms center gate',
    category: 'quick_actions',
  },
  {
    key: 'qa_parking_reports',
    display_name_he: 'דוחות חניה',
    description: 'קישור מהיר — דוחות סריקת חניה',
    ui_mapping: 'Dashboard quick actions -> דוחות חניה',
    category: 'quick_actions',
  },
  {
    key: 'qa_reports',
    display_name_he: 'הפקת דוחות',
    description: 'קישור מהיר — דוחות וייצוא',
    ui_mapping: 'Dashboard quick actions -> הפקת דוחות',
    category: 'quick_actions',
  },
  {
    key: 'qa_accidents',
    display_name_he: 'תאונות',
    description: 'קישור מהיר — ציות / תאונות',
    ui_mapping: 'Dashboard quick actions -> תאונות/ציות',
    category: 'quick_actions',
  },
  {
    key: 'qa_vehicle_delivery',
    display_name_he: 'מסירת רכב',
    description: 'קישור מהיר — טופס מסירת רכב',
    ui_mapping: 'Dashboard quick actions -> מסירת רכב',
    category: 'quick_actions',
  },
  {
    key: 'qa_replacement_car',
    display_name_he: 'רכב חליפי',
    description: 'קישור מהיר בסרגל — מרכז רכב חליפי',
    ui_mapping: 'Dashboard quick actions -> רכב חליפי',
    category: 'quick_actions',
  },
  {
    key: 'qa_team',
    display_name_he: 'ניהול צוות',
    description: 'קישור מהיר — ניהול צוות',
    ui_mapping: 'Dashboard quick actions -> ניהול צוות',
    category: 'quick_actions',
  },
  {
    key: 'qa_users',
    display_name_he: 'ניהול משתמשים',
    description: 'קישור מהיר — משתמשים ואישורים',
    ui_mapping: 'Dashboard quick actions -> ניהול משתמשים',
    category: 'quick_actions',
  },
  {
    key: 'form_delivery',
    display_name_he: 'טופס מסירה',
    description: 'הצגת טפסים המסומנים לשימוש במסירה (במרכז הטפסים)',
    ui_mapping: 'Forms center delivery forms visibility',
    category: 'forms',
  },
  {
    key: 'form_return',
    display_name_he: 'טופס החזרה',
    description: 'הצגת טפסים המסומנים לשימוש בהחזרה (במרכז הטפסים)',
    ui_mapping: 'Forms center return forms visibility',
    category: 'forms',
  },
];

/**
 * Build a portable JSON bundle for cross-environment UI sync.
 * The bundle is uploaded from test and consumed by production.
 */
export function createUiSyncBundle(uiVersion: string): UiSyncBundle {
  return {
    schema_version: 'ui-sync-bundle.v1',
    ui_version: String(uiVersion || '').trim() || '0.0.0',
    generated_at: new Date().toISOString(),
    source_repo: 'malachiroei/fleet-manager-dev',
    feature_flag_registry: FEATURE_FLAG_REGISTRY,
  };
}

const registryByKey = new Map(FEATURE_FLAG_REGISTRY.map((e) => [e.key, e]));

export function registryEntryForKey(key: string): FeatureFlagRegistryEntry | undefined {
  return registryByKey.get(key);
}

export function registryCategoryForKey(key: string): FeatureFlagCategoryId | null {
  return registryByKey.get(key)?.category ?? null;
}

export function resolveFeatureFlagCategoryForRow(row: {
  feature_key: string;
  category: string | null;
}): FeatureFlagCategoryId | 'other' {
  const raw = row.category?.trim();
  if (raw && FEATURE_FLAG_CATEGORY_ORDER.includes(raw as FeatureFlagCategoryId)) {
    return raw as FeatureFlagCategoryId;
  }
  const fromReg = registryCategoryForKey(row.feature_key);
  if (fromReg) return fromReg;
  return 'other';
}

export function groupFeatureFlagRowsByCategory<T extends { feature_key: string; category: string | null }>(
  rows: T[],
): { sectionKey: string; title: string; rows: T[] }[] {
  const buckets: Record<FeatureFlagCategoryId | 'other', T[]> = {
    dashboard: [],
    quick_actions: [],
    forms: [],
    other: [],
  };
  for (const row of rows) {
    buckets[resolveFeatureFlagCategoryForRow(row)].push(row);
  }
  for (const cat of FEATURE_FLAG_CATEGORY_ORDER) {
    buckets[cat].sort((a, b) => a.feature_key.localeCompare(b.feature_key));
  }
  buckets.other.sort((a, b) => a.feature_key.localeCompare(b.feature_key));

  const out: { sectionKey: string; title: string; rows: T[] }[] = [];
  for (const cat of FEATURE_FLAG_CATEGORY_ORDER) {
    if (buckets[cat].length > 0) {
      out.push({ sectionKey: cat, title: FEATURE_FLAG_CATEGORY_LABELS[cat], rows: buckets[cat] });
    }
  }
  if (buckets.other.length > 0) {
    out.push({ sectionKey: 'other', title: 'אחר', rows: buckets.other });
  }
  return out;
}

/**
 * מוסיף שורות חסרות לפי `FEATURE_FLAG_REGISTRY` (מפתחות dashboard_*, qa_*, form_* וכו').
 * ברירת מחדל לשורה חדשה: `is_enabled_globally: true` — כפתור «סנכרן פיצ׳רים מהקוד» ב-AdminSettingsPage.
 */
export async function syncFeatureFlagsFromRegistry(
  client: SupabaseClient<Database>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const entry of FEATURE_FLAG_REGISTRY) {
    const { data: existing, error: selErr } = await client
      .from('feature_flags')
      .select('id')
      .eq('feature_key', entry.key)
      .maybeSingle();

    if (selErr) throw selErr;
    if (existing) {
      skipped += 1;
      continue;
    }

    const { error: insErr } = await client.from('feature_flags').insert({
      feature_key: entry.key,
      display_name_he: entry.display_name_he,
      description: entry.description,
      category: entry.category,
      is_enabled_globally: true,
    });

    if (insErr) throw insErr;
    inserted += 1;
  }

  return { inserted, skipped };
}
