/**
 * v2.7.66 — Supabase ייצור עבור fleet-manager-pro.com (routing דינמי).
 * מפתח ה-anon לא נשמר בקוד — רק מ־Vercel / משתני סביבה.
 */

export const FLEET_PRODUCTION_SUPABASE_URL =
  'https://cesstoohvlbvyreznwqd.supabase.co' as const;

export const FLEET_PRODUCTION_SUPABASE_PROJECT_REF = 'cesstoohvlbvyreznwqd' as const;

/** כולל www ותתי-דומיינים רלוונטיים */
export function isFleetManagerProDotComHostname(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase().includes('fleet-manager-pro.com');
}
