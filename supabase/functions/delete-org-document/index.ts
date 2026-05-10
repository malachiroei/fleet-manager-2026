/**
 * Hard-delete של מסמך/י טופס מ-`public.org_documents` ומ-Supabase Storage.
 *
 * למה Edge Function ולא DELETE ישיר מהלקוח?
 *   ב-RLS של פרודקשן יש תרחישים שבהם המדיניות חוסמת בשקט (חזרה של 0 שורות
 *   בלי שגיאה) — בעיקר עבור platform owner שה-`profiles.org_id` שלו לא תואם
 *   ל-`user_belongs_to_org`, או כש-`can_org_admin_write` עוד לא הוטמע
 *   במלואו. שימוש ב-service role עוקף את כל זה ומוודא שמחיקה מצליחה כשהקריאה
 *   הגיעה ממשתמש מורשה (platform owner / fleet staff).
 *
 * פרוטוקול:
 *   POST { ids: string[], password?: string }
 *   - מחזיר 200 + { error } לטעויות לקוח (ה-SDK עוטף 4xx ב-FunctionsHttpError גנרי)
 *   - מחזיר 200 + { ok: true, deleted: number, storage_removed: number, failures: [...] }
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORAGE_BUCKET = 'vehicle-documents';
const ADMIN_PASSWORD = '2101';

const PLATFORM_OWNER_EMAILS = new Set([
  'malachiroei@gmail.com',
]);

const INVITE_OWNER_EMAILS = new Set([
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com',
  'ravid.malachi@gmail.com',
]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** שגיאות לקוח חוזרות ב-200 עם גוף `{ error }` כדי לא להיתקע ב-FunctionsHttpError גנרי. */
function clientErrorResponse(message: string): Response {
  return jsonResponse(200, { error: message });
}

/** חילוץ נתיב ה-Storage מתוך `file_url` ציבורי או חתום. */
function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(
      new RegExp(`/storage/v1/object/(?:public|sign)/${STORAGE_BUCKET}/(.+)$`),
    );
    if (m && m[1]) return decodeURIComponent(m[1].split('?')[0]);
    return null;
  } catch {
    return null;
  }
}

/**
 * האם המשתמש המחובר רשאי למחוק טפסים?
 * - platform owner תמיד.
 * - בעלי תפקיד admin / fleet_manager או הרשאת manage_team / admin_access ב-profile.
 */
