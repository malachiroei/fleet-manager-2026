import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MaintenanceLog } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';

export function useMaintenanceLogs(vehicleId?: string) {
  return useQuery({
    queryKey: ['maintenance-logs', vehicleId],
    queryFn: async () => {
      let query = supabase
        .from('maintenance_logs')
        .select('*, vehicle:vehicles(plate_number, manufacturer, model)')
        .order('service_date', { ascending: false });

      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MaintenanceLog[];
    }
  });
}

export function useCreateMaintenanceLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (log: Omit<MaintenanceLog, 'id' | 'created_at' | 'vehicle'>) => {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .insert(log)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', data.vehicle_id] });
      toast({ title: 'רישום טיפול נוסף בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בהוספת רישום טיפול', description: error.message, variant: 'destructive' });
    }
  });
}

export function useDeleteMaintenanceLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      toast({ title: 'רישום הטיפול נמחק' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה במחיקת הרישום', description: error.message, variant: 'destructive' });
    }
  });
}
