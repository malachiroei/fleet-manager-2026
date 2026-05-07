import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Vehicle } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import { normalizePlateNumber } from '@/lib/plateNumber';
import { isMissingSafetyOfficerColumnError } from '@/lib/supabaseError';

function vehicleWithNormalizedPlate<T extends { plate_number: string }>(v: T): T {
  const p = normalizePlateNumber(v.plate_number);
  return p ? { ...v, plate_number: p } : v;
}

export interface ActiveDriverVehicleAssignment {
  id: string;
  driver_id: string;
  vehicle_id: string;
  assigned_at: string;
  assigned_by: string | null;
  vehicle: Pick<Vehicle, 'id' | 'manufacturer' | 'model' | 'plate_number'> | null;
}

export async function fetchActiveDriverAssignments(driverId: string, excludeVehicleId?: string) {
  let query = supabase
    .from('driver_vehicle_assignments')
    .select('id, driver_id, vehicle_id, assigned_at, assigned_by, vehicle:vehicles(id, manufacturer, model, plate_number)')
    .eq('driver_id', driverId)
    .is('unassigned_at', null)
    .order('assigned_at', { ascending: false });

  if (excludeVehicleId) {
    query = query.neq('vehicle_id', excludeVehicleId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as ActiveDriverVehicleAssignment[]).map((row) => ({
    ...row,
    vehicle: row.vehicle
      ? vehicleWithNormalizedPlate(row.vehicle as Pick<Vehicle, 'id' | 'manufacturer' | 'model' | 'plate_number'>)
      : null,
  }));
}

export function useActiveDriverVehicleAssignments() {
  const { user, profile } = useAuth();
  const {
    effectiveOrgId,
    isDriverContextOnly,
    scopedDriverId,
    fleetListReady,
  } = useImpersonationFleetScope();

  return useQuery({
    queryKey: [
      'active-driver-vehicle-assignments',
      effectiveOrgId,
      isDriverContextOnly,
      scopedDriverId,
      resolveSessionEmail(profile, user),
      user?.id,
    ],
    enabled: fleetListReady && effectiveOrgId != null,
    queryFn: async () => {
      const orgId = effectiveOrgId;
      if (orgId == null) return [] as ActiveDriverVehicleAssignment[];
      let vehiclesQuery = supabase.from('vehicles').select('id').eq('org_id', orgId);
      if (isDriverContextOnly && scopedDriverId) {
        vehiclesQuery = vehiclesQuery.eq('assigned_driver_id', scopedDriverId);
      }
      const { data: vehicleIds, error: vehiclesError } = await vehiclesQuery;
      if (vehiclesError) throw vehiclesError;
      const ids = (vehicleIds ?? []).map((r) => r.id);
      if (ids.length === 0) return [] as ActiveDriverVehicleAssignment[];
      let assignQuery = supabase
        .from('driver_vehicle_assignments')
        .select('id, driver_id, vehicle_id, assigned_at, assigned_by, vehicle:vehicles(id, manufacturer, model, plate_number)')
        .is('unassigned_at', null)
        .not('driver_id', 'is', null)
        .in('vehicle_id', ids)
        .order('assigned_at', { ascending: false });
      if (isDriverContextOnly && scopedDriverId) {
        assignQuery = assignQuery.eq('driver_id', scopedDriverId);
      }
      const { data, error } = await assignQuery;
      if (error) throw error;
      return ((data ?? []) as unknown as ActiveDriverVehicleAssignment[]).map((row) => ({
        ...row,
        vehicle: row.vehicle
          ? vehicleWithNormalizedPlate(row.vehicle as Pick<Vehicle, 'id' | 'manufacturer' | 'model' | 'plate_number'>)
          : null,
      }));
    },
  });
}

export function useVehicles() {
  const { user, profile } = useAuth();
  const {
    effectiveOrgId,
    fleetListReady,
    isDriverContextOnly,
    scopedDriverId,
  } = useImpersonationFleetScope();

  return useQuery({
    queryKey: [
      'vehicles',
      effectiveOrgId,
      isDriverContextOnly,
      scopedDriverId,
      resolveSessionEmail(profile, user),
      user?.id,
    ],
    enabled: fleetListReady && effectiveOrgId != null,
    queryFn: async () => {
      if (effectiveOrgId == null) return [] as Vehicle[];
      let q = supabase.from('vehicles').select('*').eq('org_id', effectiveOrgId).order('plate_number');
      if (isDriverContextOnly && scopedDriverId) {
        q = q.eq('assigned_driver_id', scopedDriverId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Vehicle[]).map((v) => vehicleWithNormalizedPlate(v));
    },
  });
}

/** מקור הנתון לכותרת רכב־נהג: עמודת שיוך ברכב, או היסטוריית מסירה קבועה אם בעמודה חסר. */
export type DriverAssociatedVehiclesSource = 'vehicle_column' | 'permanent_handover_history';

export type DriverAssociatedVehiclesPayload = {
  vehicles: Vehicle[];
  source: DriverAssociatedVehiclesSource;
};

async function fetchVehiclesByPermanentDeliveries(driverId: string): Promise<Vehicle[]> {
  const { data: hops, error: hopsErr } = await supabase
    .from('vehicle_handovers')
    .select('vehicle_id, handover_type, assignment_mode, handover_date')
    .eq('driver_id', driverId)
    .order('handover_date', { ascending: false })
    .limit(80);
  if (hopsErr) throw hopsErr;

  type Hop = {
    vehicle_id?: string | null;
    handover_type?: string | null;
    assignment_mode?: string | null;
    handover_date?: string | null;
  };

  const latestByVehicle = new Map<string, { type: string; mode: string; at: string }>();
  for (const row of (hops as Hop[]) ?? []) {
    const vid = typeof row?.vehicle_id === 'string' ? row.vehicle_id.trim() : '';
    if (!vid || latestByVehicle.has(vid)) continue;
    latestByVehicle.set(vid, {
      type: String(row?.handover_type ?? '').trim().toLowerCase(),
      mode: String(row?.assignment_mode ?? 'permanent').trim().toLowerCase(),
      at: String(row?.handover_date ?? ''),
    });
  }

  const active: { vid: string; at: string }[] = [];
  for (const [vid, m] of latestByVehicle) {
    if (m.type === 'return') continue;
    if (m.type === 'delivery' && m.mode === 'permanent') {
      active.push({ vid, at: m.at });
    }
  }
  active.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
  const idsOrdered = active.map((x) => x.vid).slice(0, 5);

  if (idsOrdered.length === 0) return [];

  const { data: rows, error: vErr } = await supabase
    .from('vehicles')
    .select('*')
    .in('id', idsOrdered);
  if (vErr) throw vErr;

  const byId = new Map(((rows ?? []) as Vehicle[]).map((v) => [v.id, vehicleWithNormalizedPlate(v)]));
  return idsOrdered.map((vid) => byId.get(vid)).filter(Boolean) as Vehicle[];
}

/**
 * רכבים המשויכים לנהג: קודם `assigned_driver_id` (כולל ארגון שמתעדכן ב-RLS),
 * ובהעדר — רכבים ממסירות קבועות אחרונות (מתאים כששרת לא עדכן עמודה).
 */
export function useVehiclesAssignedToDriver(driverId: string | undefined) {
  const { user, profile } = useAuth();
  const { fleetListReady } = useImpersonationFleetScope();

  return useQuery({
    queryKey: [
      'vehicles-assigned-to-driver',
      driverId ?? null,
      resolveSessionEmail(profile, user),
      user?.id,
    ],
    enabled: fleetListReady && Boolean(driverId),
    queryFn: async (): Promise<DriverAssociatedVehiclesPayload> => {
      if (driverId == null || driverId === '') {
        return { vehicles: [], source: 'vehicle_column' };
      }

      const { data: directRows, error: directErr } = await supabase
        .from('vehicles')
        .select('*')
        .eq('assigned_driver_id', driverId)
        .order('plate_number');
      if (directErr) throw directErr;
      const fromColumn = ((directRows ?? []) as Vehicle[]).map((v) => vehicleWithNormalizedPlate(v));
      if (fromColumn.length > 0) {
        return { vehicles: fromColumn, source: 'vehicle_column' };
      }

      const fromHistory = await fetchVehiclesByPermanentDeliveries(driverId);
      return {
        vehicles: fromHistory,
        source: fromHistory.length > 0 ? 'permanent_handover_history' : 'vehicle_column',
      };
    },
  });
}

export function useVehicle(id: string) {
  const { user, profile } = useAuth();
  const { effectiveOrgId, fleetListReady } = useImpersonationFleetScope();

  return useQuery({
    queryKey: ['vehicle', id, effectiveOrgId ?? null, resolveSessionEmail(profile, user), user?.id],
    queryFn: async () => {
      const query = supabase.from('vehicles').select('*').eq('id', id);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data ? vehicleWithNormalizedPlate(data as Vehicle) : null;
    },
    enabled: Boolean(id && fleetListReady && effectiveOrgId != null),
  });
}

async function insertVehicleWithCompat(row: Record<string, unknown>) {
  const first = await supabase.from('vehicles').insert(row as any).select().single();
  if (!first.error) return first;
  if (
    !isMissingSafetyOfficerColumnError(first.error) ||
    !Object.prototype.hasOwnProperty.call(row, 'safety_officer')
  ) {
    return first;
  }
  const fallbackRow = { ...row };
  delete (fallbackRow as Record<string, unknown>).safety_officer;
  console.warn('[useCreateVehicle] safety_officer column missing on vehicles; retrying without it');
  return supabase.from('vehicles').insert(fallbackRow as any).select().single();
}

async function updateVehicleWithCompat(id: string, payload: Partial<Vehicle>) {
  const first = await supabase.from('vehicles').update(payload).eq('id', id).select();
  if (!first.error) return first;
  if (
    !isMissingSafetyOfficerColumnError(first.error) ||
    !Object.prototype.hasOwnProperty.call(payload, 'safety_officer')
  ) {
    return first;
  }
  const fallbackPayload = { ...payload } as Record<string, unknown>;
  delete fallbackPayload.safety_officer;
  console.warn('[useUpdateVehicle] safety_officer column missing; retrying without it');
  return supabase.from('vehicles').update(fallbackPayload as Partial<Vehicle>).eq('id', id).select();
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  const { activeOrgId, profile, memberOrganizations } = useAuth();

  return useMutation({
    mutationFn: async (newVehicle: Partial<Vehicle>) => {
      const row = { ...newVehicle } as Record<string, unknown>;
      if (typeof row.plate_number === 'string') {
        row.plate_number = normalizePlateNumber(row.plate_number);
      }
      const effectiveOrgId = activeOrgId ?? profile?.org_id ?? memberOrganizations[0]?.id ?? null;
      if (effectiveOrgId != null && row.org_id == null) {
        row.org_id = effectiveOrgId;
      }
      const { data, error } = await insertVehicleWithCompat(row);

      if (error) throw error;
      return vehicleWithNormalizedPlate(data as Vehicle);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast({ title: 'הרכב נוסף בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בהוספת הרכב', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Vehicle> & { id: string }) => {
      const payload = { ...updates } as Partial<Vehicle>;
      if (typeof payload.plate_number === 'string') {
        payload.plate_number = normalizePlateNumber(payload.plate_number);
      }
      const { data, error } = await updateVehicleWithCompat(id, payload);

      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const row = rows[0] ?? null;
      if (!row) {
        throw new Error(
          'אין הרשאת עדכון לרכב זה או הרכב לא נמצא (בדוק הרשאות במסד)',
        );
      }
      return vehicleWithNormalizedPlate(row as Vehicle);
    },
    onSuccess: (data) => {
      // עדכון מיידי של מסך הסקירה בלי להמתין ל-refetch
      queryClient.setQueryData(['vehicle', data.id], vehicleWithNormalizedPlate(data as Vehicle));
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles-assigned-to-driver'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', data.id] });
      toast({ title: 'הרכב עודכן בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בעדכון הרכב', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast({ title: 'הרכב נמחק בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה במחיקת הרכב', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateOdometer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, odometer }: { id: string; odometer: number }) => {
      const { data, error } = await supabase
        .from('vehicles')
        .update({ current_odometer: odometer })
        .eq('id', id)
        .select();

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        throw new Error('אין הרשאת עדכון מונה או הרכב לא נמצא');
      }
      return row;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', data.id] });
      toast({ title: "קילומטראז' עודכן בהצלחה" });
    },
    onError: (error) => {
      toast({ title: "שגיאה בעדכון קילומטראז'", description: error.message, variant: 'destructive' });
    },
  });
}

export function useAssignDriverToVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vehicleId,
      driverId,
      assignedBy,
    }: {
      vehicleId: string;
      driverId: string | null;
      assignedBy?: string | null;
    }) => {
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id, assigned_driver_id')
        .eq('id', vehicleId)
        .maybeSingle();

      if (vehicleError) throw vehicleError;
      if (!vehicle) throw new Error('הרכב לא נמצא');

      if (driverId) {
        const { data: driverVehicles, error: driverVehiclesError } = await supabase
          .from('vehicles')
          .select('id')
          .eq('assigned_driver_id', driverId)
          .neq('id', vehicleId);

        if (driverVehiclesError) throw driverVehiclesError;

        const previousVehicleIds = (driverVehicles ?? []).map((row) => row.id);

        if (previousVehicleIds.length > 0) {
          const { error: clearDriverVehiclesError } = await supabase
            .from('vehicles')
            .update({ assigned_driver_id: null })
            .eq('assigned_driver_id', driverId)
            .neq('id', vehicleId);

          if (clearDriverVehiclesError) throw clearDriverVehiclesError;

          const { error: closePreviousDriverAssignmentsError } = await supabase
            .from('driver_vehicle_assignments')
            .update({ unassigned_at: new Date().toISOString() })
            .eq('driver_id', driverId)
            .is('unassigned_at', null)
            .in('vehicle_id', previousVehicleIds);

          if (closePreviousDriverAssignmentsError) throw closePreviousDriverAssignmentsError;
        }
      }

      const { error: closeCurrentVehicleAssignmentError } = await supabase
        .from('driver_vehicle_assignments')
        .update({ unassigned_at: new Date().toISOString() })
        .eq('vehicle_id', vehicleId)
        .is('unassigned_at', null);

      if (closeCurrentVehicleAssignmentError) throw closeCurrentVehicleAssignmentError;

      const { error: updateVehicleError } = await supabase
        .from('vehicles')
        .update({ assigned_driver_id: driverId })
        .eq('id', vehicleId);

      if (updateVehicleError) throw updateVehicleError;

      if (driverId) {
        const { error: insertAssignmentError } = await supabase
          .from('driver_vehicle_assignments')
          .insert({
            vehicle_id: vehicleId,
            driver_id: driverId,
            assigned_by: assignedBy ?? null,
          });

        if (insertAssignmentError) throw insertAssignmentError;
      }

      return { vehicleId, driverId };
    },
    onSuccess: ({ driverId }) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles-assigned-to-driver'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['active-driver-vehicle-assignments'] });
      toast({
        title: driverId ? 'שיוך הנהג נשמר בהצלחה' : 'שיוך הנהג הוסר בהצלחה',
      });
    },
    onError: (error) => {
      toast({
        title: 'שגיאה בעדכון שיוך נהג לרכב',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
