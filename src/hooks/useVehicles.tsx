import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Vehicle } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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

  return (data ?? []) as unknown as ActiveDriverVehicleAssignment[];
}

export function useActiveDriverVehicleAssignments() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? null;

  return useQuery({
    queryKey: ['active-driver-vehicle-assignments', orgId],
    enabled: orgId != null,
    queryFn: async () => {
      if (orgId == null) return [] as ActiveDriverVehicleAssignment[];
      const { data: vehicleIds, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id')
        .eq('org_id', orgId);
      if (vehiclesError) throw vehiclesError;
      const ids = (vehicleIds ?? []).map((r) => r.id);
      if (ids.length === 0) return [] as ActiveDriverVehicleAssignment[];
      const { data, error } = await supabase
        .from('driver_vehicle_assignments')
        .select('id, driver_id, vehicle_id, assigned_at, assigned_by, vehicle:vehicles(id, manufacturer, model, plate_number)')
        .is('unassigned_at', null)
        .not('driver_id', 'is', null)
        .in('vehicle_id', ids)
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActiveDriverVehicleAssignment[];
    },
  });
}

export function useVehicles() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? null;

  return useQuery({
    queryKey: ['vehicles', orgId],
    enabled: orgId != null,
    queryFn: async () => {
      if (orgId == null) return [] as Vehicle[];
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('org_id', orgId)
        .order('plate_number');
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });
}

export function useVehicle(id: string) {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? undefined;

  return useQuery({
    queryKey: ['vehicle', id, orgId],
    queryFn: async () => {
      let query = supabase
        .from('vehicles')
        .select('*')
        .eq('id', id);
      if (orgId != null) {
        query = query.or(`org_id.eq.${orgId},org_id.is.null`);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as Vehicle | null;
    },
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  const { activeOrgId, profile } = useAuth();

  return useMutation({
    mutationFn: async (newVehicle: Partial<Vehicle>) => {
      const row = { ...newVehicle } as Record<string, unknown>;
      const effectiveOrgId = activeOrgId ?? profile?.org_id;
      if (effectiveOrgId != null && row.org_id == null) {
        row.org_id = effectiveOrgId;
      }
      const { data, error } = await supabase
        .from('vehicles')
        .insert(row as any)
        .select()
        .single();

      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from('vehicles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // עדכון מיידי של מסך הסקירה בלי להמתין ל-refetch
      queryClient.setQueryData(['vehicle', data.id], data as Vehicle);
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
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
        .select()
        .single();

      if (error) throw error;
      return data;
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
