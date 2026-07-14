import { supabase } from '@/integrations/supabase/client';
import { normalizePlateNumber } from '@/lib/plateNumber';

export type ResolvedProcedure6Driver = {
  org_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  plate_number: string | null;
};

/** Resolve driver for plate at incident time via RPC (org-scoped when orgId set). */
export async function resolveProcedure6DriverForPlate(
  plate: string,
  asOfIso: string | null | undefined,
  orgId?: string | null,
): Promise<ResolvedProcedure6Driver> {
  const digits = normalizePlateNumber(plate);
  if (digits.length < 5) {
    return { org_id: null, vehicle_id: null, driver_id: null, driver_name: null, plate_number: null };
  }
  const { data, error } = await supabase.rpc('resolve_procedure6_driver_for_plate', {
    p_plate: digits,
    p_as_of: asOfIso || new Date().toISOString(),
    p_org_id: orgId ?? null,
  });
  if (error) {
    console.warn('[resolveProcedure6DriverForPlate]', error.message);
    return { org_id: null, vehicle_id: null, driver_id: null, driver_name: null, plate_number: null };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { org_id: null, vehicle_id: null, driver_id: null, driver_name: null, plate_number: null };
  }
  const r = row as Record<string, unknown>;
  return {
    org_id: typeof r.org_id === 'string' ? r.org_id : null,
    vehicle_id: typeof r.vehicle_id === 'string' ? r.vehicle_id : null,
    driver_id: typeof r.driver_id === 'string' ? r.driver_id : null,
    driver_name: typeof r.driver_name === 'string' ? r.driver_name : null,
    plate_number: typeof r.plate_number === 'string' ? r.plate_number : null,
  };
}
