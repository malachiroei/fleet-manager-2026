/**
 * מזהה ארגון «הצי הראשי» כשהפרופיל / org_members חסרים בפרו (שחזור DB / RLS).
 * ניתן לעקוף ב־VITE_FALLBACK_MAIN_FLEET_ORG_ID.
 */
const fromEnv = import.meta.env.VITE_FALLBACK_MAIN_FLEET_ORG_ID;
export const FALLBACK_MAIN_FLEET_ORG_ID: string =
  typeof fromEnv === 'string' && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : '857f2311-2ec5-41d3-8e32-dacd450a9a77';
