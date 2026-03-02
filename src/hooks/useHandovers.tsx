import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VehicleHandover } from '@/types/fleet';

export type AssignmentMode = 'permanent' | 'replacement';

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
        .insert(handover as any)
        .select()
        .single();

      if (!error) {
        return data;
      }

      const errorMessage = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
      const shouldRetryWithoutAssignmentMode =
        errorMessage.includes('assignment_mode') ||
        errorMessage.includes('column') ||
        errorMessage.includes('schema cache');

      if (!shouldRetryWithoutAssignmentMode) {
        throw error;
      }

      const { assignment_mode, ...fallbackPayload } = handover as any;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('vehicle_handovers')
        .insert(fallbackPayload)
        .select()
        .single();

      if (fallbackError) throw fallbackError;
      return fallbackData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    }
  });
}

interface ArchiveHandoverInput {
  handoverId: string;
  handoverType: 'delivery' | 'return';
  assignmentMode?: AssignmentMode;
  vehicleId: string;
  vehicleLabel: string;
  driverId: string | null;
  driverLabel: string;
  odometerReading: number;
  fuelLevel: number;
  notes: string | null;
  photoUrls: {
    front: string | null;
    back: string | null;
    right: string | null;
    left: string | null;
  };
  signatureUrl: string | null;
  createdBy: string | null;
  includeDriverArchive: boolean;
}

export async function archiveHandoverSubmission(input: ArchiveHandoverInput): Promise<string> {
  const timestamp = new Date().toISOString();
  const formCopy = {
    handoverId: input.handoverId,
    handoverType: input.handoverType,
    assignmentMode: input.assignmentMode ?? 'permanent',
    timestamp,
    vehicle: {
      id: input.vehicleId,
      label: input.vehicleLabel,
    },
    driver: {
      id: input.driverId,
      label: input.driverLabel,
    },
    odometerReading: input.odometerReading,
    fuelLevel: input.fuelLevel,
    notes: input.notes,
    photos: input.photoUrls,
    signatureUrl: input.signatureUrl,
    createdBy: input.createdBy,
  };

  const formBlob = new Blob([JSON.stringify(formCopy, null, 2)], { type: 'application/json' });
  const fileName = `handover-forms/${input.vehicleId}/${Date.now()}_${input.handoverType}.json`;

  const { error: uploadError } = await supabase.storage
    .from('fleet-documents')
    .upload(fileName, formBlob, {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from('fleet-documents')
    .getPublicUrl(fileName);

  const reportUrl = publicData.publicUrl;

  const { error: vehicleDocError } = await supabase
    .from('vehicle_documents' as any)
    .insert({
      vehicle_id: input.vehicleId,
      title: `טופס ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'} - ${new Date().toLocaleDateString('he-IL')}`,
      file_url: reportUrl,
      handover_id: input.handoverId,
      document_type: input.handoverType,
      metadata: {
        assignmentMode: input.assignmentMode ?? 'permanent',
        photoUrls: input.photoUrls,
        signatureUrl: input.signatureUrl,
      },
    });

  if (vehicleDocError) throw vehicleDocError;

  if (input.includeDriverArchive && input.driverId) {
    const { error: driverDocError } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: input.driverId,
        title: `טופס ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'} - ${new Date().toLocaleDateString('he-IL')}`,
        file_url: reportUrl,
      });

    if (driverDocError) throw driverDocError;
  }

  return reportUrl;
}

interface SendHandoverEmailInput {
  handoverType: 'delivery' | 'return';
  assignmentMode?: AssignmentMode;
  vehicleLabel: string;
  driverLabel: string;
  odometerReading: number;
  fuelLevel: number;
  notes: string | null;
  reportUrl: string;
}

export async function sendHandoverNotificationEmail(input: SendHandoverEmailInput) {
  const toEmail = localStorage.getItem('handover_notification_email') || 'malachiroei@gmail.com';

  const { error } = await supabase.functions.invoke('send-handover-notification', {
    body: {
      to: toEmail,
      subject: `${input.handoverType === 'delivery' ? 'מסירת רכב' : 'החזרת רכב'} - ${input.vehicleLabel}`,
      payload: {
        ...input,
        sentAt: new Date().toISOString(),
      },
    },
  });

  if (error) throw error;
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
    .from('fleet-documents')
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
    .from('fleet-documents')
    .getPublicUrl(fileName);
  
  return data.publicUrl;
}
