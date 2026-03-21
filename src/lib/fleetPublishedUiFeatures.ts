/**
 * תכונות כותרת שמופעלות רק אם השורה המתאימה מופיעה ב־version_manifest.changes (אחרי פרסום).
 * בטסט (לא Pro) — שתיהן פעילות כברירת מחדל.
 */

/** חייב להופיע כחלק מהמחרוזת ב־changes (פרסום / pending) */
export const FLEET_UI_FEATURE_BOLD_VERSION_TOKEN = 'UI_FEATURE_BOLD_VERSION_HEADER';
export const FLEET_UI_FEATURE_STAR_HEADER_TOKEN = 'UI_FEATURE_STAR_HEADER';

/** שורות ל־pending_changes — זהות לפרסום כדי שהצ׳קבוקסים יתאימו ל־AppLayout */
export const FLEET_UI_PENDING_LINE_BOLD = `${FLEET_UI_FEATURE_BOLD_VERSION_TOKEN} — Bold version text in header (AppLayout)`;
export const FLEET_UI_PENDING_LINE_STAR = `${FLEET_UI_FEATURE_STAR_HEADER_TOKEN} — Star icon (⭐) in header (AppLayout)`;

export function manifestChangesIncludeToken(lines: string[], token: string): boolean {
  const t = String(token).trim();
  if (!t) return false;
  return lines.some((line) => String(line).includes(t));
}
