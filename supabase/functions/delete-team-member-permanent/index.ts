/**
 * מחיקה מלאה ובלתי הפיכה של חבר צוות (אופציונלית עם cascade על משתמשים שתחתיו).
 *
 * דרישות:
 *   • re-auth של המנהל המבצע (סיסמה).
 *   • אם המוחק הוא אדמין שיש תחתיו משתמשים (parent_admin_id / managed_by_user_id) —
 *     המשתמשים האלה נמחקים אוטומטית כקסקייד, וקישורי FK ב-vehicles / drivers /
 *     org_invitations / compliance_alerts מנוקים כדי ש-`auth.admin.deleteUser` לא
 *     ייכשל בגלל constraint.
 *   • שגיאות לקוח (סיסמה, הרשאה, פרמטרים) חוזרות 200 + `{error}` כדי שה-SDK לא
 *     יעטוף אותן ב-FunctionsHttpError גנרי.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
 * שגיאות לקוח חוזרות ב-200 עם גוף `{ error }` — ה-SDK של Supabase
 * עוטף 4xx ב-FunctionsHttpError גנרי שמסתיר את ההודעה האמיתית.
 */
function clientErrorResponse(message: string): Response {
  return jsonResponse(200, { error: message });
}

/**
 * הרצת DELETE מסונן בעמודה כלשהי. שגיאות "טבלה/עמודה לא קיימת" מתעלמים מהן בשקט,
 * כי הסכמה משתנה בין סביבות לקוח.
 */
async function safeDelete(
  admin: SupabaseClient,
  table: string,
  column: string,
  values: string[],
): Promise<void> {
  if (values.length === 0) return;
  try {
    const { error } = await admin.from(table).delete().in(column, values);
    if (error && !/does not exist|column .* does not exist/i.test(error.message)) {
      console.warn(`[delete-team-member-permanent] safeDelete ${table}.${column}`, error.message);
    }
  } catch (e) {
    console.warn(`[delete-team-member-permanent] safeDelete ${table}.${column} threw`, e);
  }
}

/**
 * עדכון עמודה ל-NULL כדי לשבור FK לפני מחיקת המשתמש. נופל בשקט אם
 * עמודה/טבלה לא קיימים בסביבה הזו.
 */
async function safeNullify(
  admin: SupabaseClient,
  table: string,
  column: string,
  values: string[],
): Promise<void> {
  if (values.length === 0) return;
  try {
    const { error } = await admin
      .from(table)
      .update({ [column]: null })
      .in(column, values);
    if (error && !/does not exist|column .* does not exist/i.test(error.message)) {
      console.warn(`[delete-team-member-permanent] safeNullify ${table}.${column}`, error.message);
    }
  } catch (e) {
    console.warn(`[delete-team-member-permanent] safeNullify ${table}.${column} threw`, e);
  }
}

/**
 * אוסף את כל ה-user_ids שצריך למחוק עם המנהל: פרופילים שיש בהם
 * `parent_admin_id` או `managed_by_user_id` שמצביעים אליו.
 */
async function collectSubordinateUserIds(
  admin: SupabaseClient,
  adminUserId: string,
): Promise<string[]> {
  const ids = new Set<string>();
  /** parent_admin_id */
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('parent_admin_id', adminUserId);
    if (!error && Array.isArray(data)) {
      for (const r of data as Array<{ id?: string }>) {
        if (r?.id && r.id !== adminUserId) ids.add(String(r.id));
      }
    }
  } catch {
    /* column may not exist */
  }
  /** managed_by_user_id */
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('managed_by_user_id', adminUserId);
    if (!error && Array.isArray(data)) {
      for (const r of data as Array<{ id?: string }>) {
        if (r?.id && r.id !== adminUserId) ids.add(String(r.id));
      }
    }
  } catch {
    /* column may not exist */
  }
  return Array.from(ids);
}

/**
 * מנקה את כל ה-FK הידועים שמצביעים על משתמשים שיוסרו, כדי שמחיקת
 * `auth.users` לא תיכשל בגלל constraint.
 */
