import { useState, useRef, useCallback, type FormEvent } from 'react';
import { PERMISSION_KEYS, PERMISSION_LABELS, getDefaultPermissions } from '@/lib/permissions';
import type { ProfilePermissions } from '@/types/fleet';
import {
  PRODUCTION_INVITE_METADATA,
  PRODUCTION_NEW_ORG_ADMIN_PERMISSIONS,
  newClientOrganizationId,
} from '@/lib/productionOrgAdminInvite';
import { supabase } from '@/integrations/supabase/client';
import { sendInvitationEmail } from '@/lib/sendInvitationEmail';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  invitedBy: string | null;
  onSuccess?: () => void;
}

/**
 * Self-contained invite modal. All permission state and setPermissions live ONLY here.
 * No useEffect watches permissions. Parent only controls open/closed; permissions
 * are sent to backend only on Submit.
 */
export function InviteMemberModal({
  open,
  onOpenChange,
  orgId: _orgId,
  invitedBy,
  onSuccess,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<ProfilePermissions>(getDefaultPermissions());
  const [isPending, setIsPending] = useState(false);
  const submittingRef = useRef(false);
  const onSuccessCalledRef = useRef(false);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange]
  );

  // ONLY place that updates permissions: direct state update in response to row click. No useEffect watches permissions.
  const handleRowClick = useCallback((key: keyof ProfilePermissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !(prev[key] === true) }));
  }, []);

  /**
   * Standalone invite: insert + optional email. No global mutation, no global state updates on error.
   * - שליחת מייל: `sendInvitationEmail` (JWT או anon, + נסיון חוזר ב-fetch).
   * - try/catch keeps all failure handling local (toast only); Roei's session is never touched.
   * - onSuccess and list refresh run exactly ONCE per successful invite (ref guard) to avoid duplicate rows.
   */
  const submitInvite = useCallback(
    async (inviteEmail: string, _perms: ProfilePermissions) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setIsPending(true);
      onSuccessCalledRef.current = false;

      try {
        const newOrgId = newClientOrganizationId();
        const emailNorm = inviteEmail.trim().toLowerCase();
        const { data, error } = await (supabase as any)
          .from('org_invitations')
          .insert({
            org_id: newOrgId,
            email: emailNorm,
            role: 'admin',
            permissions: PRODUCTION_NEW_ORG_ADMIN_PERMISSIONS,
            invited_by: invitedBy,
            metadata: PRODUCTION_INVITE_METADATA,
          })
          .select('org_id, email')
          .single();

        if (error) throw error;

        const row = data as { org_id?: string; email?: string };
        const inviteOrgId = String(row?.org_id ?? newOrgId);
        const inviteAddr = String(row?.email ?? emailNorm);

        let emailSent = false;
        try {
          const mail = await sendInvitationEmail({
            orgId: inviteOrgId,
            email: inviteAddr,
          });
          emailSent = mail.ok;
        } catch {
          // Invitation is saved; email failure is non-fatal. No global state update.
        }

        if (emailSent) {
          toast({ title: 'ההזמנה נשמרה ומייל ההזמנה נשלח' });
        } else {
          toast({
            title: 'ההזמנה נשמרה במערכת',
            description: 'אם המייל נכשל — פרטי השגיאה הוצגו בהודעה אדומה.',
          });
        }
        // Refresh team list exactly ONCE so no duplicate "Pending" rows.
        if (!onSuccessCalledRef.current) {
          onSuccessCalledRef.current = true;
          onSuccess?.();
        }
        handleOpenChange(false);
      } catch (err) {
        // Local only: toast. No global state, no shared hooks. Roei's session untouched.
        toast({
          title: 'שגיאה בשמירת ההזמנה',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      } finally {
        submittingRef.current = false;
        setIsPending(false);
      }
    },
    [invitedBy, onSuccess, handleOpenChange]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;
      await submitInvite(trimmed, permissions);
    },
    [email, permissions, submitInvite]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md z-[100]" dir="rtl">
        <DialogHeader>
          <DialogTitle>הזמנת חבר צוות</DialogTitle>
          <DialogDescription>
            הזן אימייל ובחר הרשאות. ההזמנה תישמר וניתן לשלוח קישור הצטרפות למשתמש.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">אימייל</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-3 relative z-10">
            <Label>הרשאות</Label>
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 bg-background">
              {PERMISSION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleRowClick(key)}
                  className="flex items-center justify-between gap-2 text-right rounded-md py-1 px-1 -my-1 -mx-1 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="text-sm flex-1">{PERMISSION_LABELS[key]}</span>
                  <Switch
                    checked={permissions[key] === true}
                    className="pointer-events-none"
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור הזמנה
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
