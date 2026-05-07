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
    if (a.driver_id !== driverId) continue;
    const full = allVehicles.find((x) => x.id === a.vehicle_id);
    /* אם הרכב שמוקנן בשאילתה חסר (לפעמים בגלל RLS), עדיין שולפים מהרשימה המלאה */
    if (full?.assigned_driver_id && full.assigned_driver_id !== driverId) continue;

    let tile: AssignedVehicleTile | null = null;
    if (full) {
      tile = {
        id: full.id,
        manufacturer: full.manufacturer,
        model: full.model,
        plate_number: full.plate_number,
      };
    } else if (a.vehicle) {
      tile = {
        id: a.vehicle.id,
        manufacturer: a.vehicle.manufacturer,
        model: a.vehicle.model,
        plate_number: a.vehicle.plate_number,
      };
    }

    if (!tile) continue;
    if (byId.has(tile.id)) continue;
    byId.set(tile.id, tile);
  }
  return [...byId.values()];
}
