/** Public app base URL for Procedure 6 driver response links (never localhost in production mail). */
const APP_URL_DEFAULT = 'https://fleet-manager-pro.com';

export function resolveProcedure6PublicAppBaseUrl(): string {
  const fromEnv =
    String(Deno.env.get('PUBLIC_APP_URL') ?? '').trim() ||
    String(Deno.env.get('COMPLIANCE_UPDATE_BASE_URL') ?? '').trim();
  if (
    !fromEnv ||
    fromEnv.includes('localhost') ||
    fromEnv.includes('127.0.0.1') ||
    fromEnv.includes('vercel.app')
  ) {
    return APP_URL_DEFAULT;
  }
  return fromEnv.replace(/\/$/, '');
}

/** Canonical public respond URL — matches App route `/procedure6/respond/:token`. */
export function buildProcedure6RespondUrl(responseToken: string): string {
  const token = String(responseToken ?? '').trim();
  const base = resolveProcedure6PublicAppBaseUrl();
  if (!token) return `${base}/procedure6/respond/`;
  return `${base}/procedure6/respond/${encodeURIComponent(token)}`;
}
