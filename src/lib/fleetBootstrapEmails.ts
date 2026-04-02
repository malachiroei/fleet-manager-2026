/** מיילים שמקבלים הרשאות מנהל מלאות גם כש־user_roles ריק (סנכרון פרו / RLS). */
const OWNERS = ['malachiroei@gmail.com', 'ravidmalachi@gmail.com'] as const;

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

export function isFleetBootstrapOwnerEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  return (OWNERS as readonly string[]).includes(e);
}
