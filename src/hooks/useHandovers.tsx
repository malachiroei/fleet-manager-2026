import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VehicleHandover } from '@/types/fleet';

export type AssignmentMode = 'permanent' | 'replacement';

const APP_BASE_URL = 'https://fleet-manager-2026.vercel.app';
const HANDOVER_PHOTOS_BUCKET = 'handover-photos';
const HANDOVER_ARCHIVE_BUCKET = 'vehicle-documents';

function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Unknown error';
  }

  const maybeError = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
    statusCode?: string | number;
    error?: string;
  };

  return [
    maybeError.message,
    maybeError.details,
    maybeError.hint,
    maybeError.code ? `code=${maybeError.code}` : undefined,
    maybeError.statusCode ? `status=${maybeError.statusCode}` : undefined,
    maybeError.error,
  ]
    .filter(Boolean)
    .join(' | ');
}

export interface HandoverHistoryItem {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  handover_type: 'delivery' | 'return';
  handover_date: string;
  driver_label: string;
  vehicle_label: string;
  form_url: string | null;
  photo_urls: string[];
}

export function buildHandoverRecordUrl(vehicleId: string, handoverId: string) {
  return `${APP_BASE_URL}/vehicles/${vehicleId}#handover-${handoverId}`;
}

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
      queryClient.invalidateQueries({ queryKey: ['handover-history'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    }
  });
}

