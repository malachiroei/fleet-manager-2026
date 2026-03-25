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
};

/** Stub — הדיאלום המלא הוסר בגרסה זו; שומר על חתימת props לעמוד הצוות */
export function MemberAllowedFeaturesDialog({ open, onOpenChange, member }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>הרשאות גישה</DialogTitle>
          <DialogDescription>
            {member?.full_name || member?.email
              ? `עריכת הרשאות ל־${member.full_name || member.email} — לא זמין בגרסה זו.`
              : 'עריכת הרשאות — לא זמין בגרסה זו.'}
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
