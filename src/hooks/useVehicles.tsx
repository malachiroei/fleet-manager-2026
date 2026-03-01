import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Vehicle } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('plate_number');

      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as Vehicle | null;
    },
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newVehicle: Partial<Vehicle>) => {
      const { data, error } = await supabase
        .from('vehicles')
        .insert(newVehicle as any)
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
