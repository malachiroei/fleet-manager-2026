import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DriverIncidentType = 'event' | 'accident';
export type DriverIncidentStatus = 'open' | 'closed';

export interface DriverFamilyMember {
  id: string;
  driver_id: string;
  full_name: string;
  relationship: string;
  phone: string | null;
  id_number: string | null;
  birth_date: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
}

export interface DriverIncident {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  incident_type: DriverIncidentType;
  incident_date: string;
  description: string;
  location: string | null;
  damage_desc: string | null;
  police_report_no: string | null;
  insurance_claim: string | null;
  photo_urls: string[] | null;
  status: DriverIncidentStatus;
  notes: string | null;
  created_at: string;
}

// ─── Family Member hooks ──────────────────────────────────────────────────────

export function useDriverFamilyMembers(driverId: string) {
  return useQuery<DriverFamilyMember[]>({
    queryKey: ['driver-family-members', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('driver_family_members')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DriverFamilyMember[];
    },
  });
}

export function useCreateDriverFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<DriverFamilyMember, 'id' | 'created_at'>) => {
      const { error } = await (supabase as any).from('driver_family_members').insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['driver-family-members', v.driver_id] }),
  });
}

export function useDeleteDriverFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, driverId }: { id: string; driverId: string }) => {
      const { error } = await (supabase as any).from('driver_family_members').delete().eq('id', id);
      if (error) throw error;
      return driverId;
    },
    onSuccess: (driverId) => qc.invalidateQueries({ queryKey: ['driver-family-members', driverId] }),
  });
}

// ─── Driver Incident hooks ────────────────────────────────────────────────────

export function useDriverIncidents(driverId: string, type?: DriverIncidentType) {
  return useQuery<DriverIncident[]>({
    queryKey: ['driver-incidents', driverId, type ?? 'all'],
    enabled: !!driverId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('driver_incidents')
        .select('*')
        .eq('driver_id', driverId)
        .order('incident_date', { ascending: false });
      if (type) q = q.eq('incident_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DriverIncident[];
    },
  });
}

export function useCreateDriverIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<DriverIncident, 'id' | 'created_at'>) => {
      const { error } = await (supabase as any).from('driver_incidents').insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['driver-incidents', v.driver_id] });
    },
  });
}

export function useDeleteDriverIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, driverId }: { id: string; driverId: string }) => {
      const { error } = await (supabase as any).from('driver_incidents').delete().eq('id', id);
      if (error) throw error;
      return driverId;
    },
    onSuccess: (driverId) => qc.invalidateQueries({ queryKey: ['driver-incidents', driverId] }),
  });
}
