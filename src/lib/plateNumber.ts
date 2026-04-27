/** מספר רישוי לאחסון ותצוגה: רק ספרות (מסיר מקפים, רווחים וכל תו שאינו ספרה) */
export function normalizePlateNumber(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw).replace(/\D/g, '');
}
