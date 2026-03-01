import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Driver, DriverSummary } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('full_name');

      if (error) {
        const fallback = await supabase
          .from('drivers')
          .select('id, full_name, id_number, license_expiry, phone, email')
          .order('full_name');

        if (fallback.error) {
          throw new Error(
            [
              fallback.error.message,
              fallback.error.code ? `code=${fallback.error.code}` : null,
              fallback.error.details ? `details=${fallback.error.details}` : null,
              fallback.error.hint ? `hint=${fallback.error.hint}` : null,
            ]
              .filter(Boolean)
              .join(' | ')
          );
        }

        return (fallback.data ?? []).map((row) => ({
          ...(row as Omit<DriverSummary, 'status'>),
          status: 'valid' as const,
        }));
      }

      return (data ?? []).map((row) => {
        const driver = row as Partial<DriverSummary>;
        return {
          id: driver.id ?? '',
          full_name: driver.full_name ?? '',
          id_number: driver.id_number ?? '',
          phone: driver.phone ?? null,
          email: driver.email ?? null,
          license_expiry: driver.license_expiry ?? '',
          status: driver.status ?? 'valid',
        } satisfies DriverSummary;
      });
    }
  });
}

export function useDriver(id: string) {
  return useQuery({
    queryKey: ['driver', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as Driver | null;
    },
    enabled: !!id
  });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (driver: Partial<Omit<Driver, 'id' | 'created_at' | 'updated_at' | 'status'>> & {
      full_name: string;
      id_number: string;
      license_expiry: string;
    }) => {
      const { data, error } = await supabase
        .from('drivers')
        .insert(driver)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast({ title: 'הנהג נוסף בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בהוספת הנהג', description: error.message, variant: 'destructive' });
    }
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Driver> & { id: string }) => {
      const { data, error } = await supabase
        .from('drivers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driver', data.id] });
      toast({ title: 'הנהג עודכן בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בעדכון הנהג', description: error.message, variant: 'destructive' });
    }
  });
}

export function useDeleteDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('drivers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast({ title: 'הנהג נמחק בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה במחיקת הנהג', description: error.message, variant: 'destructive' });
    }
  });
}
