import { supabase } from '@/integrations/supabase/client';
import { isLikelyUuid } from '@/lib/fleetUuid';

/**
 * בעל פלטפורמה שמזמין אדמין: ארגון היעד הוא הארגון הפעיל במסך (`contextOrgId`), כדי שהמוזמן
 * יקבל הרשאות אדמין רק על אותו צי. אם אין הקשר ארגון — נוצר ארגון חדש להשכרה נפרדת.
 */
export async function resolveOrgIdForTeamInvite(options: {
  inviterIsPlatformOwner: boolean;
  inviteRole: 'admin' | 'driver';
  /** ארגון הקשר ב-UI (מנהל צוות / מתג ארגון) — משמש רק כשלא נוצר ארגון חדש */
  contextOrgId: string;
  inviteEmail: string;
}): Promise<{ orgId: string | null; error: string | null }> {
  const ctx = String(options.contextOrgId ?? '').trim();
  if (options.inviterIsPlatformOwner && options.inviteRole === 'admin') {
    if (ctx && isLikelyUuid(ctx)) {
      return { orgId: ctx, error: null };
    }
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
    if (!id || String(id).trim() === '') {
      return { orgId: null, error: 'יצירת ארגון חדשה לא החזירה מזהה.' };
    }
    return { orgId: String(id).trim(), error: null };
  }
  if (!ctx) {
    return { orgId: null, error: 'חסר ארגון' };
  }
  return { orgId: ctx, error: null };
}
