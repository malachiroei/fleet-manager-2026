import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, ComplianceStatus } from '@/types/fleet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAs } from '@/contexts/ViewAsContext';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { isFleetBootstrapOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import { fleetManagerVisibilityOrFilter } from '@/lib/fleetManagerScope';

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
  /** לדה-דופ מול התראות שמחושבות מתאריכי רכב/נהג */
  entityId?: string;
}

/** תואם VehicleDetailPage.calculateStatus — רק expired/warning נחשבים כהתראה */
function complianceAlertLevelFromExpiry(expiryDate: string | null | undefined): ComplianceStatus | null {
  if (expiryDate == null || String(expiryDate).trim() === '') return null;
  const expiry = new Date(String(expiryDate));
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'warning';
  return null;
}

function complianceExpiryIsoDate(expiryDate: string | null | undefined): string {
  const s = String(expiryDate ?? '').trim();
  if (!s) return '';
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function complianceDedupeSlotFromDb(
  type: 'vehicle' | 'driver',
  entityId: string,
  alertType: string,
): string | null {
  const at = alertType || '';
  if (type === 'vehicle') {
    if (/טסט|test/i.test(at)) return `v:${entityId}:test`;
    if (/ביטוח|insurance/i.test(at)) return `v:${entityId}:ins`;
    return null;
  }
  if (type === 'driver') {
    if (/רישיון|license/i.test(at)) return `d:${entityId}:license`;
    return `d:${entityId}:t:${at}`;
  }
  return null;
}

type DerivedComplianceCtx = {
  effectiveOrgId: string | null;
  isDriverContextOnly: boolean;
  scopedDriverId: string | null;
  applyFleetManagerSlice: boolean;
  fleetManagerListUserId: string | null;
};

async function appendDerivedComplianceFromFleetDates(
  out: ComplianceItem[],
  occupiedSlots: Set<string>,
  ctx: DerivedComplianceCtx,
): Promise<void> {
  const { effectiveOrgId, isDriverContextOnly, scopedDriverId, applyFleetManagerSlice, fleetManagerListUserId } =
    ctx;
  if (!effectiveOrgId) return;

  type VRow = {
    id: string;
    plate_number: string | null;
    org_id: string | null;
    managed_by_user_id: string | null;
    assigned_driver_id: string | null;
    test_expiry: string | null;
    insurance_expiry: string | null;
  };
  type DRow = {
    id: string;
    full_name: string | null;
    org_id: string | null;
    managed_by_user_id: string | null;
    license_expiry: string | null;
  };

  let vRows: VRow[] = [];
  if (isDriverContextOnly && scopedDriverId) {
    const { data, error } = await supabase
      .from('vehicles')
      .select(
        'id, plate_number, org_id, managed_by_user_id, assigned_driver_id, test_expiry, insurance_expiry',
      )
      .eq('org_id', effectiveOrgId)
      .eq('assigned_driver_id', scopedDriverId);
    if (error) {
      console.warn('[useComplianceAlerts] derived vehicles (driver scope) failed', error.message);
      return;
    }
    vRows = (data ?? []) as VRow[];
  } else {
    let vq = supabase
      .from('vehicles')
      .select('id, plate_number, org_id, managed_by_user_id, assigned_driver_id, test_expiry, insurance_expiry')
      .eq('org_id', effectiveOrgId);
    if (applyFleetManagerSlice && fleetManagerListUserId) {
      vq = vq.or(fleetManagerVisibilityOrFilter(fleetManagerListUserId));
    }
    const { data, error } = await vq;
    if (error) {
      console.warn('[useComplianceAlerts] derived vehicles failed', error.message);
      return;
    }
    vRows = (data ?? []) as VRow[];
  }

  let dRows: DRow[] = [];
  if (isDriverContextOnly && scopedDriverId) {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, org_id, managed_by_user_id, license_expiry')
      .eq('id', scopedDriverId)
      .maybeSingle();
    if (error) {
      console.warn('[useComplianceAlerts] derived driver (scoped) failed', error.message);
    } else if (data) {
      dRows = [data as DRow];
    }
  } else {
    let dq = supabase
      .from('drivers')
      .select('id, full_name, org_id, managed_by_user_id, license_expiry')
      .eq('org_id', effectiveOrgId);
    if (applyFleetManagerSlice && fleetManagerListUserId) {
      dq = dq.or(fleetManagerVisibilityOrFilter(fleetManagerListUserId));
    }
    const { data, error } = await dq;
    if (error) {
      console.warn('[useComplianceAlerts] derived drivers failed', error.message);
    } else {
      dRows = (data ?? []) as DRow[];
    }
  }

  const tryPushVehicle = (
    vid: string,
    plateLabel: string,
    slot: 'test' | 'insurance',
    rawExpiry: string | null,
    alertLabel: string,
  ) => {
    const level = complianceAlertLevelFromExpiry(rawExpiry);
    if (!level) return;
    const slotKey = `v:${vid}:${slot}`;
    if (occupiedSlots.has(slotKey)) return;
    occupiedSlots.add(slotKey);
    out.push({
      id: `derived:v:${vid}:${slot}`,
      entityId: vid,
      type: 'vehicle',
      name: plateLabel,
      alertType: alertLabel,
      expiryDate: complianceExpiryIsoDate(rawExpiry),
      status: level,
    });
  };

  for (const v of vRows) {
    const plate = v.plate_number?.trim() || 'רכב';
    tryPushVehicle(v.id, plate, 'test', v.test_expiry, 'תוקף טסט');
    tryPushVehicle(v.id, plate, 'insurance', v.insurance_expiry, 'תוקף ביטוח');
  }

  for (const d of dRows) {
    const level = complianceAlertLevelFromExpiry(d.license_expiry);
    if (!level) continue;
    const slotKey = `d:${d.id}:license`;
    if (occupiedSlots.has(slotKey)) continue;
    occupiedSlots.add(slotKey);
    out.push({
      id: `derived:d:${d.id}:license`,
      entityId: d.id,
      type: 'driver',
      name: d.full_name?.trim() || 'נהג',
      alertType: 'רישיון נהג',
      expiryDate: complianceExpiryIsoDate(d.license_expiry),
      status: level,
    });
  }
}

export function useDashboardStats() {
  const { roles: loggedInRoles, user, profile } = useAuth();
  const { viewAsEmail } = useViewAs();
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
      viewAsEmail ?? '',
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
          vq = vq.or(fleetManagerVisibilityOrFilter(fleetManagerListUserId));
          dq = dq.or(fleetManagerVisibilityOrFilter(fleetManagerListUserId));
        }
        const { data: vRows, error: vErr } = await vq;
        if (vErr) throw vErr;

        const { data: dRows, error: dErr } = await dq;
        if (dErr) throw dErr;

        vehiclesCount = (vRows ?? []).length;
        driversCount = (dRows ?? []).length;

        // Owner fallback: אם הארגון ריק — ספירה גלובלית (לא בתצוגת משתמש / impersonation).
        if (
          isMainAdmin &&
          !viewAsEmail?.trim() &&
          !isImpersonating &&
          vehiclesCount === 0 &&
          driversCount === 0
        ) {
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
    staleTime: 60_000,
    /** 400 על compliance_alerts + retry ברירת מחדל = אלפי בקשות והקפאת UI */
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<ComplianceItem[]> => {
      const out: ComplianceItem[] = [];
      const occupiedSlots = new Set<string>();

      const { data: rows, error } = await supabase
        .from('compliance_alerts')
        .select('id, entity_type, entity_id, alert_type, expiry_date, status');

      if (error) {
        console.warn('[useComplianceAlerts] compliance_alerts select failed — falling back to derived', error.message);
      }

      const list = error ? [] : (rows ?? []);

      if (list.length > 0) {
        const vehicleIds = [...new Set(list.filter((r) => r.entity_type === 'vehicle').map((r) => r.entity_id))];
        const driverIds = [...new Set(list.filter((r) => r.entity_type === 'driver').map((r) => r.entity_id))];

        const vehicleById = new Map<
          string,
          {
            plate_number: string | null;
            org_id: string | null;
            managed_by_user_id: string | null;
            assigned_driver_id: string | null;
          }
        >();
        for (const part of chunkIds(vehicleIds, COMPLIANCE_IN_CHUNK)) {
          const { data: vrows, error: verr } = await supabase
            .from('vehicles')
            .select('id, plate_number, org_id, managed_by_user_id, assigned_driver_id')
            .in('id', part);
          if (verr) {
            console.warn('[useComplianceAlerts] vehicles chunk failed — skipping chunk', verr.message);
            continue;
          }
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
          if (derr) {
            console.warn('[useComplianceAlerts] drivers chunk failed — skipping chunk', derr.message);
            continue;
          }
          for (const d of drows ?? []) {
            driverById.set(d.id, {
              full_name: d.full_name ?? null,
              org_id: d.org_id ?? null,
              managed_by_user_id: d.managed_by_user_id ?? null,
            });
          }
        }

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

            const sk = complianceDedupeSlotFromDb('vehicle', r.entity_id, r.alert_type);
            if (sk) occupiedSlots.add(sk);

            out.push({
              id: r.id,
              entityId: r.entity_id,
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

            const sk = complianceDedupeSlotFromDb('driver', r.entity_id, r.alert_type);
            if (sk) occupiedSlots.add(sk);

            out.push({
              id: r.id,
              entityId: r.entity_id,
              type: 'driver',
              name: d.full_name?.trim() || 'נהג',
              alertType: r.alert_type,
              expiryDate: r.expiry_date,
              status: r.status as ComplianceStatus,
            });
          }
        }
      }

      await appendDerivedComplianceFromFleetDates(out, occupiedSlots, {
        effectiveOrgId,
        isDriverContextOnly,
        scopedDriverId,
        applyFleetManagerSlice,
        fleetManagerListUserId,
      });

      return out;
    },
  });
}
