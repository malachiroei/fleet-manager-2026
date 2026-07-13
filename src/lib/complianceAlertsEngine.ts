/**
 * Shared compliance-alert derivation — single source of truth for
 * Dashboard «התראות חריגה» and Fleet AI health check.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ComplianceStatus } from '@/types/fleet';

const COMPLIANCE_IN_CHUNK = 80;

export interface ComplianceItem {
  id: string;
  type: 'vehicle' | 'driver';
  name: string;
  alertType: string;
  expiryDate: string;
  status: ComplianceStatus;
  entityId?: string;
}

export interface FetchComplianceAlertsOptions {
  effectiveOrgId: string | null;
  isDriverContextOnly?: boolean;
  scopedDriverId?: string | null;
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

function normalizeComplianceAlertDbRow(raw: Record<string, unknown>): {
  id: string;
  entity_type: string;
  entity_id: string;
  alert_type: string;
  expiry_date: string;
  status: string;
} | null {
  const id = raw.id;
  if (typeof id !== 'string') return null;
  const alert_type = String(raw.alert_type ?? '');
  const expiry_date = String(raw.expiry_date ?? '');
  const status = String(raw.status ?? 'warning');

  if (typeof raw.entity_type === 'string' && typeof raw.entity_id === 'string') {
    return { id, entity_type: raw.entity_type, entity_id: raw.entity_id, alert_type, expiry_date, status };
  }
  if (typeof raw.vehicle_id === 'string' && raw.vehicle_id.trim()) {
    return { id, entity_type: 'vehicle', entity_id: raw.vehicle_id, alert_type, expiry_date, status };
  }
  if (typeof raw.driver_id === 'string' && raw.driver_id.trim()) {
    return { id, entity_type: 'driver', entity_id: raw.driver_id, alert_type, expiry_date, status };
  }
  return null;
}

/** תואם VehicleDetailPage.calculateStatus — רק expired/warning נחשבים כהתראה */
export function complianceAlertLevelFromExpiry(expiryDate: string | null | undefined): ComplianceStatus | null {
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

function complianceRawMissing(raw: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim();
  return s === '' || s === '—' || s.toLowerCase() === 'null';
}

function isFleetRowActiveForAlerts(row: { is_active?: boolean | null | string | number }): boolean {
  const v = row.is_active;
  if (v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false') return false;
  return true;
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
    if (/ביקורת|inspection/i.test(at)) return `v:${entityId}:inspection`;
    if (/טיפול|maintenance|service/i.test(at)) return `v:${entityId}:maintenance`;
    return null;
  }
  if (type === 'driver') {
    if (/צילום רישיון \(חזית\)|license.*front/i.test(at)) return `d:${entityId}:lic_front`;
    if (/צילום רישיון \(גב\)|license.*back/i.test(at)) return `d:${entityId}:lic_back`;
    if (/מסמך הצהרת|health.*doc/i.test(at)) return `d:${entityId}:health_doc`;
    if (/בדיקת רישיון|מבחן נהיגה/i.test(at)) return `d:${entityId}:practical_test`;
    if (/רישיון|license/i.test(at)) return `d:${entityId}:license`;
    if (/בריאות|health/i.test(at)) return `d:${entityId}:health`;
    if (/585/.test(at)) return `d:${entityId}:r585`;
    return `d:${entityId}:t:${at}`;
  }
  return null;
}

async function appendDerivedComplianceFromFleetDates(
  out: ComplianceItem[],
  occupiedSlots: Set<string>,
  ctx: FetchComplianceAlertsOptions,
): Promise<void> {
  const {
    effectiveOrgId,
    isDriverContextOnly = false,
    scopedDriverId = null,
  } = ctx;
  if (!effectiveOrgId) return;
  if (isDriverContextOnly && !scopedDriverId) return;

  type VRow = {
    id: string;
    plate_number: string | null;
    org_id: string | null;
    assigned_driver_id: string | null;
    is_active: boolean | null;
    road_ascent_month: number | null;
    road_ascent_year: number | null;
    test_expiry: string | null;
    insurance_expiry: string | null;
    next_inspection_date: string | null;
    next_maintenance_date: string | null;
  };
  type DRow = {
    id: string;
    full_name: string | null;
    org_id: string | null;
    status: string | null;
    is_active: boolean | null;
    license_expiry: string | null;
    health_declaration_date: string | null;
    regulation_585b_date: string | null;
    license_front_url: string | null;
    license_back_url: string | null;
    health_declaration_url: string | null;
    practical_driving_test_date: string | null;
  };

  let vRows: VRow[] = [];
  if (isDriverContextOnly && scopedDriverId) {
    const { data, error } = await supabase
      .from('vehicles')
      .select(
        'id, plate_number, org_id, assigned_driver_id, is_active, road_ascent_month, road_ascent_year, test_expiry, insurance_expiry, next_inspection_date, next_maintenance_date',
      )
      .eq('org_id', effectiveOrgId)
      .eq('assigned_driver_id', scopedDriverId);
    if (error) {
      console.warn('[complianceAlertsEngine] derived vehicles (driver scope) failed', error.message);
      return;
    }
    vRows = (data ?? []) as VRow[];
  } else {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, plate_number, org_id, assigned_driver_id, is_active, road_ascent_month, road_ascent_year, test_expiry, insurance_expiry, next_inspection_date, next_maintenance_date')
      .eq('org_id', effectiveOrgId);
    if (error) {
      console.warn('[complianceAlertsEngine] derived vehicles failed', error.message);
      return;
    }
    vRows = (data ?? []) as VRow[];
  }

  let dRows: DRow[] = [];
  if (isDriverContextOnly && scopedDriverId) {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, org_id, status, is_active, license_expiry, health_declaration_date, regulation_585b_date, license_front_url, license_back_url, health_declaration_url, practical_driving_test_date')
      .eq('id', scopedDriverId)
      .maybeSingle();
    if (error) {
      console.warn('[complianceAlertsEngine] derived driver (scoped) failed', error.message);
    } else if (data) {
      dRows = [data as DRow];
    }
  } else {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, org_id, status, is_active, license_expiry, health_declaration_date, regulation_585b_date, license_front_url, license_back_url, health_declaration_url, practical_driving_test_date')
      .eq('org_id', effectiveOrgId);
    if (error) {
      console.warn('[complianceAlertsEngine] derived drivers failed', error.message);
    } else {
      dRows = (data ?? []) as DRow[];
    }
  }

  const slotToComplianceTaskKey: Record<
    'test' | 'insurance' | 'inspection' | 'maintenance',
    string
  > = {
    test: 'annual_licensing',
    insurance: 'insurance',
    inspection: 'periodic_inspection',
    maintenance: 'maintenance',
  };

  const pendingVehicleAdminKeys = new Set<string>();
  try {
    const { data: pvRows } = await supabase
      .from('compliance_requests')
      .select('entity_id, task_key')
      .eq('org_id', effectiveOrgId)
      .eq('entity_type', 'vehicle')
      .eq('status', 'pending_admin_review')
      .in('task_key', ['annual_licensing', 'insurance', 'periodic_inspection', 'maintenance']);
    for (const row of pvRows ?? []) {
      const er = row as { entity_id?: string; task_key?: string };
      const eid = String(er.entity_id ?? '').trim();
      const tk = String(er.task_key ?? '').trim();
      if (eid && tk) pendingVehicleAdminKeys.add(`${eid}::${tk}`);
    }
  } catch {
    /* derived alerts only */
  }

  const tryPushVehicle = (
    vid: string,
    plateLabel: string,
    slot: 'test' | 'insurance' | 'inspection' | 'maintenance',
    rawExpiry: string | null,
    alertLabel: string,
  ) => {
    const level = complianceAlertLevelFromExpiry(rawExpiry);
    if (!level) return;
    const cmpTk = slotToComplianceTaskKey[slot];
    if (pendingVehicleAdminKeys.has(`${vid}::${cmpTk}`)) return;
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

  const tryPushMissingVehicle = (
    vid: string,
    plateLabel: string,
    slot: 'test' | 'insurance' | 'inspection' | 'maintenance',
    rawValue: unknown,
    alertLabel: string,
  ) => {
    if (!complianceRawMissing(rawValue)) return;
    const cmpTk = slotToComplianceTaskKey[slot];
    if (pendingVehicleAdminKeys.has(`${vid}::${cmpTk}`)) return;
    const slotKey = `v:${vid}:${slot}`;
    if (occupiedSlots.has(slotKey)) return;
    occupiedSlots.add(slotKey);
    out.push({
      id: `derived:v:${vid}:missing_${slot}`,
      entityId: vid,
      type: 'vehicle',
      name: plateLabel,
      alertType: alertLabel,
      expiryDate: '',
      status: 'expired',
    });
  };

  for (const v of vRows) {
    if (!isFleetRowActiveForAlerts(v)) continue;
    const plate = v.plate_number?.trim() || 'רכב';
    tryPushVehicle(v.id, plate, 'test', v.test_expiry, 'תוקף טסט');
    tryPushVehicle(v.id, plate, 'insurance', v.insurance_expiry, 'תוקף ביטוח');
    tryPushVehicle(v.id, plate, 'inspection', v.next_inspection_date, 'ביקורת תקופתית');
    tryPushVehicle(v.id, plate, 'maintenance', v.next_maintenance_date, 'טיפול');
    tryPushMissingVehicle(v.id, plate, 'test', v.test_expiry, 'חסר תאריך תוקף טסט');
    tryPushMissingVehicle(v.id, plate, 'insurance', v.insurance_expiry, 'חסר תאריך תוקף ביטוח');
    tryPushMissingVehicle(v.id, plate, 'inspection', v.next_inspection_date, 'חסר תאריך ביקורת תקופתית');
    tryPushMissingVehicle(v.id, plate, 'maintenance', v.next_maintenance_date, 'חסר תאריך טיפול');
  }

  const tryPushDriver = (
    d: DRow,
    slot: 'license' | 'health' | 'r585',
    rawExpiry: string | null,
    alertType: string,
  ) => {
    const level = complianceAlertLevelFromExpiry(rawExpiry);
    if (!level) return;
    const slotKey = `d:${d.id}:${slot}`;
    if (occupiedSlots.has(slotKey)) return;
    occupiedSlots.add(slotKey);
    out.push({
      id: `derived:d:${d.id}:${slot}`,
      entityId: d.id,
      type: 'driver',
      name: d.full_name?.trim() || 'נהג',
      alertType,
      expiryDate: complianceExpiryIsoDate(rawExpiry),
      status: level,
    });
  };

  const tryPushMissingDriver = (
    d: DRow,
    slot: string,
    alertType: string,
    rawValue: unknown,
  ) => {
    if (!complianceRawMissing(rawValue)) return;
    const slotKey = `d:${d.id}:${slot}`;
    if (occupiedSlots.has(slotKey)) return;
    occupiedSlots.add(slotKey);
    out.push({
      id: `derived:d:${d.id}:missing_${slot}`,
      entityId: d.id,
      type: 'driver',
      name: d.full_name?.trim() || 'נהג',
      alertType,
      expiryDate: '',
      status: 'expired',
    });
  };

  for (const d of dRows) {
    if (String(d.status ?? '').trim().toLowerCase() === 'pending_approval') continue;
    if (!isFleetRowActiveForAlerts(d)) continue;
    tryPushDriver(d, 'license', d.license_expiry, 'רישיון נהג');
    tryPushDriver(d, 'health', d.health_declaration_date, 'הצהרת בריאות');
    tryPushDriver(d, 'r585', d.regulation_585b_date, 'תקנה 585');
    tryPushMissingDriver(d, 'missing_license', 'חסר תוקף רישיון נהיגה', d.license_expiry);
    tryPushMissingDriver(d, 'missing_health', 'חסר תאריך הצהרת בריאות', d.health_declaration_date);
    tryPushMissingDriver(d, 'missing_r585', 'חסר תאריך תקנה 585', d.regulation_585b_date);
    tryPushMissingDriver(d, 'lic_front', 'חסר צילום רישיון (חזית)', d.license_front_url);
    tryPushMissingDriver(d, 'lic_back', 'חסר צילום רישיון (גב)', d.license_back_url);
    tryPushMissingDriver(d, 'health_doc', 'חסר מסמך הצהרת בריאות', d.health_declaration_url);
    tryPushMissingDriver(d, 'practical_test', 'חסר תאריך בדיקת רישיון', d.practical_driving_test_date);
  }
}

/** Same pipeline as useComplianceAlerts — DB rows + derived fleet-date alerts. */
export async function fetchComplianceAlerts(
  options: FetchComplianceAlertsOptions,
): Promise<ComplianceItem[]> {
  const out: ComplianceItem[] = [];
  const occupiedSlots = new Set<string>();
  const {
    effectiveOrgId,
    isDriverContextOnly = false,
    scopedDriverId = null,
  } = options;
  const orgTrim = (effectiveOrgId ?? '').trim();

  if (isDriverContextOnly && !scopedDriverId) {
    return out;
  }

  const { data: rawRows, error } = await supabase.from('compliance_alerts').select('*');

  if (error && import.meta.env.DEV) {
    console.warn('[complianceAlertsEngine] compliance_alerts select failed — falling back to derived', error.message);
  }

  const list =
    error || !rawRows
      ? []
      : (rawRows as Record<string, unknown>[])
          .map((r) => normalizeComplianceAlertDbRow(r))
          .filter((r): r is NonNullable<typeof r> => r != null);

  if (list.length > 0) {
    const vehicleIds = [...new Set(list.filter((r) => r.entity_type === 'vehicle').map((r) => r.entity_id))];
    const driverIds = [...new Set(list.filter((r) => r.entity_type === 'driver').map((r) => r.entity_id))];

    const vehicleById = new Map<
      string,
      {
        plate_number: string | null;
        org_id: string | null;
        assigned_driver_id: string | null;
      }
    >();
    for (const part of chunkIds(vehicleIds, COMPLIANCE_IN_CHUNK)) {
      const { data: vrows, error: verr } = await supabase
        .from('vehicles')
        .select('id, plate_number, org_id, assigned_driver_id')
        .in('id', part);
      if (verr) {
        console.warn('[complianceAlertsEngine] vehicles chunk failed — skipping chunk', verr.message);
        continue;
      }
      for (const v of vrows ?? []) {
        vehicleById.set(v.id, {
          plate_number: v.plate_number ?? null,
          org_id: v.org_id ?? null,
          assigned_driver_id: v.assigned_driver_id ?? null,
        });
      }
    }

    const driverById = new Map<
      string,
      {
        full_name: string | null;
        org_id: string | null;
        status: string | null;
      }
    >();
    for (const part of chunkIds(driverIds, COMPLIANCE_IN_CHUNK)) {
      const { data: drows, error: derr } = await supabase
        .from('drivers')
        .select('id, full_name, org_id, status')
        .in('id', part);
      if (derr) {
        console.warn('[complianceAlertsEngine] drivers chunk failed — skipping chunk', derr.message);
        continue;
      }
      for (const d of drows ?? []) {
        driverById.set(d.id, {
          full_name: d.full_name ?? null,
          org_id: d.org_id ?? null,
          status: (d as { status?: string | null }).status ?? null,
        });
      }
    }

    for (const r of list) {
      if (r.entity_type === 'vehicle') {
        const v = vehicleById.get(r.entity_id);
        if (!v) continue;

        if (isDriverContextOnly) {
          if (!scopedDriverId) continue;
          if (v.assigned_driver_id !== scopedDriverId) continue;
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
        if (String(d.status ?? '').trim().toLowerCase() === 'pending_approval') continue;

        if (isDriverContextOnly) {
          if (!scopedDriverId) continue;
          if (r.entity_id !== scopedDriverId) continue;
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
    effectiveOrgId: orgTrim || effectiveOrgId,
    isDriverContextOnly,
    scopedDriverId,
  });

  return out;
}

/** Dashboard card «התראות חריגה» — expired only (not 30-day warning). */
export function countDashboardExceptionAlerts(alerts: ComplianceItem[]): number {
  return alerts.filter((a) => a.status === 'expired').length;
}

export function formatComplianceAlertForBot(item: ComplianceItem): string {
  const icon = item.type === 'vehicle' ? '🚗' : '👤';
  const entity = item.type === 'vehicle' ? 'רכב' : 'נהג';
  const dateSuffix = item.expiryDate
    ? ` — ${new Date(item.expiryDate).toLocaleDateString('he-IL')}`
    : '';
  return `${icon} **${item.alertType}** · ${entity} **${item.name}**${dateSuffix}`;
}
