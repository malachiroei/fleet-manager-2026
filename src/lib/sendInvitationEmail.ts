/**
 * שליחת מייל הזמנה דרך Edge Function `send-invite` (Resend בצד השרת).
 *
 * אימות ל-Edge Function:
 * 1) **קודם** `VITE_SUPABASE_SERVICE_ROLE_KEY` (מעקף 401 כשמוגדר ב־`.env.local`) — **רק מקומי/סטייג'ינג**; לא לפרסם לפרודקשן
 * 2) אחרת: JWT מהסשן (עם refresh)
 * 3) גיבוי: anon key
 *
 * חובה גם header `apikey` (מפתח ה-anon של הפרויקט).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  getSupabaseAnonKey,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '@/integrations/supabase/publicEnv';
import { toast } from 'sonner';

export type SendInvitationEmailResult = { ok: true } | { ok: false; error: string };

function anonKeyForFunctions(): string {
  return getSupabaseAnonKey() || getSupabasePublishableKey() || '';
}

/**
 * מפתח service role מה-ENV (Vite) — לשימוש **מקומי בלבד** כשהסשן לא מוזרק.
 * לא להגדיר במפתחות NEXT_PUBLIC_* בפרודקשן.
 */
function serviceRoleKeyFromEnv(): string {
  return String(import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

function logFullErrorContext(label: string, err: unknown, extra?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { label, ...extra };
  if (err instanceof Error) {
    payload.name = err.name;
    payload.message = err.message;
    payload.stack = err.stack;
  }
  const ctx = err as { context?: unknown };
  if (ctx?.context != null) payload.context = ctx.context;
  console.log('Full Error Context:', payload);
}

function notifyError(message: string, err?: unknown, extra?: Record<string, unknown>) {
  const trimmed = message.trim() || 'שליחת מייל ההזמנה נכשלה';
  if (err != null || extra) {
    logFullErrorContext('sendInvitationEmail', err ?? new Error(trimmed), { toastMessage: trimmed, ...extra });
  }
  toast.error(trimmed);
}

/** מנסה לחלץ הודעה מגוף JSON או מ-context של שגיאת Functions */
function extractServerErrorMessage(
  invokeErr: unknown,
  data: { error?: string; message?: string } | null | undefined,
  rawBody?: string,
): string {
  if (data && typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }
  if (data && typeof (data as { message?: string }).message === 'string' && (data as { message: string }).message.trim()) {
    return (data as { message: string }).message.trim();
  }
  if (rawBody) {
    try {
      const j = JSON.parse(rawBody) as { error?: string; message?: string };
      if (typeof j.error === 'string' && j.error.trim()) return j.error.trim();
      if (typeof j.message === 'string' && j.message.trim()) return j.message.trim();
    } catch {
      if (rawBody.trim()) return rawBody.trim().slice(0, 500);
    }
  }
  if (invokeErr && typeof invokeErr === 'object') {
    const ctx = (invokeErr as { context?: { body?: unknown } }).context;
    const body = ctx?.body;
    if (typeof body === 'string' && body.trim()) {
      try {
        const j = JSON.parse(body) as { error?: string; message?: string };
        if (typeof j.error === 'string' && j.error.trim()) return j.error.trim();
        if (typeof j.message === 'string' && j.message.trim()) return j.message.trim();
      } catch {
        return body.trim().slice(0, 500);
      }
    }
  }
  if (invokeErr instanceof Error && invokeErr.message) {
    return invokeErr.message;
  }
  return 'שליחת מייל ההזמנה נכשלה';
}

async function resolveAuthorizationBearer(anon: string): Promise<string> {
  const serviceRole = serviceRoleKeyFromEnv();
  if (serviceRole && serviceRole !== 'your_secret_key_here') {
    console.warn(
      '[sendInvitationEmail] Authorization = service_role מ-VITE_SUPABASE_SERVICE_ROLE_KEY — מקומי/סטייג\'ינג בלבד',
    );
    return serviceRole;
  }

  let {
    data: { session },
  } = await supabase.auth.getSession();
  let token = session?.access_token;

  if (!token) {
    await supabase.auth.refreshSession();
    ({
      data: { session },
    } = await supabase.auth.getSession());
    token = session?.access_token;
  }

  if (token) {
    return token;
  }

  return anon;
}

/**
 * מפעיל את `send-invite` עם Authorization תקין + apikey.
 */
export async function sendInvitationEmail(params: {
  orgId: string;
  email: string;
}): Promise<SendInvitationEmailResult> {
  const orgId = params.orgId.trim();
  const email = params.email.trim().toLowerCase();
  if (!orgId || !email || !email.includes('@')) {
    const msg = 'חסר org_id או אימייל תקין';
    notifyError(msg);
    return { ok: false, error: msg };
  }

  const anon = anonKeyForFunctions();
  if (!anon) {
    const msg = 'חסר מפתח Supabase (anon/publishable) — לא ניתן לקרוא ל-send-invite';
    console.error('[sendInvitationEmail]', msg);
    notifyError(msg);
    return { ok: false, error: msg };
  }

  const authBearer = await resolveAuthorizationBearer(anon);
  const sr = serviceRoleKeyFromEnv();

  const body = {
    org_id: orgId,
    email,
    app_origin: typeof window !== 'undefined' ? window.location.origin : '',
  };

  const invokeHeaders: Record<string, string> = {
    Authorization: `Bearer ${authBearer}`,
    apikey: anon,
  };

  console.log('[sendInvitationEmail] before invoke', {
    function: 'send-invite',
    orgId,
    emailPreview: `${email.slice(0, 2)}***@${email.split('@')[1] ?? '?'}`,
    authKind: authBearer === anon ? 'anon' : authBearer === sr ? 'service_role_env' : 'session_jwt',
  });

  const invokeResult = await supabase.functions.invoke('send-invite', {
    headers: invokeHeaders,
    body,
  });

  const invokeErr = invokeResult.error;
  const data = invokeResult.data as { error?: string; message?: string } | null | undefined;

  console.log('[sendInvitationEmail] after invoke', {
    hasSdkError: Boolean(invokeErr),
    sdkErrorMessage: invokeErr instanceof Error ? invokeErr.message : invokeErr ? String(invokeErr) : null,
    responseData: data,
  });

  if (!invokeErr) {
    const bodyErr =
      data && typeof data.error === 'string' && data.error.length > 0 ? data.error : null;
    if (bodyErr) {
      logFullErrorContext('invoke response body error', invokeErr, { bodyErr, data });
      notifyError(bodyErr, invokeErr, { data });
      return { ok: false, error: bodyErr };
    }
    return { ok: true };
  }

  logFullErrorContext('invoke SDK error', invokeErr, { data });

  // נסיון חוזר ב־HTTP — לפעמים ה-SDK מדווח שגיאה גנרית למרות שהפונקציה זמינה
  try {
    const baseUrl = getSupabaseUrl().replace(/\/$/, '');
    const endpoint = `${baseUrl}/functions/v1/send-invite`;
    console.log('[sendInvitationEmail] fetch fallback start', { endpoint });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${authBearer}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('[sendInvitationEmail] fetch fallback done', { status: res.status, bodyPreview: text.slice(0, 200) });
    let parsed: { error?: string; message?: string } | null = null;
    try {
      parsed = JSON.parse(text) as { error?: string; message?: string };
    } catch {
      /* raw text */
    }
    if (res.ok && !parsed?.error) {
      return { ok: true };
    }
    const parsedErr = typeof parsed?.error === 'string' ? parsed.error.trim() : '';
    const detail =
      parsedErr ||
      text.trim().slice(0, 400) ||
      extractServerErrorMessage(invokeErr, data, undefined) ||
      `HTTP ${res.status}`;
    logFullErrorContext('fetch fallback failed', invokeErr, { status: res.status, detail, responseText: text.slice(0, 500) });
    notifyError(detail, invokeErr, { status: res.status, body: text.slice(0, 500) });
    return { ok: false, error: detail };
  } catch (e) {
    const thrown = e instanceof Error ? e.message : String(e);
    const msg = extractServerErrorMessage(invokeErr, data, undefined) || thrown;
    logFullErrorContext('fetch fallback threw', e, { invokeErr, msg });
    notifyError(msg, e, { invokeErr });
    return { ok: false, error: msg };
  }
}
