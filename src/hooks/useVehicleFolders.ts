import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseCategory = 'fuel' | 'maintenance' | 'insurance' | 'tire' | 'fine' | 'wash' | 'other';

export interface VehicleExpense {
  id: string;
  vehicle_id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  supplier: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_at: string;
}

export type IncidentType = 'event' | 'accident';
export type IncidentStatus = 'open' | 'closed';

export interface VehicleIncident {
  id: string;
  vehicle_id: string;
  incident_type: IncidentType;
  incident_date: string;
  description: string;
  location: string | null;
  driver_id: string | null;
  damage_desc: string | null;
  photo_urls: string[] | null;
  police_report_no: string | null;
  insurance_claim: string | null;
  status: IncidentStatus;
  notes: string | null;
  created_at: string;
}

// ─── Expense hooks ────────────────────────────────────────────────────────────

export function useVehicleExpenses(vehicleId: string) {
  return useQuery<VehicleExpense[]>({
    queryKey: ['vehicle-expenses', vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('vehicle_expenses')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as VehicleExpense[];
    },
  });
}

export function useCreateVehicleExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<VehicleExpense, 'id' | 'created_at'>) => {
      const { error } = await (supabase as any).from('vehicle_expenses').insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['vehicle-expenses', v.vehicle_id] }),
  });
}

export function useDeleteVehicleExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await (supabase as any).from('vehicle_expenses').delete().eq('id', id);
      if (error) throw error;
      return vehicleId;
    },
    onSuccess: (vehicleId) => qc.invalidateQueries({ queryKey: ['vehicle-expenses', vehicleId] }),
  });
}

// ─── Incident hooks ──────────────────────────────────────────────────────────

export function useVehicleIncidents(vehicleId: string, type?: IncidentType) {
  return useQuery<VehicleIncident[]>({
    queryKey: ['vehicle-incidents', vehicleId, type ?? 'all'],
    enabled: !!vehicleId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('vehicle_incidents')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('incident_date', { ascending: false });
      if (type) q = q.eq('incident_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VehicleIncident[];
    },
  });
}

export function useCreateVehicleIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<VehicleIncident, 'id' | 'created_at'>) => {
      const { error } = await (supabase as any).from('vehicle_incidents').insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['vehicle-incidents', v.vehicle_id] });
    },
  });
}

export function useDeleteVehicleIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await (supabase as any).from('vehicle_incidents').delete().eq('id', id);
      if (error) throw error;
      return vehicleId;
    },
    onSuccess: (vehicleId) => qc.invalidateQueries({ queryKey: ['vehicle-incidents', vehicleId] }),
  });
}