async function nullifyKnownReferences(
  admin: SupabaseClient,
  userIds: string[],
): Promise<void> {
  /** vehicles / drivers — עמודות שעשויות להצביע על המנהל המוחק */
  for (const table of ['vehicles', 'drivers']) {
    await safeNullify(admin, table, 'managed_by_user_id', userIds);
    await safeNullify(admin, table, 'parent_admin_id', userIds);
    await safeNullify(admin, table, 'created_by', userIds);
    await safeNullify(admin, table, 'assigned_to', userIds);
    await safeNullify(admin, table, 'driver_user_id', userIds);
  }
  /** profiles עצמם (שלא יוסרו במחזור הזה) — מנתקים את הקישור להורה. */
  await safeNullify(admin, 'profiles', 'parent_admin_id', userIds);
  await safeNullify(admin, 'profiles', 'managed_by_user_id', userIds);
  /** הזמנות / התראות ציות / לוגים — ניתוק קישורים. */
  await safeNullify(admin, 'org_invitations', 'invited_by', userIds);
  await safeNullify(admin, 'compliance_alerts', 'assigned_to', userIds);
  await safeNullify(admin, 'compliance_alerts', 'created_by', userIds);
  await safeNullify(admin, 'audit_logs', 'user_id', userIds);
}

/**
 * מוחק את כל הרישומים של המשתמשים האלה ב-org_members / user_roles / memberships.
 * אחרי הפעולה הזו אפשר למחוק profiles ואחר כך auth.users.
 */
async function deleteMembershipRows(
  admin: SupabaseClient,
  userIds: string[],
): Promise<void> {
  await safeDelete(admin, 'org_members', 'user_id', userIds);
  await safeDelete(admin, 'user_roles', 'user_id', userIds);
  await safeDelete(admin, 'memberships', 'user_id', userIds);
}

async function deleteProfilesByAnyKey(
  admin: SupabaseClient,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  /** profiles.id == auth.uid ברוב הסביבות. ננסה גם user_id אם קיים. */
  await safeDelete(admin, 'profiles', 'id', userIds);
  await safeDelete(admin, 'profiles', 'user_id', userIds);
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

    /** אוספים את כל ה-user_ids שיוסרו: המנהל-היעד + כל מי שתחתיו (parent_admin_id / managed_by_user_id). */
    const subUsers = await collectSubordinateUserIds(admin, memberUserId);
    const allTargets = Array.from(new Set([memberUserId, ...subUsers]));
    /** הגנה: אסור למחוק את המבצע גם בקסקייד. */
    const targets = allTargets.filter((id) => id !== callerUid);
    if (targets.length === 0) {
      return clientErrorResponse('לא נמצאו משתמשים למחיקה');
    }

    console.log('[delete-team-member-permanent] cascade plan', {
      caller: callerUid,
      target: memberUserId,
      subordinates: subUsers,
      total: targets.length,
    });

    /** 1) נינטרל את כל ה-FK שמצביע על המשתמשים האלה (כך שלא ייכשל ה-DELETE). */
    await nullifyKnownReferences(admin, targets);

    /** 2) ננקה רישומי membership/role בכל הטבלאות הרלוונטיות. */
    await deleteMembershipRows(admin, targets);

    /** 3) ננקה profiles לפי id ולפי user_id (תאימות סכמות). */
    await deleteProfilesByAnyKey(admin, targets);

    /** 4) auth.users — אחד-אחד; שגיאה באחד לא עוצרת את האחרים. */
    const authErrors: Array<{ user_id: string; message: string }> = [];
    for (const uid of targets) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) {
        authErrors.push({ user_id: uid, message: error.message });
        console.error('[delete-team-member-permanent] auth.admin.deleteUser', uid, error.message);
      }
    }

    if (authErrors.length > 0 && authErrors.length === targets.length) {
      /** כל המחיקות נכשלו — נחזיר את הראשונה כשגיאה אמיתית. */
      return jsonResponse(500, {
        error: authErrors[0].message,
        failures: authErrors,
      });
    }

    return jsonResponse(200, {
      success: true,
      deleted: targets.length,
      subordinates_deleted: subUsers.length,
      partial_failures: authErrors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[delete-team-member-permanent]', message);
    return jsonResponse(500, { error: message });
  }
});