export function useHandoverHistory() {
  return useQuery({
    queryKey: ['handover-history'],
    queryFn: async () => {
      const { data: handoversData, error: handoversError } = await supabase
        .from('vehicle_handovers')
        .select('id, vehicle_id, driver_id, handover_type, handover_date, pdf_url, photo_front_url, photo_back_url, photo_right_url, photo_left_url, driver:drivers(full_name), vehicle:vehicles(manufacturer, model, plate_number)')
        .order('handover_date', { ascending: false })
        .limit(300);

      if (handoversError) {
        console.warn('Handover history query failed:', handoversError.message);
        return [] as HandoverHistoryItem[];
      }

      const handovers = (handoversData ?? []) as any[];
      const handoverIds = handovers.map((handover) => handover.id);

      let docsByHandover = new Map<string, any>();

      if (handoverIds.length > 0) {
        const { data: docsData, error: docsError } = await supabase
          .from('vehicle_documents' as any)
          .select('handover_id, file_url, metadata, created_at')
          .in('handover_id', handoverIds)
          .order('created_at', { ascending: false });

        if (docsError) {
          console.warn('Vehicle documents query failed:', docsError.message);
        } else {
          docsByHandover = new Map(
            ((docsData as any[]) ?? [])
              .filter((doc) => !!doc.handover_id)
              .map((doc) => [doc.handover_id as string, doc])
          );
        }
      }

      return handovers.map((handover): HandoverHistoryItem => {
        const doc = docsByHandover.get(handover.id) ?? null;
        const metadataPhotoUrls = [
          doc?.metadata?.photoUrls?.front,
          doc?.metadata?.photoUrls?.back,
          doc?.metadata?.photoUrls?.right,
          doc?.metadata?.photoUrls?.left,
        ].filter(Boolean) as string[];

        const rowPhotoUrls = [
          handover.photo_front_url,
          handover.photo_back_url,
          handover.photo_right_url,
          handover.photo_left_url,
        ].filter(Boolean) as string[];

        const driverLabel = handover.driver?.full_name ?? 'ללא נהג';
        const vehicleLabel = handover.vehicle
          ? `${handover.vehicle.manufacturer} ${handover.vehicle.model} (${handover.vehicle.plate_number})`
          : 'ללא רכב';

        return {
          id: handover.id,
          vehicle_id: handover.vehicle_id,
          driver_id: handover.driver_id,
          handover_type: handover.handover_type,
          handover_date: handover.handover_date,
          driver_label: driverLabel,
          vehicle_label: vehicleLabel,
          form_url: doc?.file_url ?? handover.pdf_url ?? null,
          photo_urls: Array.from(new Set([...metadataPhotoUrls, ...rowPhotoUrls])),
        };
      });
    },
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
    .from(HANDOVER_ARCHIVE_BUCKET)
    .upload(fileName, formBlob, {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadError) {
    console.error('[archiveHandoverSubmission] Storage upload failed', {
      stage: 'storage.upload',
      bucket: HANDOVER_ARCHIVE_BUCKET,
      fileName,
      error: uploadError,
      message: getSupabaseErrorMessage(uploadError),
    });
    throw new Error(`Storage upload failed (${HANDOVER_ARCHIVE_BUCKET}): ${getSupabaseErrorMessage(uploadError)}`);
  }

  const { data: publicData } = supabase.storage
    .from(HANDOVER_ARCHIVE_BUCKET)
    .getPublicUrl(fileName);

  const reportUrl = publicData.publicUrl;

  if (!reportUrl) {
    console.error('[archiveHandoverSubmission] Public URL generation failed', {
      stage: 'storage.getPublicUrl',
      bucket: HANDOVER_ARCHIVE_BUCKET,
      fileName,
    });
    throw new Error('Failed to create handover form URL from storage');
  }

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

  if (vehicleDocError) {
    console.error('[archiveHandoverSubmission] vehicle_documents insert failed', {
      stage: 'db.insert.vehicle_documents',
      handoverId: input.handoverId,
      vehicleId: input.vehicleId,
      error: vehicleDocError,
      message: getSupabaseErrorMessage(vehicleDocError),
    });
    throw new Error(`vehicle_documents insert failed: ${getSupabaseErrorMessage(vehicleDocError)}`);
  }

  const { error: handoverUpdateError } = await supabase
    .from('vehicle_handovers')
    .update({
      pdf_url: reportUrl,
      signature_url: input.signatureUrl,
    } as any)
    .eq('id', input.handoverId);

  if (handoverUpdateError) {
    console.error('[archiveHandoverSubmission] vehicle_handovers update failed', {
      stage: 'db.update.vehicle_handovers',
      handoverId: input.handoverId,
      error: handoverUpdateError,
      message: getSupabaseErrorMessage(handoverUpdateError),
    });
    throw new Error(`vehicle_handovers update failed: ${getSupabaseErrorMessage(handoverUpdateError)}`);
  }

  if (input.includeDriverArchive && input.driverId) {
    const { error: driverDocError } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: input.driverId,
        title: `טופס ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'} - ${new Date().toLocaleDateString('he-IL')}`,
        file_url: reportUrl,
      });

    if (driverDocError) {
      console.error('[archiveHandoverSubmission] driver_documents insert failed', {
        stage: 'db.insert.driver_documents',
        handoverId: input.handoverId,
        driverId: input.driverId,
        error: driverDocError,
        message: getSupabaseErrorMessage(driverDocError),
      });
      throw new Error(`driver_documents insert failed: ${getSupabaseErrorMessage(driverDocError)}`);
    }
  }

  const { data: persistedHandover, error: persistedHandoverError } = await supabase
    .from('vehicle_handovers')
    .select('pdf_url')
    .eq('id', input.handoverId)
    .single();

  if (persistedHandoverError) {
    console.error('[archiveHandoverSubmission] vehicle_handovers readback failed', {
      stage: 'db.select.vehicle_handovers',
      handoverId: input.handoverId,
      error: persistedHandoverError,
      message: getSupabaseErrorMessage(persistedHandoverError),
    });
    throw new Error(`vehicle_handovers readback failed: ${getSupabaseErrorMessage(persistedHandoverError)}`);
  }

  const persistedPdfUrl = (persistedHandover as { pdf_url?: string | null } | null)?.pdf_url;
  if (!persistedPdfUrl) {
    throw new Error('PDF copy failed: pdf_url was not persisted on handover record');
  }

  return persistedPdfUrl;
}

interface SendHandoverEmailInput {
  handoverId: string;
  vehicleId: string;
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
        recordUrl: buildHandoverRecordUrl(input.vehicleId, input.handoverId),
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
    .from(HANDOVER_PHOTOS_BUCKET)
    .upload(fileName, compressedFile, {
      contentType: 'image/jpeg',
      upsert: true
    });
  
  if (error) throw error;
  
  const { data } = supabase.storage
    .from(HANDOVER_PHOTOS_BUCKET)
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
    .from(HANDOVER_PHOTOS_BUCKET)
    .upload(fileName, blob, {
      contentType: 'image/png',
      upsert: true
    });
  
  if (error) throw error;
  
  const { data } = supabase.storage
    .from(HANDOVER_PHOTOS_BUCKET)
    .getPublicUrl(fileName);
  
  return data.publicUrl;
}
