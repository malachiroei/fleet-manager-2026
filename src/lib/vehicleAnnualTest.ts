import type { Vehicle } from '@/types/fleet';

export type DocExpiryUrgency = 'ok' | 'warn' | 'expired';

export function daysUntilCalendarDate(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const expiry = new Date(raw);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function urgencyForDocDate(raw: string | null | undefined): DocExpiryUrgency {
  const days = daysUntilCalendarDate(raw);
  if (days === null) return 'ok';
  if (days < 0) return 'expired';
  if (days < 30) return 'warn';
  return 'ok';
}

function firstAnnualTestRequiredDate(v: Pick<Vehicle, 'road_ascent_year' | 'road_ascent_month'>): Date | null {
  const y = v.road_ascent_year;
  if (y == null || Number.isNaN(Number(y))) return null;
  const m = v.road_ascent_month != null && v.road_ascent_month >= 1 && v.road_ascent_month <= 12
    ? v.road_ascent_month
    : 1;
  // First physical annual test is required starting one year after road ascent month/year.
  return new Date(y + 1, m - 1, 1);
}

export function isVehicleExemptFromAnnualTestNow(
  v: Pick<Vehicle, 'road_ascent_year' | 'road_ascent_month'>,
  now: Date = new Date(),
): boolean {
  const requiredFrom = firstAnnualTestRequiredDate(v);
  if (!requiredFrom) return false;
  return now.getTime() < requiredFrom.getTime();
}

export function urgencyForVehicleTest(v: Pick<Vehicle, 'test_expiry' | 'road_ascent_year' | 'road_ascent_month'>): DocExpiryUrgency {
  // Even in first year we still track annual-license payment document expiry.
  // The exemption only affects physical test requirement messaging.
  return urgencyForDocDate(v.test_expiry);
}
