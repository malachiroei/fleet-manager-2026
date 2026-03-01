 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import type { DriverDocument } from '@/types/fleet';
 import { toast } from '@/hooks/use-toast';
 
 export function useDriverDocuments(driverId: string) {
   return useQuery({
     queryKey: ['driver-documents', driverId],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('driver_documents')
         .select('*')
         .eq('driver_id', driverId)
         .order('created_at', { ascending: false });
 
       if (error) throw error;
       return data as DriverDocument[];
     },
     enabled: !!driverId
   });
 }
 
 export function useCreateDriverDocument() {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async (doc: Omit<DriverDocument, 'id' | 'created_at'>) => {
       const { data, error } = await supabase
         .from('fleet-documents')
         .insert(doc)
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: (data) => {
       queryClient.invalidateQueries({ queryKey: ['driver-documents', data.driver_id] });
       toast({ title: 'המסמך נוסף בהצלחה' });
     },
     onError: (error) => {
       toast({ title: 'שגיאה בהוספת המסמך', description: error.message, variant: 'destructive' });
     }
   });
 }
 
 export function useDeleteDriverDocument() {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async ({ id, driverId }: { id: string; driverId: string }) => {
       const { error } = await supabase
         .from('driver_documents')
         .delete()
         .eq('id', id);
 
       if (error) throw error;
       return { id, driverId };
     },
     onSuccess: (data) => {
       queryClient.invalidateQueries({ queryKey: ['driver-documents', data.driverId] });
       toast({ title: 'המסמך נמחק בהצלחה' });
     },
     onError: (error) => {
       toast({ title: 'שגיאה במחיקת המסמך', description: error.message, variant: 'destructive' });
     }
   });
 }