async function callerMayDeleteForms(
  admin: SupabaseClient,
  uid: string,
  jwtEmail: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const emailNorm = (jwtEmail ?? '').trim().toLowerCase();
  if (PLATFORM_OWNER_EMAILS.has(emailNorm)) {
    return { allowed: true };
  }

  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select('email, permissions')
    .eq('id', uid)
    .maybeSingle();
  if (pErr) console.warn('[delete-org-document] profile lookup', pErr.message);

  const profileEmail = String((prof as { email?: string } | null)?.email ?? '')
    .trim()
    .toLowerCase();
  const effectiveEmail = profileEmail || emailNorm;

  if (PLATFORM_OWNER_EMAILS.has(effectiveEmail)) return { allowed: true };
  if (INVITE_OWNER_EMAILS.has(effectiveEmail)) return { allowed: true };

  const perms = (prof as { permissions?: Record<string, unknown> } | null)?.permissions ?? null;
  const manageTeam = Boolean(perms && typeof perms === 'object' && (perms as { manage_team?: boolean }).manage_team === true);
  const adminAccess = Boolean(perms && typeof perms === 'object' && (perms as { admin_access?: boolean }).admin_access === true);
  if (manageTeam || adminAccess) return { allowed: true };

  const { data: roles, error: rErr } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', uid);
  if (rErr) console.warn('[delete-org-document] user_roles', rErr.message);
  const roleList = (roles ?? []) as { role?: string }[];
  if (roleList.some((r) => r.role === 'admin' || r.role === 'fleet_manager')) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'לא הוגדרה הרשאה למחיקת טפסים' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: { ids?: unknown; id?: unknown; password?: unknown };
    try {
      body = (await req.json()) as { ids?: unknown; id?: unknown; password?: unknown };
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    /** מקבלים `ids: string[]` או `id: string` יחיד. */
    let ids: string[] = [];
    if (Array.isArray(body.ids)) {
      ids = (body.ids as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (typeof body.id === 'string') {
      const t = body.id.trim();
      if (t) ids = [t];
    }
    if (ids.length === 0) {
      return clientErrorResponse('פרמטר חסר: ids/id');
    }

    /** סיסמת מנהל לאישור פעולת ההרס. */
    const password = typeof body.password === 'string' ? body.password : '';
    if (password !== ADMIN_PASSWORD) {
      return clientErrorResponse('סיסמת מנהל שגויה');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: 'Server misconfigured' });
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = bearerMatch?.[1]?.trim() ?? '';
    if (!accessToken) {
      return clientErrorResponse('נדרשת התחברות מחדש');
    }

    /** אימות הקורא דרך client אנונימי + JWT. */
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(accessToken);
    const callerUid = userData?.user?.id ?? '';
    const callerEmail = userData?.user?.email ?? '';
    if (userErr || !callerUid) {
      return clientErrorResponse('סשן פג תוקף — יש להתחבר מחדש');
    }

    /** Admin client ב-service role — עוקף RLS לחלוטין. */
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const perm = await callerMayDeleteForms(admin, callerUid, callerEmail);
    if (!perm.allowed) {
      return clientErrorResponse(perm.reason ?? 'אין הרשאה למחיקת טפסים');
    }

    /** טעינת file_url לכל מזהה (לפני המחיקה) כדי לאסוף נתיבים ל-Storage. */
    const { data: rows, error: loadErr } = await admin
      .from('org_documents')
      .select('id, file_url')
      .in('id', ids);
    if (loadErr) {
      return jsonResponse(500, { error: `load failed: ${loadErr.message}` });
    }
    const idToFileUrl = new Map<string, string | null>();
    for (const r of (rows ?? []) as Array<{ id: string; file_url: string | null }>) {
      idToFileUrl.set(r.id, r.file_url ?? null);
    }

    /** DELETE רב-שורתי דרך service role. */
    const failures: { id: string; message: string }[] = [];
    let deleted = 0;
    {
      const { data: deletedRows, error: delErr } = await admin
        .from('org_documents')
        .delete()
        .in('id', ids)
        .select('id');
      if (delErr) {
        return jsonResponse(500, { error: `delete failed: ${delErr.message}` });
      }
      deleted = Array.isArray(deletedRows) ? deletedRows.length : 0;
      const deletedSet = new Set((deletedRows ?? []).map((r) => (r as { id: string }).id));
      for (const id of ids) {
        if (!deletedSet.has(id)) {
          failures.push({ id, message: 'לא נמצאה שורה תואמת ב-org_documents' });
        }
      }
    }

    /** ניקוי ה-Storage — best effort, לא נכשלים אם הקובץ כבר לא קיים. */
    let storageRemoved = 0;
    const pathsToRemove: string[] = [];
    for (const id of ids) {
      const path = storagePathFromPublicUrl(idToFileUrl.get(id) ?? null);
      if (path) pathsToRemove.push(path);
    }
    if (pathsToRemove.length > 0) {
      try {
        const { data: removed, error: rmErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .remove(pathsToRemove);
        if (rmErr) {
          console.warn('[delete-org-document] storage remove failed', rmErr.message);
        } else {
          storageRemoved = Array.isArray(removed) ? removed.length : 0;
        }
      } catch (e) {
        console.warn('[delete-org-document] storage remove threw', e);
      }
    }

    return jsonResponse(200, {
      ok: true,
      deleted,
      storage_removed: storageRemoved,
      failures,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unexpected error';
    console.error('[delete-org-document] fatal', message);
    return jsonResponse(500, { error: message });
  }
});
