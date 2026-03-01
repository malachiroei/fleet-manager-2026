import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Complaint {
  id: string;
  vehicle_number: string;
  report_id: string | null;
  report_type: string | null;
  location: string | null;
  description: string | null;
  report_date_time: string | null;
  reporter_name: string | null;
  reporter_cell_phone: string | null;
  received_time: string | null;
  receiver_name: string | null;
  driver_response: string | null;
  driver_name: string | null;
  action_taken: string | null;
  first_update_time: string | null;
  last_update_time: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function useComplaints() {
  return useQuery({
    queryKey: ['procedure6_complaints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procedure6_complaints')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Complaint[];
    },
  });
}

export function useCreateComplaints() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (complaints: Omit<Complaint, 'id' | 'created_at' | 'updated_at'>[]) => {
      const { data, error } = await supabase
        .from('procedure6_complaints')
        .insert(complaints)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['procedure6_complaints'] });
      toast({ title: `נטענו ${data.length} תלונות בהצלחה` });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בטעינת תלונות', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateComplaint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Complaint> & { id: string }) => {
      const { data, error } = await supabase
        .from('procedure6_complaints')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedure6_complaints'] });
      toast({ title: 'התלונה עודכנה בהצלחה' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בעדכון התלונה', description: error.message, variant: 'destructive' });
    },
  });
}
