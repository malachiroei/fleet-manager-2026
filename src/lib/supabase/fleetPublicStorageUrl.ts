import { getSupabaseUrl } from '@/integrations/supabase/publicEnv';

/** Public bucket object URL for the currently configured Supabase project. */
export function fleetPublicStorageObjectUrl(objectPath: string): string {
  const base = getSupabaseUrl().replace(/\/$/, '');
  const path = objectPath.replace(/^\//, '');
  return `${base}/storage/v1/object/public/${path}`;
}
