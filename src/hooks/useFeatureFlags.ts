import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { QA_FORMS_NESTED_KEYS, QA_FORMS_PARENT_KEY } from '@/lib/featureFlagRegistry';

/** `feature_key` → `is_enabled_globally` (רק מפתחות שקיימים בטבלה; חסר = לא מופיע) */
export type FeatureFlagsMap = Record<string, boolean>;

export function useFeatureFlags() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['feature-flags', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<FeatureFlagsMap> => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('feature_key, is_enabled_globally');

      if (error) throw error;

      const { data: overridesData, error: overridesError } = await (supabase as any)
        .from('user_feature_overrides')
        .select('feature_key, is_enabled')
        .eq('user_id', userId);

      if (overridesError) throw overridesError;

      const overridesMap = new Map<string, boolean>();
      for (const row of overridesData ?? []) {
        const key = String(row.feature_key ?? '').trim();
        if (!key) continue;
        overridesMap.set(key, row.is_enabled === true);
      }

      const out: FeatureFlagsMap = {};
      for (const row of data ?? []) {
        const key = String(row.feature_key ?? '').trim();
        if (!key) continue;
        const hasOverride = overridesMap.has(key);
        out[key] = hasOverride ? (overridesMap.get(key) as boolean) : row.is_enabled_globally === true;
      }

      // In case overrides exist for keys not present in feature_flags table.
      for (const [key, enabled] of overridesMap.entries()) {
        if (out[key] === undefined) out[key] = enabled;
      }

      // הורה–ילד: כיבוי מרכז הטפסים משבית את טפסי המסירה/החזרה בפועל.
      if (out[QA_FORMS_PARENT_KEY] !== true) {
        for (const k of QA_FORMS_NESTED_KEYS) {
          out[k] = false;
        }
      }

      return out;
    },
    staleTime: 60_000,
  });
}
