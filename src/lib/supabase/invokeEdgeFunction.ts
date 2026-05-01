import { supabase, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/client';

/**
 * Edge Functions ב-Supabase דורשים לרוב גם apikey וגם Authorization (JWT או anon).
 * שימוש עקבי מפחית כשלים 401 בפרודקשן מול invoke עם Bearer ריק.
 */
export async function invokeSupabaseEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof supabase.functions.invoke>>> {
  const anonKey = getSupabaseAnonKey() ?? '';
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? '';
  const bearer = accessToken || anonKey;

  return supabase.functions.invoke(functionName, {
    body,
    headers: {
      ...(anonKey ? { apikey: anonKey } : {}),
      Authorization: `Bearer ${bearer}`,
    },
  });
}

type InvokeLikeResult = { data: unknown; error: Error | null };

/**
 * קריאת Edge דרך fetch ישיר — לדפים ציבוריים (קישור במייל בלי התחברות).
 * בחלק מהדפדפנים/מכשירים `supabase.functions.invoke` נכשל לפני תגובת השרת (הודעה גנרית
 * "Failed to send a request to the Edge Function"). fetch יציב יותר עם אותם כותרות.
 */
export async function invokeSupabaseEdgeFunctionDirect(
  functionName: string,
  body: Record<string, unknown>,
): Promise<InvokeLikeResult> {
  const baseUrl = String(getSupabaseUrl() ?? '').trim().replace(/\/$/, '');
  const anonKey = getSupabaseAnonKey() ?? '';
  if (!baseUrl || !anonKey) {
    return {
      data: null,
      error: new Error('המערכת לא מוגדרת: חסר Supabase URL או מפתח anon בבנייה.'),
    };
  }
  const url = `${baseUrl}/functions/v1/${encodeURIComponent(functionName)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { error: text.slice(0, 500) };
      }
    }
    if (!res.ok) {
      let msg = `שגיאת שרת (${res.status})`;
      if (parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
        const e = (parsed as { error?: unknown }).error;
        if (typeof e === 'string' && e.trim()) msg = e.trim();
      }
      return { data: parsed, error: new Error(msg) };
    }
    return { data: parsed, error: null };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const friendly =
      /failed to fetch|networkerror|load failed|ניתוק/i.test(raw)
        ? 'אין חיבור לשרת. בדקו רשת או נסו שוב.'
        : raw;
    return { data: null, error: new Error(friendly) };
  }
}
