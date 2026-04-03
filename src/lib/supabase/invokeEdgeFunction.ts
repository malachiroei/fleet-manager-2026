import { supabase, getSupabaseAnonKey } from '@/lib/supabase/client';

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
