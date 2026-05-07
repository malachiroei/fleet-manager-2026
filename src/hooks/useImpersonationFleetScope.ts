import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAs } from '@/contexts/ViewAsContext';
import {
  isPlatformSuperOwnerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';
import { FALLBACK_MAIN_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';
import { resolveLockedFleetOrgIdForStaff } from '@/lib/resolveFleetScopeOrg';

/** תפקידים מועלים בצי — לזיהוי הקשר נהג־בלבד */
function rolesIncludeFleetElevated(roles: string[]): boolean {
  const r = roles.map((x) => String(x).toLowerCase());
  return r.includes('admin') || r.includes('fleet_manager');
}

export function useImpersonationFleetScope() {
  const { user, profile, activeOrgId, roles: loggedInRoles, memberOrganizations } = useAuth();
  const sessionEmail = resolveSessionEmail(profile, user);
  const platformSuperOwner = isPlatformSuperOwnerEmail(sessionEmail);
  const lockedFleetOrgIdForStaff = resolveLockedFleetOrgIdForStaff(profile, memberOrganizations);

  const { viewAsEmail, viewAsProfile } = useViewAs();

  const impersonatedUserId = (viewAsProfile?.id ?? viewAsProfile?.user_id ?? null) as string | null;
  const isImpersonating = Boolean(viewAsEmail?.trim() && impersonatedUserId);
  /** באנר תצוגה כ… פעיל גם כשפרופיל המטרה עדיין לא נטען */
  const viewAsBannerActive = Boolean(viewAsEmail?.trim());
  /**
   * נתוני צי: בעל פלטפורמה משתמש ב-activeOrgId (מתג ארגון). כל השאר נעולים ל-profiles.org_id —
   * ה-RLS מסנן עומק; אין סינון managed_by בלקוח.
   */
  const viewAsOrgTrim = ((viewAsProfile?.org_id ?? '').trim() || null) as string | null;

  /**
   * בעל פלטפורמה עם *מספר* ארגונים: לא ליפול ל-FALLBACK לפני שמתג הארגון / activeOrgId נטענו —
   * אחרת שאילתות כמו compliance_requests רצות על ארגון שגוי והסטטוס «נעלם» אחרי רענון.
   */
  const effectiveOrgId = platformSuperOwner
    ? (() => {
        const ao = (activeOrgId ?? '').trim();
        if (ao) return ao;
        if (viewAsOrgTrim) return viewAsOrgTrim;
        if (lockedFleetOrgIdForStaff) return lockedFleetOrgIdForStaff;
        const sole = memberOrganizations.length === 1 ? (memberOrganizations[0]?.id ?? '').trim() : '';
        if (sole) return sole;
        if (memberOrganizations.length > 1) return null as string | null;
        return FALLBACK_MAIN_FLEET_ORG_ID;
      })()
    : (lockedFleetOrgIdForStaff ?? viewAsOrgTrim ?? ((activeOrgId ?? '').trim() || null));

  const effectiveUserId = (impersonatedUserId ?? user?.id ?? null) as string | null;

  /** בעל פלטפורמה בלי impersonation ובלי באנר — מאפשר שאילתות לפני ש-activeOrgId הוגדר במלואו */
  const bootstrapOwnerMayLackOrg =
    platformSuperOwner && !isImpersonating && !viewAsBannerActive;

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
  const loggedInDriverContextOnly = useMemo(() => {
    if (isImpersonating) return false;
    if (loggedInRolesNorm.length === 0) return false;
    const hasDriver =
      loggedInRolesNorm.includes('driver') ||
      loggedInRolesNorm.includes('employee') ||
      loggedInRolesNorm.includes('viewer');
    const hasElevated = rolesIncludeFleetElevated(loggedInRolesNorm);
    return hasDriver && !hasElevated;
  }, [isImpersonating, loggedInRolesNorm]);

  const impersonatedDriverContextOnly = useMemo(() => {
    if (!isImpersonating) return false;
    if (!rolesQuery.isFetched) return false;
    const roles = rolesQuery.data ?? [];
    if (roles.length === 0) return false;
    const hasDriver =
      roles.includes('driver') || roles.includes('employee') || roles.includes('viewer');
    const hasElevated = rolesIncludeFleetElevated(roles);
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

  const fleetListReady =
    (effectiveOrgId != null || bootstrapOwnerMayLackOrg) &&
    !scopePending &&
    (!isImpersonating || rolesQuery.isFetched) &&
    (!isDriverContextOnly || !driverScopePending);

  return {
    effectiveOrgId: effectiveOrgId as string | null,
    effectiveUserId,
    impersonatedUserId,
    isImpersonating,
    isDriverContextOnly,
    scopedDriverId,
    fleetListReady,
  };
}
