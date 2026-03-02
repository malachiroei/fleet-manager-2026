import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VehicleHandover } from '@/types/fleet';
import hebrewFontUrl from '@/assets/fonts/NotoSansHebrew.ttf?url';

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

let cachedHebrewFontBase64: string | null = null;

async function createPdfBlob(lines: string[]) {
  const [{ jsPDF }, fontResponse] = await Promise.all([
    import('jspdf'),
    fetch(hebrewFontUrl),
  ]);

  if (!fontResponse.ok) {
    throw new Error(`Failed loading Hebrew font (${fontResponse.status})`);
  }

  if (!cachedHebrewFontBase64) {
    cachedHebrewFontBase64 = arrayBufferToBase64(await fontResponse.arrayBuffer());
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  doc.addFileToVFS('NotoSansHebrew.ttf', cachedHebrewFontBase64);
  doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
  doc.setFont('NotoSansHebrew', 'normal');
  doc.setR2L(true);

  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 40;

  doc.setFontSize(16);
  doc.text('טופס מסירה / החזרת רכב', rightX, 56, { align: 'right' });

  doc.setFontSize(11);
  let currentY = 92;
  for (const line of lines) {
    doc.text(line, rightX, currentY, { align: 'right' });
    currentY += 18;
  }

  return doc.output('blob');
}

interface ArchivedHandoverResult {
  reportUrl: string;
  handover: {
    id: string;
    pdf_url: string;
    signature_url: string | null;
  };
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

export async function archiveHandoverSubmission(input: ArchiveHandoverInput): Promise<ArchivedHandoverResult> {
  const timestamp = new Date().toISOString();
  const formBlob = await createPdfBlob([
    `מספר טופס: ${input.handoverId}`,
    `סוג טופס: ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'}`,
    `סוג מסירה: ${input.assignmentMode === 'replacement' ? 'חליפי' : 'קבוע'}`,
    `רכב: ${input.vehicleLabel}`,
    `נהג: ${input.driverLabel}`,
    `קילומטראז': ${input.odometerReading.toLocaleString('he-IL')}`,
    `דלק: ${input.fuelLevel}/8`,
    `הערות: ${input.notes || 'ללא'}`,
    `זמן ביצוע: ${new Date(timestamp).toLocaleString('he-IL')}`,
  ]);
  const fileName = `handover-forms/${input.vehicleId}/${Date.now()}_${input.handoverType}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(HANDOVER_ARCHIVE_BUCKET)
    .upload(fileName, formBlob, {
      contentType: 'application/pdf',
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

  const { data: updatedHandover, error: handoverUpdateError } = await supabase
    .from('vehicle_handovers')
    .update({
      pdf_url: reportUrl,
      signature_url: input.signatureUrl,
    } as any)
    .eq('id', input.handoverId)
    .select('id, pdf_url, signature_url')
    .single();

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

  let persistedHandover: { id: string; pdf_url: string | null; signature_url: string | null } | null =
    (updatedHandover as { id: string; pdf_url: string | null; signature_url: string | null } | null) ?? null;
  let lastReadError: unknown = null;

  for (let attempt = 1; attempt <= 5 && !persistedHandover?.pdf_url; attempt += 1) {
    const { data, error } = await supabase
      .from('vehicle_handovers')
      .select('id, pdf_url, signature_url')
      .eq('id', input.handoverId)
      .single();

    if (error) {
      lastReadError = error;
      console.warn('[archiveHandoverSubmission] vehicle_handovers readback retry', {
        stage: 'db.select.vehicle_handovers',
        handoverId: input.handoverId,
        attempt,
        message: getSupabaseErrorMessage(error),
      });
    } else {
      persistedHandover = data as { id: string; pdf_url: string | null; signature_url: string | null };
      if (persistedHandover?.pdf_url) {
        break;
      }
      console.warn('[archiveHandoverSubmission] pdf_url still empty after update', {
        handoverId: input.handoverId,
        attempt,
      });
    }

    await delay(250 * attempt);
  }

  if (!persistedHandover?.pdf_url) {
    if (lastReadError) {
      console.error('[archiveHandoverSubmission] vehicle_handovers readback failed after retries', {
        stage: 'db.select.vehicle_handovers',
        handoverId: input.handoverId,
        message: getSupabaseErrorMessage(lastReadError),
      });
    }
    throw new Error('PDF copy failed: pdf_url was not persisted on handover record');
  }

  return {
    reportUrl: persistedHandover.pdf_url,
    handover: {
      id: persistedHandover.id,
      pdf_url: persistedHandover.pdf_url,
      signature_url: persistedHandover.signature_url,
    },
  };
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
