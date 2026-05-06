import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { useViewAs } from '@/contexts/ViewAsContext';
import { resolveLockedFleetOrgIdForStaff } from '@/lib/resolveFleetScopeOrg';
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

function dedupeOrgPreference(...ids: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * כשיש מספר שורות override לאותו feature_key (ארגונים שונים), נבחר לפי סדר העדפה —
 * כדי שלא ייפול למצב «אין שורה לארגון הנוכחי» ואז mergedFlags ימלא true מהרג׳יסטרי.
 */
function mergeOverridesByOrgPreference(
  rows: { feature_key?: string; is_enabled?: boolean; org_id?: string | null }[],
  preferenceOrder: string[],
): Record<string, boolean> {
  const rank = new Map<string, number>();
  preferenceOrder.forEach((id, i) => rank.set(id, i));

  const best = new Map<string, { r: number; on: boolean }>();
  for (const row of rows) {
    const key = String(row.feature_key ?? '').trim();
    if (!key) continue;
    const oid = typeof row.org_id === 'string' ? row.org_id.trim() : '';
    const r = oid && rank.has(oid) ? (rank.get(oid) as number) : 999;
    const on = row.is_enabled === true;
    const prev = best.get(key);
    if (!prev || r < prev.r) best.set(key, { r, on });
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of best) out[k] = v.on;
  return out;
}

/**
 * מפתח React Query — session user (auth), activeOrgId (מ-useAuth),
 * היקף צי מה-impersonation (אופציונלי), נושא הדגלים (אני / View As),
 * וחשיפת רשימת הארגונים כדי שלא יישמר cache ישן לפני טעינת org_members.
 */
export function featureFlagsQueryKey(args: {
  sessionUserId: string | null | undefined;
  activeOrgId: string | null | undefined;
  effectiveOrgId: string | null | undefined;
  subjectUserId: string | null | undefined;
  memberOrgIdsFingerprint: string;
}) {
  return [
    'feature-flags',
    String(args.sessionUserId ?? ''),
    String(args.activeOrgId ?? ''),
    String(args.effectiveOrgId ?? ''),
    String(args.subjectUserId ?? ''),
    args.memberOrgIdsFingerprint,
  ] as const;
}

/** Source-of-truth gate: user_feature_overrides > global feature_flags defaults. */
export function isFeatureEnabled(flags: FeatureFlagsMap | undefined, key: string): boolean {
  return flags?.[key] === true;
}

export function useFeatureFlags() {
  const { user, profile, activeOrgId, memberOrganizations } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();
  const { viewAsProfile } = useViewAs();
  /** View As: overrides נשלפים לפי המשתמש המוחלף (profiles.id = auth.users.id) */
  const flagsSubjectUserId =
    (viewAsProfile?.id ?? viewAsProfile?.user_id ?? user?.id ?? null) as string | null;

  const lockedFleetOrgId = useMemo(
    () => resolveLockedFleetOrgIdForStaff(profile, memberOrganizations ?? []),
    [profile, memberOrganizations],
  );

  const memberOrgIdsFingerprint = useMemo(() => {
    const ids = (memberOrganizations ?? []).map((o) => String(o.id).trim()).filter(Boolean);
    ids.sort();
    return ids.join(',');
  }, [memberOrganizations]);

  /** סדר עדיפות לאיחוד שורות user_feature_overrides — תואם לדשבורד / ניהול צוות */
  const orgPreferenceOrder = useMemo(
    () =>
      dedupeOrgPreference(
        effectiveOrgId,
        lockedFleetOrgId,
        activeOrgId,
        profile?.org_id,
        ...(memberOrganizations ?? []).map((o) => o.id),
      ),
    [effectiveOrgId, lockedFleetOrgId, activeOrgId, profile?.org_id, memberOrganizations],
  );

  const queryKey = featureFlagsQueryKey({
    sessionUserId: user?.id,
    activeOrgId,
    effectiveOrgId,
    subjectUserId: flagsSubjectUserId,
    memberOrgIdsFingerprint,
  });

  return useQuery({
    queryKey,
    enabled: Boolean(flagsSubjectUserId),
    placeholderData: buildOpenFeatureFlagsFallback,
    queryFn: async (): Promise<FeatureFlagsMap> => {
      try {
        console.log('[FeatureFlags] loading', {
          subjectUserId: flagsSubjectUserId,
          orgPreferenceOrder,
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
            console.warn('[FeatureFlags] feature_flags query failed — using open defaults', {
              code: (ffRes.error as { code?: string }).code,
              hint: String((ffRes.error as { message?: string }).message ?? '').slice(0, 160),
            });
            data = [];
          }
        }

        let overridesData: { feature_key?: string; is_enabled?: boolean; org_id?: string | null }[] = [];

        const overridesTable = supabase.from(
          'user_feature_overrides' as Parameters<(typeof supabase)['from']>[0],
        );
        let overridesRes = await overridesTable
          .select('feature_key, is_enabled, org_id')
          .eq('user_id', flagsSubjectUserId);

        if (overridesRes.error) {
          const msg = String((overridesRes.error as { message?: string }).message ?? '');
          const unknownColumn = /column|does not exist/i.test(msg) && /org_id/i.test(msg);
          if (unknownColumn) {
            overridesRes = await supabase
              .from('user_feature_overrides' as Parameters<(typeof supabase)['from']>[0])
              .select('feature_key, is_enabled')
              .eq('user_id', flagsSubjectUserId);
          }
        }

        if (overridesRes.error) {
          const code = String((overridesRes.error as { code?: string }).code ?? '');
          const msg = String((overridesRes.error as { message?: string }).message ?? '');
          const tableMissing =
            code === 'PGRST205' ||
            code === '42P01' ||
            /does not exist|schema cache|Could not find/i.test(msg);
          const blocked = isRlsOrAuthBlock(overridesRes.error);
          if (tableMissing || blocked) {
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

        const overrides: FeatureFlagsMap =
          overridesData.length > 0 && overridesData.some((r) => r.org_id != null && String(r.org_id).trim())
            ? mergeOverridesByOrgPreference(overridesData, orgPreferenceOrder)
            : Object.fromEntries(
                overridesData.map((row) => {
                  const k = String(row.feature_key ?? '').trim();
                  return [k, row.is_enabled === true] as const;
                }).filter(([k]) => Boolean(k)),
              );

        const dbFlags: FeatureFlagsMap = {};
        for (const row of data ?? []) {
          const key = String(row.feature_key ?? '').trim();
          if (!key) continue;
          dbFlags[key] = row.is_enabled_globally === true;
        }

        const mergedFlags: FeatureFlagsMap = { ...dbFlags, ...overrides };

        FEATURE_FLAG_REGISTRY_KEYS.forEach((key) => {
          if (mergedFlags[key] === undefined) {
            mergedFlags[key] = true;
          }
        });

        if (mergedFlags[QA_FORMS_PARENT_KEY] !== true) {
          for (const k of QA_FORMS_NESTED_KEYS) {
            mergedFlags[k] = false;
          }
        }

        if (mergedFlags.dashboard_vehicles !== undefined) {
          console.log('[FeatureFlags] resolved dashboard_vehicles', {
            userId: flagsSubjectUserId,
            orgPreference: orgPreferenceOrder[0] ?? null,
            overrideRows: overridesData.length,
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
