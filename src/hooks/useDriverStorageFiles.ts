import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'vehicle-documents';

/** Prefix inside bucket — matches Storage path Documents/Drivers/{driver_id}/ */
export function driverDocumentsStoragePrefix(driverId: string): string {
  return `Documents/Drivers/${driverId}`;
}

export interface DriverStorageFile {
  name: string;
  path: string;
  createdAt: string | null;
  updatedAt: string | null;
  publicUrl: string;
}

export function useDriverStorageFiles(driverId: string) {
  return useQuery({
    queryKey: ['driver-storage-files', driverId],
    queryFn: async (): Promise<DriverStorageFile[]> => {
      if (!driverId) return [];
      const prefix = driverDocumentsStoragePrefix(driverId);
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
        limit: 500,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) {
        console.warn('[useDriverStorageFiles]', prefix, error.message);
        return [];
      }
      const files = (data ?? []).filter((item) => item.id !== null); // folders have id null
      return files.map((file) => {
        const path = `${prefix}/${file.name}`;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return {
          name: file.name,
          path,
          createdAt: file.created_at ?? null,
          updatedAt: file.updated_at ?? null,
          publicUrl: urlData.publicUrl,
        };
      });
    },
    enabled: !!driverId,
    staleTime: 60 * 1000,
  });
}
