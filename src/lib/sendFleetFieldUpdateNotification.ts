import { supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';

export type FleetFieldUpdateRow = { label: string; value: string };

/** אותה Edge Function כמו עמוד טיפול — כבר פרוסה בפרויקט; מצב `fleet_field` בגוף הבקשה */
const FUNCTION_NAME = 'send-service-update-notification';

/** מייל עדכון שדה (טסט / ביטוח / צמיגים וכו׳) — לא חוסם שמירה אם נכשל */
export async function sendFleetFieldUpdateNotification(params: {
  subject: string;
  headline?: string;
  plateNumber?: string;
  vehicleLabel?: string;
  rows: FleetFieldUpdateRow[];
  documentUrl?: string | null;
  to?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const body: Record<string, unknown> = {
    notificationType: 'fleet_field',
    to: params.to,
    subject: params.subject,
    headline: params.headline,
    plateNumber: params.plateNumber ?? '',
    vehicleLabel: params.vehicleLabel ?? '',
    rows: params.rows,
    documentUrl: params.documentUrl ?? null,
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
