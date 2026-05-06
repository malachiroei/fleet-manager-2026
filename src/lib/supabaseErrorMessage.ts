/**
 * PostgREST / Supabase מחזירים לעיתים אובייקט שגיאה ({ message, code, details }) שלא instanceof Error —
 * מופיע ב-UI כ־"[object Object]" אם עושים String(err).
 */
export function formatSupabaseLikeError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    if (parts.length) return parts.join(' — ');
    try {
      return JSON.stringify(o);
    } catch {
      /* fallthrough */
    }
  }
  const s = String(err ?? '').trim();
  return s || 'שגיאה לא ידועה';
}
