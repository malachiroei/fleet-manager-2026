import { useQuery } from '@tanstack/react-query';
import type { DashboardStats } from '@/types/fleet';

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalVehicles: 0,
  totalDrivers: 0,
  alertsCount: 0,
  warningCount: 0,
  expiredCount: 0,
};
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAs } from '@/contexts/ViewAsContext';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { isPlatformSuperOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import {
  fetchComplianceAlerts,
  type ComplianceItem,
} from '@/lib/complianceAlertsEngine';

export type { ComplianceItem };

export function useDashboardStats() {
  const { roles: loggedInRoles, user, profile, activeOrgId } = useAuth();
  const { viewAsEmail } = useViewAs();
  const {
    effectiveOrgId,
    effectiveUserId,
    isImpersonating,
    isDriverContextOnly,
    scopedDriverId,
    fleetListReady,
  } = useImpersonationFleetScope();

  const loggedInRolesSig = (loggedInRoles ?? [])
    .map((r) => String(r).toLowerCase())
    .sort()
    .join('|');

  const sessionEmailSig = resolveSessionEmail(profile, user);
  const normalizedEmail = resolveSessionEmail(profile, user);
  const isPlatformSuperOwner = isPlatformSuperOwnerEmail(normalizedEmail);
  const orgIdForCounts = (effectiveOrgId ?? '').trim();
  /**
   * סטטיסטיקות דשבורד: רק כשיש מזהה ארגון בהיקף הצי — בלי org לא שולחים שאילתה בכלל.
   */
  const statsQueryEnabled = !!effectiveOrgId && fleetListReady;

  return useQuery({
    queryKey: [
      'dashboard-stats',
      orgIdForCounts,
      activeOrgId ?? '',
      profile?.org_id ?? '',
      effectiveUserId,
      viewAsEmail ?? '',
      isImpersonating,
      isDriverContextOnly,
      scopedDriverId,
      loggedInRolesSig,
      sessionEmailSig,
    ],
    enabled: statsQueryEnabled,
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardStats> => {
      if (!effectiveUserId) {
        return { totalVehicles: 0, totalDrivers: 0, alertsCount: 0, warningCount: 0, expiredCount: 0 };
      }

      /** בלי org — רק חשבון על (נדיר אחרי bootstrap) */
      if (!orgIdForCounts) {
        if (!isPlatformSuperOwner) {
          return { totalVehicles: 0, totalDrivers: 0, alertsCount: 0, warningCount: 0, expiredCount: 0 };
        }
        const [gv, gd] = await Promise.all([
          supabase.from('vehicles').select('id'),
          supabase.from('drivers').select('id'),
        ]);
        if (gv.error) throw gv.error;
        if (gd.error) throw gd.error;
        return {
          totalVehicles: (gv.data ?? []).length,
          totalDrivers: (gd.data ?? []).length,
          alertsCount: 0,
          warningCount: 0,
          expiredCount: 0,
        };
      }
      let vehiclesCount = 0;
      let driversCount = 0;

      /**
       * רק כשיש שורת `drivers` מקושרת ל-user — ספירה לפי שיוך רכב (כמו useVehicles עם scopedDriverId).
       * בלי `scopedDriverId` הרשימות (useVehicles/useDrivers) עדיין מציגות את כל הארגון — הדשבורד חייב להתאים.
       */
      if (isDriverContextOnly && scopedDriverId) {
        const driverId = scopedDriverId;
        const { data: vRows, error: vErr } = await supabase
          .from('vehicles')
          .select('id')
          .eq('org_id', orgIdForCounts)
          .eq('assigned_driver_id', driverId);

        if (vErr) throw vErr;
        vehiclesCount = (vRows ?? []).length;
        driversCount = 1;
      } else {
        const { data: vRows, error: vErr } = await supabase
          .from('vehicles')
          .select('id')
          .eq('org_id', orgIdForCounts);
        if (vErr) throw vErr;

        const { data: dRows, error: dErr } = await supabase
          .from('drivers')
          .select('id')
          .eq('org_id', orgIdForCounts);
        if (dErr) throw dErr;

        vehiclesCount = (vRows ?? []).length;
        driversCount = (dRows ?? []).length;
      }

      return {
        totalVehicles: vehiclesCount,
        totalDrivers: driversCount,
        alertsCount: 0,
        warningCount: 0,
        expiredCount: 0,
      };
    },
  });
}

export function useComplianceAlerts() {
  const { user, profile, loading: authLoading, activeOrgId } = useAuth();
  const {
    effectiveOrgId,
    effectiveUserId,
    fleetListReady,
    isDriverContextOnly,
    scopedDriverId,
  } = useImpersonationFleetScope();

  const sessionEmailSig = resolveSessionEmail(profile, user);
  const orgTrim = (effectiveOrgId ?? '').trim();
  const isPlatformSuperOwner = isPlatformSuperOwnerEmail(sessionEmailSig);
  const complianceAlertsEnabled =
    !authLoading &&
    fleetListReady &&
    effectiveUserId != null &&
    (orgTrim.length > 0 || isPlatformSuperOwner);

  return useQuery({
    queryKey: [
      'compliance-alerts',
      orgTrim,
      activeOrgId ?? '',
      profile?.org_id ?? '',
      effectiveUserId,
      isDriverContextOnly,
      scopedDriverId,
      sessionEmailSig,
    ],
    enabled: complianceAlertsEnabled,
    staleTime: 60_000,
    /** 400 על compliance_alerts + retry ברירת מחדל = אלפי בקשות והקפאת UI */
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<ComplianceItem[]> => {
      return fetchComplianceAlerts({
        effectiveOrgId: orgTrim || (effectiveOrgId ?? null),
        isDriverContextOnly,
        scopedDriverId,
      });
    },
  });
}
