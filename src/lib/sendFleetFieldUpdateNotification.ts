import { supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import type { NotificationEmailTopicId } from '@/lib/notificationEmailRouting';

export type FleetFieldUpdateRow = { label: string; value: string };

/** אותה Edge Function כמו עמוד טיפול — כבר פרוסה בפרויקט; מצב `fleet_field` בגוף הבקשה */
const FUNCTION_NAME = 'send-service-update-notification';

/** מייל עדכון שדה (טסט / ביטוח / צמיגים וכו׳) — לא חוסם שמירה אם נכשל */
export async function sendFleetFieldUpdateNotification(params: {
  /** לאיחוד ניתוב מיילים per-admin */
  orgId?: string | null;
  /** נושא לניהול הרשאות מייל בהגדרות מערכת */
  emailTopic: NotificationEmailTopicId;
  subject: string;
  headline?: string;
  plateNumber?: string;
  vehicleLabel?: string;
  rows: FleetFieldUpdateRow[];
  documentUrl?: string | null;
  to?: string;
  /** כפתור CTA בתחתית המייל (טופס חיצוני) */
  primaryLinkUrl?: string;
  primaryLinkLabel?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const body: Record<string, unknown> = {
    notificationType: 'fleet_field',
    emailTopic: params.emailTopic,
    orgId: params.orgId?.trim() || undefined,
    to: params.to,
    subject: params.subject,
    headline: params.headline,
    plateNumber: params.plateNumber ?? '',
    vehicleLabel: params.vehicleLabel ?? '',
    rows: params.rows,
    documentUrl: params.documentUrl ?? null,
    primaryLinkUrl: params.primaryLinkUrl,
    primaryLinkLabel: params.primaryLinkLabel,
  };

  try {
    await supabase.auth.refreshSession();
  } catch {
    // Bearer ייפול חזרה ל-anon ב-invoke
  }

  try {
    const invokeResult = await invokeSupabaseEdgeFunction(FUNCTION_NAME, body);
    if (invokeResult.error) {
      return { ok: false, message: invokeResult.error.message ?? String(invokeResult.error) };
    }
    const payload = invokeResult.data as { error?: string; success?: boolean } | null;
    if (payload?.error) {
      return { ok: false, message: String(payload.error).slice(0, 400) };
    }
    if (!payload || payload.success !== true) {
      return { ok: false, message: 'תשובה לא צפויה מהשרת (לא אושרה שליחת מייל).' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'שליחת מייל נכשלה' };
  }
}
