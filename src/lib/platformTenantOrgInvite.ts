import { supabase } from '@/integrations/supabase/client';
import { isLikelyUuid } from '@/lib/fleetUuid';

/**
 * בעל פלטפורמה שמזמין אדמין חדש (לקוח חדש) — תמיד נוצר ארגון *חדש* באמצעות
 * RPC `create_organization_for_platform_tenant`. ה-`contextOrgId` (הארגון
 * שמוצג כעת בסוויצ'ר העליון) **לא** משמש כיעד, אחרת המוזמן היה יורש את הצי
 * שעליו צופה מנהל הפלטפורמה — בדיוק התקלה שדווחה. עבור אדמין רגיל שמזמין
 * חבר צוות — היעד תמיד `contextOrgId` (הארגון של המזמין).
 */
export async function resolveOrgIdForTeamInvite(options: {
  inviterIsPlatformOwner: boolean;
  inviteRole: 'admin' | 'driver';
  /** ארגון הקשר ב-UI (מנהל צוות / מתג ארגון) — נדרש רק להזמנת חבר צוות רגיל */
  contextOrgId: string;
  inviteEmail: string;
}): Promise<{ orgId: string | null; error: string | null }> {
  const ctx = String(options.contextOrgId ?? '').trim();
  if (options.inviterIsPlatformOwner && options.inviteRole === 'admin') {
    /**
     * תמיד יוצרים ארגון חדש למוזמן — ללא קשר לארגון המוצג בסוויצ'ר.
     * זה מבטיח בידוד מלא בין דיירים, ושמנהל הפלטפורמה לא חולק נתונים עם
     * אדמינים שהוא הזמין.
     */
    const local = options.inviteEmail.trim().toLowerCase().split('@')[0] || 'tenant';
    const pName = `צי ${local}`;
    const { data, error } = await (supabase as any).rpc('create_organization_for_platform_tenant', {
      p_name: pName,
    });
    if (error) {
      return {
        orgId: null,
        error:
          error.message ??
          'יצירת ארגון חדש נכשלה. ודא שהמיגרציה create_organization_for_platform_tenant הוחלה בפרויקט.',
      };
    }
    const id = typeof data === 'string' ? data : (data as string | null);
    if (!id || String(id).trim() === '' || !isLikelyUuid(String(id).trim())) {
      return { orgId: null, error: 'יצירת ארגון חדשה לא החזירה מזהה.' };
    }
    return { orgId: String(id).trim(), error: null };
  }
  if (!ctx) {
    return { orgId: null, error: 'חסר ארגון' };
  }
  return { orgId: ctx, error: null };
}
