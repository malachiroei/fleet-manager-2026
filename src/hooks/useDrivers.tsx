import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Driver, DriverSummary } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { formatSupabaseError } from '@/lib/supabaseError';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { fleetManagerVisibilityOrFilter } from '@/lib/fleetManagerScope';

export function useDrivers() {
  const {
    effectiveOrgId,
    isImpersonating,
    isDriverContextOnly,
    impersonatedUserId,
    fleetListReady,
    applyFleetManagerSlice,
    fleetManagerListUserId,
  } = useImpersonationFleetScope();

  const orgId = effectiveOrgId;

  return useQuery({
    queryKey: [
      'drivers',
      orgId,
      isImpersonating,
      isDriverContextOnly,
      impersonatedUserId,
      applyFleetManagerSlice,
      fleetManagerListUserId,
    ],
    enabled: fleetListReady && orgId != null,
    queryFn: async () => {
      if (orgId == null) return [] as DriverSummary[];
      let base = supabase.from('drivers').select('*').eq('org_id', orgId);
      if (isDriverContextOnly && impersonatedUserId) {
        base = base.eq('user_id', impersonatedUserId);
      } else if (applyFleetManagerSlice && fleetManagerListUserId) {
        base = base.or(fleetManagerVisibilityOrFilter(fleetManagerListUserId));
      }
      const { data, error } = await base.order('full_name');

      if (error) {
        let fallbackQ = supabase
          .from('drivers')
          .select('id, full_name, id_number, license_expiry, phone, email, address, job_title, department, license_number, health_declaration_date, safety_training_date, regulation_585b_date, license_front_url, license_back_url, health_declaration_url, status')
          .eq('org_id', orgId);
        if (isDriverContextOnly && impersonatedUserId) {
          fallbackQ = fallbackQ.eq('user_id', impersonatedUserId);
        } else if (applyFleetManagerSlice && fleetManagerListUserId) {
          fallbackQ = fallbackQ.or(fleetManagerVisibilityOrFilter(fleetManagerListUserId));
        }
        const fallback = await fallbackQ.order('full_name');
        if (fallback.error) {
          throw new Error(
            [fallback.error.message, fallback.error.code ? `code=${fallback.error.code}` : null, fallback.error.details ? `details=${fallback.error.details}` : null, fallback.error.hint ? `hint=${fallback.error.hint}` : null]
              .filter(Boolean)
              .join(' | ')
          );
        }
        return (fallback.data ?? []).map((row) => mapRowToDriverSummary(row)) as DriverSummary[];
      }

      return (data ?? []).map((row) => mapRowToDriverSummary(row)) as DriverSummary[];
    },
  });
}

function mapRowToDriverSummary(row: Record<string, unknown>): DriverSummary {
  return {
    id: String(row.id ?? ''),
    full_name: String(row.full_name ?? ''),
    id_number: String(row.id_number ?? ''),
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    license_expiry: String(row.license_expiry ?? ''),
    status: (row.status as DriverSummary['status']) ?? 'valid',
    address: (row.address as string) ?? null,
    job_title: (row.job_title as string) ?? null,
    department: (row.department as string) ?? null,
    license_number: (row.license_number as string) ?? null,
    health_declaration_date: (row.health_declaration_date as string) ?? null,
    safety_training_date: (row.safety_training_date as string) ?? null,
    regulation_585b_date: (row.regulation_585b_date as string) ?? null,
    license_front_url: (row.license_front_url as string) ?? null,
    license_back_url: (row.license_back_url as string) ?? null,
    health_declaration_url: (row.health_declaration_url as string) ?? null,
  };
}

export function useDriver(id: string) {
  const { effectiveOrgId, fleetListReady } = useImpersonationFleetScope();
  const orgId = effectiveOrgId;

  return useQuery({
    queryKey: ['driver', id, orgId],
    enabled: !!id && orgId != null && fleetListReady,
    queryFn: async () => {
      if (orgId == null) return null;
      // בלי .or(managed_by…) כאן — שילוב עם .eq('id') שובר PostgREST (400). הרשאות: RLS + org_id.
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data as Driver | null;
    },
  });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  const { activeOrgId, profile, user } = useAuth();

  return useMutation({
    mutationFn: async (driver: Partial<Omit<Driver, 'id' | 'created_at' | 'updated_at' | 'status'>> & {
      full_name: string;
      id_number: string;
      license_expiry: string;
    }) => {
      const row = { ...driver } as Record<string, unknown>;
      const effectiveOrgId = activeOrgId ?? profile?.org_id;
      if (effectiveOrgId != null && row.org_id == null) {
        row.org_id = effectiveOrgId;
      }
      const ownerId = profile?.id ?? user?.id;
      if (ownerId != null && row.managed_by_user_id === undefined) {
        row.managed_by_user_id = ownerId;
      }
      const { data, error } = await supabase
        .from('drivers')
        .insert(row)
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
