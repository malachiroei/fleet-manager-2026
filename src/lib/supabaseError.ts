/**
 * Formats Supabase/PostgREST errors for toasts/logs so we can tell RLS vs constraint vs missing column.
 * PostgREST returns { message, code, details, hint } on the error object.
 */
export function formatSupabaseError(error: unknown): string {
  if (error == null) return 'שגיאה לא ידועה';

  if (typeof error === 'string') return error;

  const e = error as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof e.message === 'string' && e.message) parts.push(e.message);
  if (typeof e.code === 'string' && e.code) parts.push(`code: ${e.code}`);
  if (typeof e.details === 'string' && e.details) parts.push(`details: ${e.details}`);
  if (typeof e.hint === 'string' && e.hint) parts.push(`hint: ${e.hint}`);

  if (parts.length > 0) return parts.join(' | ');

  if (error instanceof Error && error.message) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** PostgREST: עמודת safety_officer לא קיימת / לא ב-schema cache (מיגרציה לא הורצה בפרוד). */
export function isMissingSafetyOfficerColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const blob = `${e?.message ?? ''} ${e?.details ?? ''} ${e?.hint ?? ''}`.toLowerCase();
  if (!blob.includes('safety_officer')) return false;
  return (
    e?.code === 'PGRST204' ||
    blob.includes('pgrst204') ||
    blob.includes('schema cache')
  );
}
