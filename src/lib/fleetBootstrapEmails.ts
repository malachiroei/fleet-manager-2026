/** חשבון על (מנהל פלטפורמה) — יחיד; אין לוותר עליו עם אימיילים של מנהלי ארגון. */
export const PLATFORM_SUPER_OWNER_EMAIL = 'malachiroei@gmail.com';

/** מנהל צי — תצוגה כמשתמש / ארגון נפרד מהצי הראשי */
export const RAVID_MANAGER_EMAIL = 'ravidmalachi@gmail.com';

/** זיהוי מנהל רביד גם כשהמייל ב-Google הוא עם נקודה */
export function isRavidManagerEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  return e === 'ravidmalachi@gmail.com' || e === 'ravid.malachi@gmail.com';
}

/**
 * אימייל לזיהוי הרשאות: אם `profiles.email` ריק ב-DB, נופלים ל-auth.
 * (`profile?.email ?? user?.email` לא מספיק — מחרוזת ריקה לא מפעילה את ה-??.)
 */
export function resolveSessionEmail(
  profile: { email?: string | null } | null | undefined,
  user: { email?: string | null } | null | undefined,
): string {
  const p = profile?.email?.trim();
  if (p) return p.toLowerCase();
  const u = user?.email?.trim();
  return (u ?? '').toLowerCase();
}

/** true רק ל־malachiroei@gmail.com — גישה בין-ארגונית / צי ראשי / דשבורד גלובלי. */
export function isPlatformSuperOwnerEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  return e === PLATFORM_SUPER_OWNER_EMAIL.toLowerCase();
}

/**
 * מנהלי ארגון ידועים: כש־`user_roles` ריק בפרו — עדיין לטפל כ־admin בארגון שלהם,
 * בלי לקבל את אותן הרחאות «חשבון על» (PermissionGuard, צי ראשי של מישהו אחר).
 */
const ORG_ADMIN_FALLBACK_EMAILS = ['ravidmalachi@gmail.com', 'ravid.malachi@gmail.com'] as const;

export function isFleetOrgAdminFallbackEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  return (ORG_ADMIN_FALLBACK_EMAILS as readonly string[]).includes(e);
}

/**
 * @deprecated העדיפו `isPlatformSuperOwnerEmail` / `isFleetOrgAdminFallbackEmail` לפי הקשר.
 * איחוד ישן: «בעלי bootstrap» — כיום רק לשימור תאימות ב־useAuth (isAdminEffective).
 */
export function isFleetBootstrapOwnerEmail(email: string | null | undefined): boolean {
  return isPlatformSuperOwnerEmail(email) || isFleetOrgAdminFallbackEmail(email);
}
