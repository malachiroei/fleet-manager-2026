/** UUID פשוט לפני PostgREST — ערכים לא תקינים גורמים ל-400 על `.eq` / `.in`. */
export function isLikelyUuid(value: string | null | undefined): boolean {
  if (value == null || typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
