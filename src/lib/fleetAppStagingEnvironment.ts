import { isFleetManagerProHostname } from '@/lib/versionManifest';

/**
 * v2.7.64 — האם האפליקציה רצה בסביבת סטייג׳'ינג (לא fleet-manager-pro ייצור).
 * משמש תג "ENV: TEST" כשה-Supabase env guard עבר.
 */
export function isFleetAppStagingEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (isFleetManagerProHostname()) return false;

  const h = window.location.hostname.toLowerCase();
  if (h.includes('staging')) return true;
  if (h.includes('vercel.app') && (h.includes('dev') || h.includes('staging'))) return true;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (import.meta.env.DEV) return true;

  return false;
}
