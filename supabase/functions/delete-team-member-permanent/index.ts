/**
 * מחיקה מלאה של משתמש מהמערכת — דורש את סיסמת המנהל המבצע (re-auth).
 * נכלל מחיקה מ-auth.users וגם ניקוי אקטיבי של profiles / org_members / user_roles
 * (גם אם FK המוגדר אינו cascade ב-DB של הלקוח). הפעולה בלתי הפיכה: כדי לחזור,
 * המשתמש יידרש לבצע הרשמה מחדש.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerMayManageOrgForTeamActions } from '../_shared/teamAdminActionPermission.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * שגיאות ולידציה (סיסמה לא נכונה, חוסר הרשאה, פרמטרים חסרים) חוזרות ב-200
 * עם גוף `{ error }` כדי ש-supabase-js לא יעטוף אותן ב-FunctionsHttpError
 * גנרי (שלא נושא את ההודעה האמיתית). שגיאות שרת אמיתיות נשארות 5xx.
 */
function clientErrorResponse(message: string): Response {
  return jsonResponse(200, { error: message });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: { org_id?: string; member_user_id?: string; password?: string };
    try {
      body = (await req.json()) as {
        org_id?: string;
        member_user_id?: string;
        password?: string;
      };
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const orgId = typeof body.org_id === 'string' ? body.org_id.trim() : '';
    const memberUserId = typeof body.member_user_id === 'string' ? body.member_user_id.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!orgId || !memberUserId || !password) {
      return clientErrorResponse('פרמטרים חסרים: org_id, member_user_id או password');
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

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(accessToken);
    const callerUid = userData?.user?.id ?? '';
    const callerEmail = userData?.user?.email ?? '';
    if (userErr || !callerUid || !callerEmail) {
      return clientErrorResponse('סשן פג תוקף — יש להתחבר מחדש');
    }
    if (callerUid === memberUserId) {
      return clientErrorResponse('לא ניתן למחוק את עצמך');
    }

    const reauth = await authClient.auth.signInWithPassword({
      email: callerEmail,
      password,
    });
    if (reauth.error || !reauth.data?.user) {
      console.warn('[delete-team-member-permanent] reauth failed', {
        email: callerEmail,
        message: reauth.error?.message,
      });
      return clientErrorResponse('סיסמה שגויה — יש להזין את הסיסמה האישית שלך לחשבון זה');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const allowed = await callerMayManageOrgForTeamActions(admin, callerUid, orgId, callerEmail);
    if (!allowed) {
      return clientErrorResponse('אין לך הרשאה למחוק חברים מארגון זה');
    }

    /** ננקה גם רשומות שאינן בהכרח cascade — בסדר עם FK ב-DB של הלקוח. */
    const cleanupTables: { table: string; column: string }[] = [
      { table: 'org_members', column: 'user_id' },
      { table: 'user_roles', column: 'user_id' },
      { table: 'memberships', column: 'user_id' },
    ];
    for (const t of cleanupTables) {
      const { error } = await admin.from(t.table).delete().eq(t.column, memberUserId);
      if (error && !/does not exist/i.test(error.message)) {
        console.warn(`[delete-team-member-permanent] cleanup ${t.table} failed`, error.message);
      }
    }

    /** profiles.id == auth.uid; אבל יש פרויקטים עם user_id במקום — ננסה את שתיהן. */
    const profilesById = await admin.from('profiles').delete().eq('id', memberUserId);
    if (profilesById.error) {
      console.warn('[delete-team-member-permanent] profiles delete by id failed', profilesById.error.message);
    }
    const profilesByUserId = await admin.from('profiles').delete().eq('user_id', memberUserId);
    if (profilesByUserId.error && !/does not exist/i.test(profilesByUserId.error.message)) {
      console.warn(
        '[delete-team-member-permanent] profiles delete by user_id failed',
        profilesByUserId.error.message,
      );
    }

    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(memberUserId);
    if (authDeleteErr) {
      console.error('[delete-team-member-permanent] auth admin deleteUser', authDeleteErr.message);
      return jsonResponse(500, { error: authDeleteErr.message });
    }

    return jsonResponse(200, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[delete-team-member-permanent]', message);
    return jsonResponse(500, { error: message });
  }
});
