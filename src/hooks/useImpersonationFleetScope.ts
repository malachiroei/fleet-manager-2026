import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAs } from '@/contexts/ViewAsContext';
import { isFleetBootstrapOwnerEmail, resolveSessionEmail, RAVID_MANAGER_EMAIL } from '@/lib/fleetBootstrapEmails';
import { FALLBACK_MAIN_FLEET_ORG_ID, RAVID_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';

/**
 * הקשר לרשימות צי: org (כולל View As), נהג בלבד כשמוחלפים משתמש עם רק תפקיד נהג,
 * וסינון managed_by_user_id למנהלי צי/אדמין — שורות NULL נשארות משותפות לכל המנהלים בארגון.
 */
function rolesIncludeFleetElevated(roles: string[]): boolean {
  const r = roles.map((x) => String(x).toLowerCase());
  return r.includes('admin') || r.includes('fleet_manager');
}

export function useImpersonationFleetScope() {
  const { user, profile, activeOrgId, roles: loggedInRoles } = useAuth();
  const sessionEmail = resolveSessionEmail(profile, user);
  const { viewAsEmail, viewAsProfile } = useViewAs();

  const impersonatedUserId = (viewAsProfile?.id ?? viewAsProfile?.user_id ?? null) as string | null;
  /** פרופיל נטען — טעינת תפקידי נהג/מנהל לפי המשתמש המוחלף */
  const isImpersonating = Boolean(viewAsEmail?.trim() && impersonatedUserId);
  /** באנר תצוגה כ… פעיל (גם אם profiles עדיין לא נפתר בגלל RLS) */
  const viewAsBannerActive = Boolean(viewAsEmail?.trim());

  const viewAsNorm = (viewAsEmail ?? '').trim().toLowerCase();
  /**
   * תצוגה כרביד: תמיד ארגון הצי של רביד — לא viewAsProfile.org_id שעלול להישאר «הצי הראשי» ב-DB.
   * אחרת: activeOrgId (מחובר ישירות או אחרי handleViewAs) ואז פרופיל המחליף.
   */
  const orgFromContext = (
    (viewAsNorm === RAVID_MANAGER_EMAIL ? RAVID_FLEET_ORG_ID : null) ??
    activeOrgId ??
    viewAsProfile?.org_id ??
    null
  ) as string | null;
  /** בלי org בפרופיל/מחליף — בעלי bootstrap נופלים לצי הראשי הידוע (אותו UUID כמו במחליף) */
  const effectiveOrgId =
    orgFromContext ??
    (isFleetBootstrapOwnerEmail(sessionEmail) ? FALLBACK_MAIN_FLEET_ORG_ID : null);

  const effectiveUserId = (impersonatedUserId ?? user?.id ?? null) as string | null;

  /** בעלי צי ידועים: בלי impersonation מלא (או בלי באנר) — אפשר מסלול בלי org ב-query enable */
  const bootstrapOwnerMayLackOrg =
    isFleetBootstrapOwnerEmail(sessionEmail) && !isImpersonating && !viewAsBannerActive;

  const rolesQuery = useQuery({
    queryKey: ['view-as-target-roles', effectiveUserId, isImpersonating],
    enabled: Boolean(isImpersonating && effectiveUserId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', effectiveUserId!);
      if (error) throw error;
      return (data ?? []).map((r: { role: string }) => String(r.role).toLowerCase());
    },
    staleTime: 60_000,
  });

  const isDriverContextOnly = useMemo(() => {
    if (!isImpersonating) return false;
    if (!rolesQuery.isFetched) return false;
    const roles = rolesQuery.data ?? [];
    if (roles.length === 0) return false;
    const hasDriver = roles.includes('driver') || roles.includes('employee');
    const hasElevated = roles.includes('admin') || roles.includes('fleet_manager');
    return hasDriver && !hasElevated;
  }, [isImpersonating, rolesQuery.data, rolesQuery.isFetched]);

  const driverRowQuery = useQuery({
    queryKey: ['view-as-scoped-driver', effectiveOrgId, impersonatedUserId, isDriverContextOnly],
    enabled: Boolean(isDriverContextOnly && effectiveOrgId && impersonatedUserId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id')
        .eq('org_id', effectiveOrgId!)
        .eq('user_id', impersonatedUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { id: string } | null)?.id ?? null;
    },
    staleTime: 60_000,
  });

  const scopePending = Boolean(isImpersonating && rolesQuery.isLoading);
  const scopedDriverId = isDriverContextOnly ? (driverRowQuery.data ?? null) : null;
  const driverScopePending = Boolean(isDriverContextOnly && driverRowQuery.isLoading);

  const fleetListReady =
    (effectiveOrgId != null || bootstrapOwnerMayLackOrg) &&
    !scopePending &&
    (!isImpersonating || rolesQuery.isFetched) &&
    (!isDriverContextOnly || !driverScopePending);

  const fleetManagerListUserId = (isDriverContextOnly ? null : effectiveUserId) as string | null;

  const viewerIsFleetElevated = useMemo(
    () => rolesIncludeFleetElevated((loggedInRoles ?? []).map((x) => String(x))),
    [loggedInRoles]
  );

  const impersonatedFleetElevated = useMemo(() => {
    if (!isImpersonating) return false;
    if (!rolesQuery.isFetched) return false;
    return rolesIncludeFleetElevated(rolesQuery.data ?? []);
  }, [isImpersonating, rolesQuery.data, rolesQuery.isFetched]);

  const fleetListSubjectIsElevated = isImpersonating ? impersonatedFleetElevated : viewerIsFleetElevated;

  /** Per-manager lists within org for admins/managers; viewers keep org-wide lists (NULL managed_by pool). */
  const applyFleetManagerSlice =
    fleetManagerListUserId != null &&
    !isDriverContextOnly &&
    fleetListSubjectIsElevated;

  console.log(
    '[Debug Scope Hook] isImpersonating:',
    isImpersonating,
    'viewAsEmail:',
    viewAsEmail,
    'effectiveUserId:',
    effectiveUserId,
    'impersonatedUserId:',
    impersonatedUserId,
    'applyFleetManagerSlice:',
    applyFleetManagerSlice,
    'fleetManagerListUserId:',
    fleetManagerListUserId
  );

  return {
    effectiveOrgId,
    effectiveUserId,
    impersonatedUserId,
    isImpersonating,
    isDriverContextOnly,
    scopedDriverId,
    fleetListReady,
    applyFleetManagerSlice,
    fleetManagerListUserId,
  };
}
