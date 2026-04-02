/**
 * מזהה ארגון «הצי הראשי» כשהפרופיל / org_members חסרים בפרו (שחזור DB / RLS).
 * ניתן לעקוף ב־VITE_FALLBACK_MAIN_FLEET_ORG_ID.
 */
const fromEnv = import.meta.env.VITE_FALLBACK_MAIN_FLEET_ORG_ID;
export const FALLBACK_MAIN_FLEET_ORG_ID: string =
  typeof fromEnv === 'string' && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : '857f2311-2ec5-41d3-8e32-dacd450a9a77';

/**
 * ארגון צי נפרד למנהל רביד — חייב להתאים ל־profiles.org_id של ravidmalachi@gmail.com ב־DB.
 * משמש תצוגה כרביד / מחליף ארגון כדי שלא יישארו על הצי הראשי של רועי.
 */
const ravidFromEnv = import.meta.env.VITE_RAVID_FLEET_ORG_ID;
export const RAVID_FLEET_ORG_ID: string =
  typeof ravidFromEnv === 'string' && ravidFromEnv.trim().length > 0
    ? ravidFromEnv.trim()
    : '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
