import { useState } from 'react';
import { PERMISSION_KEYS, PERMISSION_LABELS, getDefaultPermissions } from '@/lib/permissions';
import type { ProfilePermissions } from '@/types/fleet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
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
  orgId,
  invitedBy,
  onSuccess,
}: SimpleInviteModalProps) {
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<ProfilePermissions>(getDefaultPermissions());
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !orgId) return;
    setIsPending(true);
    try {
      // Enforce report_mileage for all invited users (even if older clients omit it).
      const enforcedPerms: ProfilePermissions = { ...permissions, report_mileage: true };
      const { error } = await (supabase as any)
        .from('org_invitations')
        .insert({
          org_id: orgId,
          email: trimmed.toLowerCase(),
          permissions: enforcedPerms,
          invited_by: invitedBy,
        });

      if (error) throw error;

      let emailSent = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ org_id: orgId, email: trimmed.toLowerCase() }),
        });
        emailSent = res.ok;
      } catch {
        // Invite is saved; email failure is non-fatal, don't break UI
      }

      if (emailSent) {
        toast({ title: 'הזמנה נשלחה בהצלחה למייל' });
      } else {
        toast({ title: 'ההזמנה נשמרה', description: 'שליחת המייל נכשלה. ההזמנה נשמרה במערכת.' });
      }
      onSuccess?.();
      onOpenChange(false);
      setEmail('');
      setPermissions(getDefaultPermissions());
    } catch (err) {
      toast({
        title: 'שגיאה בשמירת ההזמנה',
        description: err instanceof Error ? err.message : String(err),
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
              שמור הזמנה
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
