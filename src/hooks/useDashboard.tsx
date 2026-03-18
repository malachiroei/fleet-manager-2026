import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, ComplianceStatus } from '@/types/fleet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAs } from '@/contexts/ViewAsContext';

interface ComplianceItem {
  id: string;
  type: 'vehicle' | 'driver';
  name: string;
  alertType: string;
  expiryDate: string;
  status: ComplianceStatus;
}

export function useDashboardStats() {
  const { user, roles: loggedInRoles, activeOrgId } = useAuth();
  const { viewAsEmail, viewAsProfile } = useViewAs();

  const isImpersonating = Boolean(viewAsEmail && viewAsProfile?.user_id);
  const effectiveUserId = (viewAsProfile?.user_id ?? user?.id ?? null) as string | null;
  const effectiveOrgId = (viewAsProfile?.org_id ?? activeOrgId ?? null) as string | null;

  const loggedInRolesSig = (loggedInRoles ?? [])
    .map((r) => String(r).toLowerCase())
    .sort()
    .join('|');

  return useQuery({
    queryKey: ['dashboard-stats', effectiveOrgId, effectiveUserId, isImpersonating, loggedInRolesSig],
    enabled: effectiveOrgId != null && effectiveUserId != null,
    queryFn: async (): Promise<DashboardStats> => {
      if (!effectiveOrgId || !effectiveUserId) {
        return { totalVehicles: 0, totalDrivers: 0, alertsCount: 0, warningCount: 0, expiredCount: 0 };
      }

      const normalizeRole = (r: unknown) => String(r ?? '').toLowerCase();

      const getTargetRoles = async (): Promise<string[]> => {
        if (!isImpersonating) {
          return (loggedInRoles ?? []).map(normalizeRole);
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', effectiveUserId);

        if (error) throw error;
        return (data ?? []).map((row: { role: string }) => normalizeRole(row.role));
      };

      const targetRoles = await getTargetRoles();
      const hasDriverRole = targetRoles.includes('driver');
      const hasAdminRole = targetRoles.includes('admin');
      const hasFleetManagerRole = targetRoles.includes('fleet_manager');
      const isDriverContextOnly =
        targetRoles.length > 0 && hasDriverRole && !hasAdminRole && !hasFleetManagerRole;

      const resolveDriverIdForUser = async (orgId: string, userId: string): Promise<string | null> => {
        const { data, error } = await supabase
          .from('drivers')
          .select('id')
          .eq('org_id', orgId)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        return (data as { id?: string } | null)?.id ?? null;
      };

      let vehiclesCount = 0;
      let driversCount = 0;

      if (isDriverContextOnly) {
        // Driver context: counts must be scoped to the driver assigned to this user.
        const driverId = await resolveDriverIdForUser(effectiveOrgId, effectiveUserId);
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
        // Admin/fleet manager context: org-wide counts.
        const { data: vRows, error: vErr } = await supabase
          .from('vehicles')
          .select('id')
          .eq('org_id', effectiveOrgId);

        if (vErr) throw vErr;

        const { data: dRows, error: dErr } = await supabase
          .from('drivers')
          .select('id')
          .eq('org_id', effectiveOrgId);

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

// הפונקציה שהייתה חסרה וגרמה לשגיאה ב-Vercel
export function useComplianceAlerts() {
  return useQuery({
    queryKey: ['compliance-alerts'],
    enabled: false,
    queryFn: async (): Promise<ComplianceItem[]> => []
  });
}