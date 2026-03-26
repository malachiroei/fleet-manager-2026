import type { PermissionKey } from '@/lib/permissions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Profile } from '@/types/fleet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Profile | null;
  delegatorProfile: Profile | null | undefined;
  manifestChangeLines: string[];
  manifestReady: boolean;
  delegatorIsAdmin: boolean;
  delegatorIsManager: boolean;
  delegatorHasPermission: (key: PermissionKey) => boolean;
  orgId: string | null | undefined;
};

/** Stub — הדיאלום המלא הוסר בגרסה זו */
export function TeamMemberDelegationDialog({ open, onOpenChange, member }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>ניהול חבר צוות</DialogTitle>
          <DialogDescription>
            {member?.full_name || member?.email
              ? `ניהול עבור ${member.full_name || member.email} — לא זמין בגרסה זו.`
              : 'ניהול חבר צוות — לא זמין בגרסה זו.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
