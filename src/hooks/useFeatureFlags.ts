import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { useViewAs } from '@/contexts/ViewAsContext';
import {
  FEATURE_FLAG_REGISTRY_KEYS,
  QA_FORMS_NESTED_KEYS,
  QA_FORMS_PARENT_KEY,
} from '@/lib/featureFlagRegistry';

function isRlsOrAuthBlock(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  const msg = String(err.message ?? '');
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    /permission denied|forbidden|not allowed|rls/i.test(msg)
  );
}

/** ברירת מחדל פתוחה לכל מפתחות הרג׳יסטרי — טעינה ראשונה / כשל רשת / לפני cache */
function buildOpenFeatureFlagsFallback(): FeatureFlagsMap {
  const out: FeatureFlagsMap = {};
  for (const key of FEATURE_FLAG_REGISTRY_KEYS) {
    out[key] = true;
  }
  if (out[QA_FORMS_PARENT_KEY] !== true) {
    for (const k of QA_FORMS_NESTED_KEYS) {
      out[k] = false;
    }
  }
  return out;
}

/** `feature_key` → `is_enabled_globally` (רק מפתחות שקיימים בטבלה; חסר = לא מופיע) */
export type FeatureFlagsMap = Record<string, boolean>;

/**
 * מפתח React Query — session user (auth), activeOrgId (מ-useAuth),
 * היקף צי מה-impersonation (אופציונלי), ונושא הדגלים (אני / View As).
 */
export function featureFlagsQueryKey(args: {
  sessionUserId: string | null | undefined;
  activeOrgId: string | null | undefined;
  effectiveOrgId: string | null | undefined;
  subjectUserId: string | null | undefined;
}) {
  return [
    'feature-flags',
    String(args.sessionUserId ?? ''),
    String(args.activeOrgId ?? ''),
    String(args.effectiveOrgId ?? ''),
    String(args.subjectUserId ?? ''),
  ] as const;
}

/** Source-of-truth gate: user_feature_overrides > global feature_flags defaults. */
export function isFeatureEnabled(flags: FeatureFlagsMap | undefined, key: string): boolean {
  return flags?.[key] === true;
}

export function useFeatureFlags() {
  const { user, profile, activeOrgId } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();
  const { viewAsProfile } = useViewAs();
  /** View As: overrides נשלפים לפי המשתמש המוחלף (profiles.id = auth.users.id) */
  const flagsSubjectUserId =
    (viewAsProfile?.id ?? viewAsProfile?.user_id ?? user?.id ?? null) as string | null;

  const overrideOrgScopeId = [effectiveOrgId, activeOrgId, profile?.org_id]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .find((s) => s.length > 0);

  const queryKey = featureFlagsQueryKey({
    sessionUserId: user?.id,
    activeOrgId,
    effectiveOrgId,
    subjectUserId: flagsSubjectUserId,
  });

  return useQuery({
    queryKey,
    enabled: Boolean(flagsSubjectUserId),
    placeholderData: buildOpenFeatureFlagsFallback,
    queryFn: async (): Promise<FeatureFlagsMap> => {
      try {
        console.log('[FeatureFlags] loading', {
          subjectUserId: flagsSubjectUserId,
          overrideOrgScopeId,
          queryKey,
        });
        const ffRes = await supabase.from('feature_flags').select('feature_key, is_enabled_globally');

        let data = ffRes.data;
        if (ffRes.error) {
          if (isRlsOrAuthBlock(ffRes.error)) {
            console.warn(
              '[FeatureFlags] feature_flags blocked — using registry defaults (open) until DB/RLS fixed',
              { code: ffRes.error.code, hint: String(ffRes.error.message ?? '').slice(0, 120) },
            );
            data = [];
          } else {
            /** 400 / סכמה / רשת — לא לזרוק: אחרת placeholderData לא מספיק ו־Dashboard נשאר ריק */
            console.warn('[FeatureFlags] feature_flags query failed — using open defaults', {
              code: (ffRes.error as { code?: string }).code,
              hint: String((ffRes.error as { message?: string }).message ?? '').slice(0, 160),
            });
            data = [];
          }
        }

        let overridesQuery = (supabase as any)
          .from('user_feature_overrides')
          .select('feature_key, is_enabled')
          .eq('user_id', flagsSubjectUserId);

        if (overrideOrgScopeId) {
          overridesQuery = overridesQuery.eq('org_id', overrideOrgScopeId);
        }

        const overridesRes = await overridesQuery;

        let overridesData: { feature_key?: string; is_enabled?: boolean }[] = [];
        if (overridesRes.error) {
          const code = String((overridesRes.error as { code?: string }).code ?? '');
          const msg = String((overridesRes.error as { message?: string }).message ?? '');
          const tableMissing =
            code === 'PGRST205' ||
            code === '42P01' ||
            /does not exist|schema cache|Could not find/i.test(msg);
          const unknownColumn = /column|does not exist/i.test(msg) && /org_id/i.test(msg);
          /** RLS / GRANT בפרו: 403 או 42501 — בלי זה כל ה־UI ננעל (usePermissions דורש featureFlags) */
          const blocked = isRlsOrAuthBlock(overridesRes.error);
          if (tableMissing || blocked || unknownColumn) {
            console.warn('[FeatureFlags] user_feature_overrides skipped — continuing with global flags only', {
              code: code || '(none)',
              hint: msg.slice(0, 120),
            });
          } else {
            throw overridesRes.error;
          }
        } else {
          overridesData = (overridesRes.data ?? []) as typeof overridesData;
        }

        const overridesMap = new Map<string, boolean>();
        for (const row of overridesData) {
          const key = String(row.feature_key ?? '').trim();
          if (!key) continue;
          overridesMap.set(key, row.is_enabled === true);
        }

        const dbFlags: FeatureFlagsMap = {};
        for (const row of data ?? []) {
          const key = String(row.feature_key ?? '').trim();
          if (!key) continue;
          dbFlags[key] = row.is_enabled_globally === true;
        }

        /** ערכים מ-user_feature_overrides (כולל false מפורש — אז hasOverride יזהה) */
        const overrides: FeatureFlagsMap = Object.fromEntries(overridesMap);

        const mergedFlags: FeatureFlagsMap = { ...dbFlags, ...overrides };

        /** ממלאים רק מפתחות חסרים — לא דורסים false מ-feature_flags או מ-overrides */
        FEATURE_FLAG_REGISTRY_KEYS.forEach((key) => {
          if (mergedFlags[key] === undefined) {
            mergedFlags[key] = true;
          }
        });

        // הורה–ילד: כיבוי מרכז הטפסים משבית את טפסי המסירה/החזרה בפועל.
        if (mergedFlags[QA_FORMS_PARENT_KEY] !== true) {
          for (const k of QA_FORMS_NESTED_KEYS) {
            mergedFlags[k] = false;
          }
        }

        if (mergedFlags.dashboard_vehicles !== undefined) {
          console.log('[FeatureFlags] resolved dashboard_vehicles', {
            userId: flagsSubjectUserId,
            orgId: overrideOrgScopeId,
            value: mergedFlags.dashboard_vehicles,
          });
        }

        return mergedFlags;
      } catch (e) {
        console.warn('[FeatureFlags] query failed — open registry fallback', e);
        return buildOpenFeatureFlagsFallback();
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
