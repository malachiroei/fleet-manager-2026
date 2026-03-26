/**
 * v2.7.66 — routing לפי hostname (fleet-manager-pro.com).
 * URL/מפתחות Supabase — רק מ־`.env` / Vercel (`NEXT_PUBLIC_*` / `VITE_*`), לא בקוד.
 */

/** כולל www ותתי-דומיינים רלוונטיים */
export function isFleetManagerProDotComHostname(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase().includes('fleet-manager-pro.com');
}
