/** Build a public storage object URL for the Edge Function's Supabase project. */
export function supabasePublicObjectUrl(supabaseUrl: string, objectPath: string): string {
  const base = String(supabaseUrl ?? '').replace(/\/$/, '');
  const path = objectPath.replace(/^\//, '');
  return `${base}/storage/v1/object/public/${path}`;
}
