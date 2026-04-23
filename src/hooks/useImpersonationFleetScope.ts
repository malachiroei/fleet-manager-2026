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
  /**
   * בין לחיצת View-As לבין טעינת viewAsProfile — effectiveUserId עדיין של המנהל המחובר.
   * אם מפעילים applyFleetManagerSlice עם UUID של רועי על org של רביד, מתקבל 0 שורות ואז
   * fallback של הדשבורד (מנהל ראשי) מציג את כל הצי הגלובלי — נראה כמו «רואים את רועי».
   */
  const viewAsProfilePending = Boolean(viewAsEmail?.trim()) && !impersonatedUserId;

  const viewAsNorm = (viewAsEmail ?? '').trim().toLowerCase();
  const sessionNorm = resolveSessionEmail(profile, user);
  /**
   * רביד מחובר (או תצוגה כרביד): תמיד ארגון הצי של רביד — גם כש־profiles.org_id בפרו עדיין הצי הראשי של רועי.
   * אחרת: activeOrgId ואז פרופיל המחליף.
   */
  const orgFromContext = (
    (sessionNorm === RAVID_MANAGER_EMAIL || viewAsNorm === RAVID_MANAGER_EMAIL
      ? RAVID_FLEET_ORG_ID
      : null) ??
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
    retry: false,
    refetchOnWindowFocus: false,
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
    retry: false,
    refetchOnWindowFocus: false,
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
    !viewAsProfilePending &&
    fleetManagerListUserId != null &&
    !isDriverContextOnly &&
    fleetListSubjectIsElevated;

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
