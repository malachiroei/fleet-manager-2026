import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VehicleHandover } from '@/types/fleet';

export function useHandovers(vehicleId?: string) {
  return useQuery({
    queryKey: ['handovers', vehicleId],
    queryFn: async () => {
      let query = supabase
        .from('vehicle_handovers')
        .select('*, vehicle:vehicles(*), driver:drivers(*)')
        .order('handover_date', { ascending: false });
      
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as VehicleHandover[];
    }
  });
}

export function useCreateHandover() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (handover: Omit<VehicleHandover, 'id' | 'created_at' | 'vehicle' | 'driver'>) => {
      const { data, error } = await supabase
        .from('vehicle_handovers')
        .insert(handover)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    }
  });
}

export function useLatestHandover(vehicleId: string) {
  return useQuery({
    queryKey: ['latest-handover', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_handovers')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('handover_date', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as VehicleHandover | null;
    },
    enabled: !!vehicleId
  });
}

// Upload image with compression
export async function uploadHandoverPhoto(
  file: File, 
  vehicleId: string, 
  photoType: 'front' | 'back' | 'right' | 'left'
): Promise<string> {
  // Compress image before upload
  const compressedFile = await compressImage(file);
  
  const fileName = `${vehicleId}/${Date.now()}_${photoType}.jpg`;
  
  const { error } = await supabase.storage
    .from('fleet-documents')
    .upload(fileName, compressedFile, {
      contentType: 'image/jpeg',
      upsert: true
    });
  
  if (error) throw error;
  
  const { data } = supabase.storage
    .from('handover-photos')
    .getPublicUrl(fileName);
  
  return data.publicUrl;
}

// Image compression utility
async function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// Upload signature
export async function uploadSignature(
  dataUrl: string, 
  vehicleId: string,
  handoverType: 'delivery' | 'return'
): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  
  const fileName = `${vehicleId}/${Date.now()}_signature_${handoverType}.png`;
  
  const { error } = await supabase.storage
    .from('fleet-documents')
    .upload(fileName, blob, {
      contentType: 'image/png',
      upsert: true
    });
  
  if (error) throw error;
  
  const { data } = supabase.storage
    .from('handover-photos')
    .getPublicUrl(fileName);
  
  return data.publicUrl;
}
