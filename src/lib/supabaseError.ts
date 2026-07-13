const KNOWN_ERROR_PATTERNS: Array<{ pattern: RegExp; hebrew: string }> = [
  { pattern: /no unique or exclusion constraint matching the ON CONFLICT/i, hebrew: 'חסר אילוץ ייחודי בטבלה — ייתכן שנדרשת מיגרציה. פנה למנהל המערכת.' },
  { pattern: /duplicate key value violates unique constraint/i, hebrew: 'ערך כפול — רשומה עם נתון זהה כבר קיימת במערכת.' },
  { pattern: /violates not-null constraint/i, hebrew: 'שדה חובה ריק — אחד השדות הנדרשים לא מולא.' },
  { pattern: /violates foreign key constraint/i, hebrew: 'קישור שגוי — הפניה לרשומה שלא קיימת.' },
  { pattern: /new row violates row-level security/i, hebrew: 'אין הרשאה לבצע פעולה זו (RLS).' },
  { pattern: /permission denied/i, hebrew: 'אין הרשאה לבצע פעולה זו.' },
  { pattern: /JWT expired/i, hebrew: 'תוקף ההתחברות פג — יש להתחבר מחדש.' },
  { pattern: /Could not find.*in the schema cache/i, hebrew: 'עמודה או טבלה לא נמצאו — ייתכן שנדרשת מיגרציה.' },
  { pattern: /schema cache/i, hebrew: 'שגיאת schema cache — ייתכן שנדרש רענון מסד הנתונים.' },
];

/**
 * Formats Supabase/PostgREST errors for toasts/logs so we can tell RLS vs constraint vs missing column.
 * PostgREST returns { message, code, details, hint } on the error object.
 */
export function formatSupabaseError(error: unknown): string {
  if (error == null) return 'שגיאה לא ידועה';

  if (typeof error === 'string') return translateToHebrew(error) || error;

  const e = error as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof e.message === 'string' && e.message) parts.push(e.message);
  if (typeof e.details === 'string' && e.details) parts.push(e.details);
  if (typeof e.hint === 'string' && e.hint) parts.push(e.hint);

  const rawMessage = parts.join(' | ');
  const hebrewTranslation = translateToHebrew(rawMessage);

  if (hebrewTranslation) return hebrewTranslation;
  if (parts.length > 0) {
    const code = typeof e.code === 'string' ? ` (קוד: ${e.code})` : '';
    return `${rawMessage}${code}`;
  }

  if (error instanceof Error && error.message) return translateToHebrew(error.message) || error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function translateToHebrew(text: string): string | null {
  for (const { pattern, hebrew } of KNOWN_ERROR_PATTERNS) {
    if (pattern.test(text)) return hebrew;
  }
  return null;
}

/** PostgREST / Postgres: טבלה או עמודה חסרים ב-schema cache או במסד (מיגרציה לא הורצה). */
export function isMissingSchemaObjectError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  if (!e) return false;
  const code = (e.code ?? '').toUpperCase();
  if (code === 'PGRST204' || code === 'PGRST205' || code === '42P01') return true;
  const blob = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();
  return (
    blob.includes('schema cache') ||
    blob.includes('does not exist') ||
    /could not find the (table|column)/i.test(blob)
  );
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
