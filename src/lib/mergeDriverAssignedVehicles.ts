import type { Vehicle } from '@/types/fleet';
import type { ActiveDriverVehicleAssignment } from '@/hooks/useVehicles';

export type AssignedVehicleTile = Pick<Vehicle, 'id' | 'manufacturer' | 'model' | 'plate_number'>;

/** מיזוג שיוך מ־driver_vehicle_assignments ומ־vehicles.assigned_driver_id */
export function mergeAssignedVehiclesForDriver(
  driverId: string,
  assignments: ActiveDriverVehicleAssignment[],
  allVehicles: Vehicle[],
): AssignedVehicleTile[] {
  const byId = new Map<string, AssignedVehicleTile>();
  for (const v of allVehicles) {
    if (v.assigned_driver_id !== driverId) continue;
    byId.set(v.id, {
      id: v.id,
      manufacturer: v.manufacturer,
      model: v.model,
      plate_number: v.plate_number,
    });
  }
  for (const a of assignments) {
    if (a.driver_id !== driverId || !a.vehicle) continue;
    const full = allVehicles.find((x) => x.id === a.vehicle.id);
    if (full?.assigned_driver_id && full.assigned_driver_id !== driverId) continue;
    if (byId.has(a.vehicle.id)) continue;
    const v = a.vehicle;
    byId.set(v.id, {
      id: v.id,
      manufacturer: v.manufacturer,
      model: v.model,
      plate_number: v.plate_number,
    });
  }
  return [...byId.values()];
}
