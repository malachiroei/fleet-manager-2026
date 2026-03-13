import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Driver, DriverSummary } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { formatSupabaseError } from '@/lib/supabaseError';

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

        return (fallback.data ?? []).map((row) => {
          const d = row as Record<string, unknown>;
          return {
            id: String(d.id ?? ''),
            full_name: String(d.full_name ?? ''),
            id_number: String(d.id_number ?? ''),
            phone: (d.phone as string) ?? null,
            email: (d.email as string) ?? null,
            license_expiry: String(d.license_expiry ?? ''),
            status: (d.status as DriverSummary['status']) ?? 'valid',
            address: (d.address as string) ?? null,
            job_title: (d.job_title as string) ?? null,
            department: (d.department as string) ?? null,
            license_number: (d.license_number as string) ?? null,
            health_declaration_date: (d.health_declaration_date as string) ?? null,
            safety_training_date: (d.safety_training_date as string) ?? null,
            regulation_585b_date: (d.regulation_585b_date as string) ?? null,
            license_front_url: (d.license_front_url as string) ?? null,
            license_back_url: (d.license_back_url as string) ?? null,
            health_declaration_url: (d.health_declaration_url as string) ?? null,
          } satisfies DriverSummary;
        });
      }

      return (data ?? []).map((row) => {
        const d = row as Record<string, unknown>;
        return {
          id: String(d.id ?? ''),
          full_name: String(d.full_name ?? ''),
          id_number: String(d.id_number ?? ''),
          phone: (d.phone as string) ?? null,
          email: (d.email as string) ?? null,
          license_expiry: String(d.license_expiry ?? ''),
          status: (d.status as DriverSummary['status']) ?? 'valid',
          address: (d.address as string) ?? null,
          job_title: (d.job_title as string) ?? null,
          department: (d.department as string) ?? null,
          license_number: (d.license_number as string) ?? null,
          health_declaration_date: (d.health_declaration_date as string) ?? null,
          safety_training_date: (d.safety_training_date as string) ?? null,
          regulation_585b_date: (d.regulation_585b_date as string) ?? null,
          license_front_url: (d.license_front_url as string) ?? null,
          license_back_url: (d.license_back_url as string) ?? null,
          health_declaration_url: (d.health_declaration_url as string) ?? null,
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

/** Empty string → null for optional DB columns (avoids invalid date / coercion issues) */
function normalizeDriverUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const out = { ...updates };
  const nullableKeys = [
    'phone',
    'email',
    'address',
    'job_title',
    'department',
    'license_number',
    'health_declaration_date',
    'safety_training_date',
    'regulation_585b_date',
    'birth_date',
    'city',
    'note1',
    'note2',
    'rating',
    'employee_number',
    'driver_code',
    'division',
    'area',
    'group_name',
    'group_code',
    'eligibility',
    'work_start_date',
    'practical_driving_test_date',
    'family_permit_date',
    'driving_permit',
  ];
  for (const key of nullableKeys) {
    if (key in out && (out[key] === '' || out[key] === undefined)) {
      out[key] = null;
    }
  }
  return out;
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Driver> & { id: string }) => {
      const payload = normalizeDriverUpdates(updates as Record<string, unknown>) as Partial<Driver>;

      // Do NOT use .single() after update — if RLS returns 0 rows, single() throws
      // "Cannot coerce the result to a single JSON object"
      const { data, error } = await supabase
        .from('drivers')
        .update(payload)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'העדכון לא הוחל — לא חזרה שורה מהשרת. ייתכן שחסרה הרשאה (RLS) או שהנהג לא נמצא.'
        );
      }
      return data[0] as Driver;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driver', data.id] });
      toast({ title: 'הנהג עודכן בהצלחה' });
    },
    onError: (error) => {
      toast({
        title: 'שגיאה בעדכון הנהג',
        description: formatSupabaseError(error),
        variant: 'destructive',
      });
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
