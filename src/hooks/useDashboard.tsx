import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, ComplianceStatus } from '@/types/fleet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { isFleetBootstrapOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';

const COMPLIANCE_IN_CHUNK = 80;

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

interface ComplianceItem {
  id: string;
  type: 'vehicle' | 'driver';
  name: string;
  alertType: string;
  expiryDate: string;
  status: ComplianceStatus;
}

export function useDashboardStats() {
  const { roles: loggedInRoles, user, profile } = useAuth();
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

  const sessionEmailSig = resolveSessionEmail(profile, user);

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
      sessionEmailSig,
    ],
    enabled: fleetListReady && effectiveUserId != null,
    queryFn: async (): Promise<DashboardStats> => {
      if (!effectiveUserId) {
        return { totalVehicles: 0, totalDrivers: 0, alertsCount: 0, warningCount: 0, expiredCount: 0 };
      }

      const normalizedEmail = resolveSessionEmail(profile, user);
      const isMainAdmin = normalizedEmail === 'malachiroei@gmail.com';

      /** בלי org (פרו/RLS) — רק בעלי bootstrap: ספירה גלובלית */
      if (!effectiveOrgId) {
        if (!isFleetBootstrapOwnerEmail(normalizedEmail)) {
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

        // Owner fallback: if active org is empty, show global fleet totals.
        if (isMainAdmin && vehiclesCount === 0 && driversCount === 0) {
          const [gv, gd] = await Promise.all([
            supabase.from('vehicles').select('id'),
            supabase.from('drivers').select('id'),
          ]);
          if (gv.error) throw gv.error;
          if (gd.error) throw gd.error;
          vehiclesCount = (gv.data ?? []).length;
          driversCount = (gd.data ?? []).length;
        }
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
  const {
    effectiveOrgId,
    effectiveUserId,
    fleetListReady,
    applyFleetManagerSlice,
    fleetManagerListUserId,
    isDriverContextOnly,
    scopedDriverId,
  } = useImpersonationFleetScope();

  return useQuery({
    queryKey: [
      'compliance-alerts',
      effectiveOrgId,
      effectiveUserId,
      applyFleetManagerSlice,
      fleetManagerListUserId,
      isDriverContextOnly,
      scopedDriverId,
    ],
    enabled: fleetListReady && effectiveUserId != null,
    staleTime: 30_000,
    queryFn: async (): Promise<ComplianceItem[]> => {
      const { data: rows, error } = await supabase
        .from('compliance_alerts')
        .select('id, entity_type, entity_id, alert_type, expiry_date, status')
        .order('expiry_date', { ascending: true });

      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];

      const vehicleIds = [...new Set(list.filter((r) => r.entity_type === 'vehicle').map((r) => r.entity_id))];
      const driverIds = [...new Set(list.filter((r) => r.entity_type === 'driver').map((r) => r.entity_id))];

      const vehicleById = new Map<
        string,
        { plate_number: string | null; org_id: string | null; managed_by_user_id: string | null; assigned_driver_id: string | null }
      >();
      for (const part of chunkIds(vehicleIds, COMPLIANCE_IN_CHUNK)) {
        const { data: vrows, error: verr } = await supabase
          .from('vehicles')
          .select('id, plate_number, org_id, managed_by_user_id, assigned_driver_id')
          .in('id', part);
        if (verr) throw verr;
        for (const v of vrows ?? []) {
          vehicleById.set(v.id, {
            plate_number: v.plate_number ?? null,
            org_id: v.org_id ?? null,
            managed_by_user_id: v.managed_by_user_id ?? null,
            assigned_driver_id: v.assigned_driver_id ?? null,
          });
        }
      }

      const driverById = new Map<
        string,
        { full_name: string | null; org_id: string | null; managed_by_user_id: string | null }
      >();
      for (const part of chunkIds(driverIds, COMPLIANCE_IN_CHUNK)) {
        const { data: drows, error: derr } = await supabase
          .from('drivers')
          .select('id, full_name, org_id, managed_by_user_id')
          .in('id', part);
        if (derr) throw derr;
        for (const d of drows ?? []) {
          driverById.set(d.id, {
            full_name: d.full_name ?? null,
            org_id: d.org_id ?? null,
            managed_by_user_id: d.managed_by_user_id ?? null,
          });
        }
      }

      const out: ComplianceItem[] = [];

      for (const r of list) {
        if (r.entity_type === 'vehicle') {
          const v = vehicleById.get(r.entity_id);
          if (!v) continue;

          if (isDriverContextOnly && scopedDriverId) {
            if (v.assigned_driver_id !== scopedDriverId) continue;
          } else {
            if (effectiveOrgId && v.org_id && v.org_id !== effectiveOrgId) continue;
            if (
              applyFleetManagerSlice &&
              fleetManagerListUserId &&
              v.managed_by_user_id != null &&
              v.managed_by_user_id !== fleetManagerListUserId
            ) {
              continue;
            }
          }

          out.push({
            id: r.id,
            type: 'vehicle',
            name: v.plate_number?.trim() || 'רכב',
            alertType: r.alert_type,
            expiryDate: r.expiry_date,
            status: r.status as ComplianceStatus,
          });
        } else {
          const d = driverById.get(r.entity_id);
          if (!d) continue;

          if (isDriverContextOnly && scopedDriverId) {
            if (r.entity_id !== scopedDriverId) continue;
          } else {
            if (effectiveOrgId && d.org_id && d.org_id !== effectiveOrgId) continue;
            if (
              applyFleetManagerSlice &&
              fleetManagerListUserId &&
              d.managed_by_user_id != null &&
              d.managed_by_user_id !== fleetManagerListUserId
            ) {
              continue;
            }
          }

          out.push({
            id: r.id,
            type: 'driver',
            name: d.full_name?.trim() || 'נהג',
            alertType: r.alert_type,
            expiryDate: r.expiry_date,
            status: r.status as ComplianceStatus,
          });
        }
      }

      return out;
    },
  });
}
