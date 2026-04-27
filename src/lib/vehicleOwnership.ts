/** ערכי בעלות מורשים במערכת (תצוגה, סינון, טפסים) */
export const VEHICLE_OWNERSHIP_OPTIONS = ['הרץ', 'יוניון מוביליטי', 'פריים ליס'] as const;

/** מיפוי leasing / owned (אנגלית או כל רישיות) ל־הרץ; שאר הערכים המורשים נשארים כפי שהם */
export function canonicalOwnershipType(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  if (lower === 'leasing' || lower === 'owned') return 'הרץ';
  return t;
}

export function displayOwnershipType(raw: string | null | undefined): string {
  return canonicalOwnershipType(raw);
}

/** ערך התחלתי ל־Select בטפסים (כולל השכרה legacy) */
export function ownershipSelectDefault(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  const c = canonicalOwnershipType(t);
  if ((VEHICLE_OWNERSHIP_OPTIONS as readonly string[]).includes(c)) return c;
  if (t.toLowerCase() === 'rental') return 'rental';
  return '';
}
