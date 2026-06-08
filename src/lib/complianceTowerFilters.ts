import type { DriverSummary } from '@/types/fleet';

export const COMPLIANCE_TOWER_LOGIC_VERSION = '2026-06-08-missing-fields-v1';

export type ComplianceTabKey =
  | 'annual_licensing'
  | 'insurance'
  | 'periodic_inspection'
  | 'maintenance'
  | 'driver_license'
  | 'health_declaration'
  | 'regulation_585';

export type TowerViewFilter = 'all' | 'custom_range' | 'expiring_soon' | 'urgent';
export type ComplianceSource = 'vehicle' | 'driver';

export const COMPLIANCE_RED_MAX_DAYS_REMAINING = 5;
export const COMPLIANCE_YELLOW_MAX_DAYS_REMAINING = 30;

function toStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : toStartOfDay(d);
}

export function daysUntil(raw: unknown): number | null {
  const target = parseIsoDate(raw);
  if (!target) return null;
  const now = toStartOfDay(new Date());
  const targetDay = toStartOfDay(target);
  return Math.round((targetDay.getTime() - now.getTime()) / 86_400_000);
}

export function dueIsoFromRaw(raw: unknown): string | null {
  const d = parseIsoDate(raw);
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function complianceDueBand(dueDays: number | null): 'red' | 'yellow' | 'green' | null {
  if (dueDays == null) return null;
  if (dueDays < 0 || dueDays <= COMPLIANCE_RED_MAX_DAYS_REMAINING) return 'red';
  if (dueDays <= COMPLIANCE_YELLOW_MAX_DAYS_REMAINING) return 'yellow';
  return 'green';
}

export function complianceDueRawForRow(
  tabKey: ComplianceTabKey,
  dueField: string,
  row: Record<string, unknown>,
): unknown {
  if (tabKey === 'driver_license') {
    const st = String(row.status ?? '').trim().toLowerCase();
    const p = String((row as { pending_license_expiry?: string | null }).pending_license_expiry ?? '').trim();
    if (st === 'pending_approval' && p) return p;
  }
  return row[dueField];
}

export function complianceRawMissing(raw: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim();
  return s === '' || s === '—' || s.toLowerCase() === 'null';
}

export function isFleetRowActive(row: Record<string, unknown>): boolean {
  const v = row.is_active;
  if (v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false') return false;
  return true;
}

export function driverSummaryToComplianceRow(d: DriverSummary): Record<string, unknown> {
  return {
    id: d.id,
    org_id: d.org_id ?? null,
    full_name: d.full_name,
    id_number: d.id_number,
    email: d.email,
    phone: d.phone,
    status: d.status,
    is_active: d.is_active,
    license_expiry: d.license_expiry?.trim() ? d.license_expiry : null,
    pending_license_expiry: d.pending_license_expiry ?? null,
    health_declaration_date: d.health_declaration_date,
    regulation_585b_date: d.regulation_585b_date,
    practical_driving_test_date: d.practical_driving_test_date,
    license_front_url: d.license_front_url ?? null,
    license_back_url: d.license_back_url ?? null,
    health_declaration_url: d.health_declaration_url ?? null,
  };
}

export function isComplianceRowInTabScope(tabSource: ComplianceSource, row: Record<string, unknown>): boolean {
  if (!isFleetRowActive(row)) return false;
  if (tabSource === 'driver') {
    const st = String(row.status ?? '').trim().toLowerCase();
    if (st === 'pending_approval') return false;
  }
  return true;
}

export function complianceRowHasMissingDue(
  tabKey: ComplianceTabKey,
  dueField: string,
  row: Record<string, unknown>,
): boolean {
  const dueRaw = complianceDueRawForRow(tabKey, dueField, row);
  if (complianceRawMissing(dueRaw)) return true;
  if (tabKey === 'health_declaration') {
    return complianceRawMissing(row.health_declaration_url);
  }
  if (tabKey === 'driver_license') {
    return (
      complianceRawMissing(row.license_front_url)
      || complianceRawMissing(row.license_back_url)
      || complianceRawMissing(row.practical_driving_test_date)
    );
  }
  return false;
}

export function complianceRowPassesViewFilter(
  tab: { key: ComplianceTabKey; dueField: string; source: ComplianceSource },
  row: Record<string, unknown>,
  viewFilter: TowerViewFilter,
  customMinIso: string,
  customMaxIso: string,
): boolean {
  if (!isComplianceRowInTabScope(tab.source, row)) return false;

  const isMissing = complianceRowHasMissingDue(tab.key, tab.dueField, row);
  const dueRaw = complianceDueRawForRow(tab.key, tab.dueField, row);
  const dueIso = dueIsoFromRaw(dueRaw);
  const d = daysUntil(dueRaw);

  if (viewFilter === 'all') return true;

  if (viewFilter === 'urgent') {
    if (isMissing) return true;
    return d != null && complianceDueBand(d) === 'red';
  }
  if (viewFilter === 'expiring_soon') {
    if (isMissing) return false;
    return d != null && complianceDueBand(d) === 'yellow';
  }
  if (isMissing) return false;
  return dueIso != null && dueIso >= customMinIso && dueIso <= customMaxIso;
}
