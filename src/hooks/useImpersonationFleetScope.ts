import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAs } from '@/contexts/ViewAsContext';
import {
  isPlatformSuperOwnerEmail,
  isRavidManagerEmail,
  resolveSessionEmail,
  RAVID_MANAGER_EMAIL,
} from '@/lib/fleetBootstrapEmails';
import { FALLBACK_MAIN_FLEET_ORG_ID, RAVID_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';

/**
 * הקשר לרשימות צי: org (כולל View As), נהג בלבד כשמוחלפים משתמש עם רק תפקיד נהג.
 * applyFleetManagerSlice: סינון managed_by בלקוח לכל משתמש שאינו מנהל־על/רביד (משלים ל־RLS).
 */
function rolesIncludeFleetElevated(roles: string[]): boolean {
  const r = roles.map((x) => String(x).toLowerCase());
  return r.includes('admin') || r.includes('fleet_manager');
}

export function useImpersonationFleetScope() {
  const { user, profile, activeOrgId, roles: loggedInRoles, platformFleetViewAdminId } = useAuth();
  const sessionEmail = resolveSessionEmail(profile, user);
  const { viewAsEmail, viewAsProfile } = useViewAs();

  const impersonatedUserId = (viewAsProfile?.id ?? viewAsProfile?.user_id ?? null) as string | null;
  /** פרופיל נטען — טעינת תפקידי נהג/מנהל לפי המשתמש המוחלף */
  const isImpersonating = Boolean(viewAsEmail?.trim() && impersonatedUserId);
  /** באנר תצוגה כ… פעיל (גם אם profiles עדיין לא נפתר בגלל RLS) */
  const viewAsBannerActive = Boolean(viewAsEmail?.trim());
  const viewAsNorm = (viewAsEmail ?? '').trim().toLowerCase();
  const sessionNorm = resolveSessionEmail(profile, user);
  const viewAsActive = Boolean((viewAsEmail ?? '').trim());
  /**
   * נעילה ל־RAVID_FLEET_ORG_ID רק כשאין תצוגה כמשתמש אחר (רביד «עצמו»), או כשהתצוגה היא כרביד.
   * אחרת: כש־רביד בתצוגה כרועי — `sessionNorm` עדיין רביד ואסור לכפות את ארגון רביד (אחרת נשארת שורת
   * הפרופיל של רביד בניהול צוות במקום צו המשנה).
   */
  const forceRavidFleetOrg =
    viewAsNorm === RAVID_MANAGER_EMAIL ||
    (sessionNorm === RAVID_MANAGER_EMAIL && !viewAsActive);
  const orgFromContext = (
    (forceRavidFleetOrg ? RAVID_FLEET_ORG_ID : null) ??
    activeOrgId ??
    viewAsProfile?.org_id ??
    null
  ) as string | null;
  /** בלי org בפרופיל/מחליף — בעלי bootstrap נופלים לצי הראשי הידוע (אותו UUID כמו במחליף) */
  const effectiveOrgId =
    orgFromContext ?? (isPlatformSuperOwnerEmail(sessionEmail) ? FALLBACK_MAIN_FLEET_ORG_ID : null);

  const effectiveUserId = (impersonatedUserId ?? user?.id ?? null) as string | null;

  /** בעלי צי ידועים: בלי impersonation מלא (או בלי באנר) — אפשר מסלול בלי org ב-query enable */
  const bootstrapOwnerMayLackOrg =
    isPlatformSuperOwnerEmail(sessionEmail) && !isImpersonating && !viewAsBannerActive;

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

  const loggedInRolesNorm = useMemo(
    () => (loggedInRoles ?? []).map((x) => String(x).toLowerCase()),
    [loggedInRoles],
  );
  const loggedInProfileDelegatedDriverContext = useMemo(() => {
    if (isImpersonating) return false;
    if (rolesIncludeFleetElevated(loggedInRolesNorm)) return false;
    const hasParentAdmin = Boolean(profile?.parent_admin_id?.trim() || profile?.managed_by_user_id?.trim());
    if (!hasParentAdmin) return false;
    const perms = (profile?.permissions ?? null) as Record<string, unknown> | null;
    if (!perms || typeof perms !== 'object') return false;
    const hasAdminAccessFlag = typeof perms.admin_access === 'boolean';
    const hasManageTeamFlag = typeof perms.manage_team === 'boolean';
    if (!hasAdminAccessFlag && !hasManageTeamFlag) return false;
    const adminAccess = perms.admin_access === true;
    const manageTeam = perms.manage_team === true;
    return !adminAccess && !manageTeam;
  }, [isImpersonating, loggedInRolesNorm, profile?.parent_admin_id, profile?.managed_by_user_id, profile?.permissions]);
  const loggedInDriverContextOnly = useMemo(() => {
    if (isImpersonating) return false;
    /** יש מנהל ישיר בפרופיל — לא לכפות מצב «נהג בלבד» (רק רכב משובץ); רשימות עוברות RLS + סינון managed_by בלקוח */
    if ((profile?.parent_admin_id ?? '').trim()) return false;
    if (loggedInProfileDelegatedDriverContext) return true;
    if (loggedInRolesNorm.length === 0) return false;
    const hasDriver = loggedInRolesNorm.includes('driver') || loggedInRolesNorm.includes('employee') || loggedInRolesNorm.includes('viewer');
    const hasElevated = loggedInRolesNorm.includes('admin') || loggedInRolesNorm.includes('fleet_manager');
    return hasDriver && !hasElevated;
  }, [loggedInProfileDelegatedDriverContext, isImpersonating, loggedInRolesNorm, profile?.parent_admin_id]);

  const impersonatedDriverContextOnly = useMemo(() => {
    if (!isImpersonating) return false;
    if (!rolesQuery.isFetched) return false;
    const roles = rolesQuery.data ?? [];
    if (roles.length === 0) return false;
    const hasDriver = roles.includes('driver') || roles.includes('employee') || roles.includes('viewer');
    const hasElevated = roles.includes('admin') || roles.includes('fleet_manager');
    return hasDriver && !hasElevated;
  }, [isImpersonating, rolesQuery.data, rolesQuery.isFetched]);

  const isDriverContextOnly = impersonatedDriverContextOnly || loggedInDriverContextOnly;
  const scopedDriverUserId = isImpersonating ? impersonatedUserId : effectiveUserId;

  const driverRowQuery = useQuery({
    queryKey: ['view-as-scoped-driver', effectiveOrgId, scopedDriverUserId, isDriverContextOnly],
    enabled: Boolean(isDriverContextOnly && effectiveOrgId && scopedDriverUserId),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id')
        .eq('org_id', effectiveOrgId!)
        .eq('user_id', scopedDriverUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { id: string } | null)?.id ?? null;
    },
    staleTime: 60_000,
  });

  const scopePending = Boolean(isImpersonating && rolesQuery.isLoading);
  const scopedDriverId = isDriverContextOnly ? (driverRowQuery.data ?? null) : null;
  const driverScopePending = Boolean(isDriverContextOnly && driverRowQuery.isLoading);

  const platformTenantViewProfileQuery = useQuery({
    queryKey: ['platform-tenant-fleet-view-profile', platformFleetViewAdminId],
    enabled: Boolean(isPlatformSuperOwnerEmail(sessionEmail) && platformFleetViewAdminId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, org_id, parent_admin_id, managed_by_user_id')
        .eq('id', platformFleetViewAdminId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        email: string | null;
        org_id: string | null;
        parent_admin_id?: string | null;
        managed_by_user_id?: string | null;
      } | null;
    },
    staleTime: 60_000,
  });

  const platformTenantViewProfile = platformTenantViewProfileQuery.data ?? null;
  const platformTenantViewLookupFailed = Boolean(
    platformFleetViewAdminId && platformTenantViewProfileQuery.isFetched && !platformTenantViewProfileQuery.data,
  );
  const platformTenantViewPending = Boolean(
    isPlatformSuperOwnerEmail(sessionEmail) && platformFleetViewAdminId && platformTenantViewProfileQuery.isLoading,
  );

  const fleetListReady =
    (effectiveOrgId != null || bootstrapOwnerMayLackOrg) &&
    !scopePending &&
    (!isImpersonating || rolesQuery.isFetched) &&
    (!isDriverContextOnly || !driverScopePending) &&
    !platformTenantViewPending;

  const fleetManagerListUserId = (isDriverContextOnly ? null : effectiveUserId) as string | null;

  /** profiles.id של מנהל העל — עדיין מוחזר לתאימות; רשימות מסתמכות על RLS (אין slice בלקוח) */
  const fleetManagerParentProfileId = useMemo((): string | null => {
    if (isImpersonating) {
      const fromProfile = (viewAsProfile?.parent_admin_id ?? viewAsProfile?.managed_by_user_id ?? '').trim();
      return fromProfile || null;
    }
    // Admin-like users should not inherit parent-owner slice (prevents sibling admin data leak).
    const sessionEmailNow = resolveSessionEmail(profile, user);
    const perms = (profile?.permissions ?? null) as Record<string, unknown> | null;
    const isAdminLike =
      isRavidManagerEmail(sessionEmailNow) ||
      profile?.is_system_admin === true ||
      loggedInRolesNorm.includes('admin') ||
      loggedInRolesNorm.includes('fleet_manager') ||
      perms?.admin_access === true ||
      perms?.manage_team === true;
    if (isAdminLike) return null;
    const fromProfile = (profile?.parent_admin_id ?? profile?.managed_by_user_id ?? '').trim();
    return fromProfile || null;
  }, [
    isImpersonating,
    loggedInRolesNorm,
    profile?.parent_admin_id,
    profile?.managed_by_user_id,
    profile?.is_system_admin,
    profile?.permissions,
    profile,
    user,
    viewAsProfile?.parent_admin_id,
    viewAsProfile?.managed_by_user_id,
  ]);

  /**
   * סינון PostgREST לפי managed_by + הורה (fleetManagerVisibilityOrFilter). מנהלי bootstrap (מנהל על + רביד)
   * לא מסננים כאן — רק מנהל-העל. שאר המשתמשים (כולל רביד) חייבים slice כדי למנוע דליפת צי בין אדמינים.
   */
  const applyFleetManagerSlice = useMemo(() => {
    if (isImpersonating) return false;
    const e = resolveSessionEmail(profile, user);
    if (isPlatformSuperOwnerEmail(e)) return false;
    return true;
  }, [isImpersonating, profile, user]);

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
    fleetManagerParentProfileId,
    platformFleetViewAdminId,
    platformTenantViewProfile,
    platformTenantViewLookupFailed,
  };
}
