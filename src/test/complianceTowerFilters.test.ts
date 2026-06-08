import { describe, expect, it } from 'vitest';
import {
  complianceRowHasMissingDue,
  complianceRowPassesViewFilter,
  driverSummaryToComplianceRow,
} from '@/lib/complianceTowerFilters';
import type { DriverSummary } from '@/types/fleet';

function sampleDriver(overrides: Partial<DriverSummary> = {}): DriverSummary {
  return {
    id: 'd1',
    full_name: 'חיים חימי',
    id_number: '123454858',
    phone: '0506655456',
    email: 'test@example.com',
    license_expiry: '2026-06-08',
    status: 'valid',
    is_field_person: false,
    is_active: true,
    address: null,
    city: null,
    birth_date: null,
    note1: null,
    note2: null,
    rating: null,
    job_title: null,
    department: null,
    employee_number: null,
    driver_code: null,
    division: null,
    area: null,
    group_name: null,
    group_code: null,
    safety_officer: null,
    eligibility: null,
    work_start_date: null,
    license_number: null,
    health_declaration_date: null,
    safety_training_date: null,
    regulation_585b_date: null,
    practical_driving_test_date: null,
    driving_permit: null,
    ...overrides,
  };
}

describe('complianceTowerFilters', () => {
  it('marks regulation 585 as missing when date is empty', () => {
    const row = driverSummaryToComplianceRow(sampleDriver());
    expect(
      complianceRowHasMissingDue('regulation_585', 'regulation_585b_date', row),
    ).toBe(true);
  });

  it('shows active drivers on "all" even when regulation 585 date is missing', () => {
    const row = driverSummaryToComplianceRow(sampleDriver());
    const tab = { key: 'regulation_585' as const, dueField: 'regulation_585b_date', source: 'driver' as const };
    expect(
      complianceRowPassesViewFilter(tab, row, 'all', '2020-01-01', '2030-01-01'),
    ).toBe(true);
  });

  it('shows missing regulation 585 on urgent filter', () => {
    const row = driverSummaryToComplianceRow(sampleDriver());
    const tab = { key: 'regulation_585' as const, dueField: 'regulation_585b_date', source: 'driver' as const };
    expect(
      complianceRowPassesViewFilter(tab, row, 'urgent', '2020-01-01', '2030-01-01'),
    ).toBe(true);
  });

  it('flags driver license tab when scans are missing', () => {
    const row = driverSummaryToComplianceRow(sampleDriver());
    expect(
      complianceRowHasMissingDue('driver_license', 'license_expiry', row),
    ).toBe(true);
  });
});
