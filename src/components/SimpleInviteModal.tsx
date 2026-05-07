import { useState, type FormEvent } from 'react';
import { PERMISSION_KEYS, PERMISSION_LABELS, getDefaultPermissions } from '@/lib/permissions';
import type { ProfilePermissions } from '@/types/fleet';
import { supabase } from '@/integrations/supabase/client';
import { sendInvitationEmail } from '@/lib/sendInvitationEmail';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { isSuperAdminPermissionBypass } from '@/lib/allowedFeatures';
import { resolveOrgIdForTeamInvite } from '@/lib/platformTenantOrgInvite';
import { formatSupabaseLikeError } from '@/lib/supabaseErrorMessage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface SimpleInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  invitedBy: string | null;
  onSuccess?: () => void;
}

/**
 * Isolated invite modal: HTML form + checkboxes only. No Radix Switch, no useEffect.
 * Manages its own state. Calls Supabase insert on submit.
 */
export function SimpleInviteModal({
  open,
  onOpenChange,
  orgId: _orgId,
  invitedBy,
  onSuccess,
}: SimpleInviteModalProps) {
  const { profile } = useAuth();
  const inviterIsPlatformOwner = isSuperAdminPermissionBypass(profile);
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<ProfilePermissions>(getDefaultPermissions());
  const [isPending, setIsPending] = useState(false);

  const inviteRole: 'admin' | 'driver' = inviterIsPlatformOwner ? 'admin' : 'driver';
  const effectivePermissions: ProfilePermissions = inviterIsPlatformOwner
    ? { ...permissions, manage_team: true, admin_access: true, report_mileage: true }
    : {
        ...permissions,
        manage_team: false,
        admin_access: false,
        report_mileage: true,
      };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setIsPending(true);
    try {
      const contextOrgId = String(_orgId ?? '').trim();
      const emailNorm = trimmed.toLowerCase();
      const { orgId: targetOrgId, error: orgResolveError } = await resolveOrgIdForTeamInvite({
        inviterIsPlatformOwner,
        inviteRole,
        contextOrgId,
        inviteEmail: emailNorm,
      });
      if (orgResolveError || !targetOrgId) {
        toast({
          title: 'חסר ארגון או יצירת ארגון נכשלה',
          description:
            orgResolveError ??
            'לא ניתן לשמור הזמנה בלי מזהה ארגון. בחר ארגון פעיל או רענן את הדף.',
          variant: 'destructive',
        });
        return;
      }
      const permsPayload = effectivePermissions;
      /** Platform super admin invitation ⇒ a brand-new org is created for the invitee
       *  (already pre-allocated by `resolveOrgIdForTeamInvite`). The flag tells the
       *  signup pipeline that the org is dedicated to the new admin, not a join. */
      const createsNewOrg = inviterIsPlatformOwner && inviteRole === 'admin';
      const { data: inserted, error } = await (supabase as any)
        .from('org_invitations')
        .insert({
          org_id: targetOrgId,
          email: emailNorm,
          role: inviteRole,
          permissions: permsPayload,
          invited_by: invitedBy,
          creates_new_org: createsNewOrg,
        })
        .select('org_id, email')
        .single();

      if (error) throw error;

      const inviteOrgId = String((inserted as { org_id?: string })?.org_id ?? targetOrgId);
      const inviteEmail = String((inserted as { email?: string })?.email ?? emailNorm);

      let emailSent = false;
      try {
        const mail = await sendInvitationEmail({
          orgId: inviteOrgId,
          email: inviteEmail,
        });
        emailSent = mail.ok;
      } catch {
        // Invite is saved; email failure is non-fatal, don't break UI
      }

      if (emailSent) {
        toast({ title: 'הזמנה נשלחה בהצלחה למייל' });
      } else {
        toast({
          title: 'ההזמנה נשמרה במערכת',
          description: 'אם המייל נכשל — פרטי השגיאה הוצגו בהודעה אדומה.',
        });
      }
      onSuccess?.();
      onOpenChange(false);
      setEmail('');
      setPermissions(getDefaultPermissions());
    } catch (err) {
      toast({
        title: 'שגיאה בשמירת ההזמנה',
        description: formatSupabaseLikeError(err),
        variant: 'destructive',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[100]" dir="rtl">
        <DialogHeader>
          <DialogTitle>הזמנת חבר צוות</DialogTitle>
          <DialogDescription>
            הזן אימייל ובחר הרשאות. ההזמנה תישמר.
            {inviterIsPlatformOwner && inviteRole === 'admin' ? (
              <span className="mt-2 block text-amber-200/90">
                כחשבון על: לארגון של אדמין חדש נוצר ארגון נפרד אוטומטית — לא משויך לארגון שבו אתה צופה כרגע.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="simple-invite-email" className="text-sm font-medium">
              אימייל
            </label>
            <input
              id="simple-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              dir="ltr"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-3">
            <span className="text-sm font-medium">הרשאות</span>
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 bg-background">
              {PERMISSION_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer text-sm text-right"
                >
                  <input
                    type="checkbox"
                    checked={permissions[key] === true}
                    onChange={(e) =>
                      setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שלח הזמנה
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
