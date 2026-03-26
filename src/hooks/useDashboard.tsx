import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, ComplianceStatus } from '@/types/fleet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';

interface ComplianceItem {
  id: string;
  type: 'vehicle' | 'driver';
  name: string;
  alertType: string;
  expiryDate: string;
  status: ComplianceStatus;
}

export function useDashboardStats() {
  const { roles: loggedInRoles } = useAuth();
  const {
    effectiveOrgId,
    effectiveUserId,
    isImpersonating,
    isDriverContextOnly,
    scopedDriverId,
    fleetListReady,
    applyFleetManagerSlice,
    fleetManagerListUserId,
  } = useImpersonationFleetScope();

  const loggedInRolesSig = (loggedInRoles ?? [])
    .map((r) => String(r).toLowerCase())
    .sort()
    .join('|');

  return useQuery({
    queryKey: [
      'dashboard-stats',
      effectiveOrgId,
      effectiveUserId,
      isImpersonating,
      isDriverContextOnly,
      scopedDriverId,
      loggedInRolesSig,
      applyFleetManagerSlice,
      fleetManagerListUserId,
    ],
    enabled: fleetListReady && effectiveUserId != null && effectiveOrgId != null,
    queryFn: async (): Promise<DashboardStats> => {
      if (!effectiveOrgId || !effectiveUserId) {
        return { totalVehicles: 0, totalDrivers: 0, alertsCount: 0, warningCount: 0, expiredCount: 0 };
      }
      console.log(
        '[Debug Scope] applyFleetManagerSlice:',
        applyFleetManagerSlice,
        'Target ID:',
        fleetManagerListUserId
      );

      let vehiclesCount = 0;
      let driversCount = 0;

      if (isDriverContextOnly) {
        const driverId = scopedDriverId;
        if (!driverId) {
          return { totalVehicles: 0, totalDrivers: 0, alertsCount: 0, warningCount: 0, expiredCount: 0 };
        }

        const { data: vRows, error: vErr } = await supabase
          .from('vehicles')
          .select('id')
          .eq('org_id', effectiveOrgId)
          .eq('assigned_driver_id', driverId);

        if (vErr) throw vErr;
        vehiclesCount = (vRows ?? []).length;
        driversCount = 1;
      } else {
        let vq = supabase.from('vehicles').select('id').eq('org_id', effectiveOrgId);
        let dq = supabase.from('drivers').select('id').eq('org_id', effectiveOrgId);
        if (applyFleetManagerSlice && fleetManagerListUserId) {
          vq = vq.eq('managed_by_user_id', fleetManagerListUserId);
          dq = dq.eq('managed_by_user_id', fleetManagerListUserId);
        }
        const { data: vRows, error: vErr } = await vq;
        if (vErr) throw vErr;

        const { data: dRows, error: dErr } = await dq;
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
  return useQuery({
    queryKey: ['compliance-alerts'],
    enabled: false,
    queryFn: async (): Promise<ComplianceItem[]> => [],
  });
}
