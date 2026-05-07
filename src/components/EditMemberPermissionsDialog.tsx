import { useEffect, useMemo, useState } from 'react';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  getDefaultPermissions,
  type PermissionKey,
} from '@/lib/permissions';
import type { Profile, ProfilePermissions } from '@/types/fleet';
import { useUpdateMemberPermissions } from '@/hooks/useTeam';
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Profile | null;
};

/**
 * דיאלוג עריכת הרשאות-בסיס של חבר צוות (`profiles.permissions`). מאפשר לאדמין
 * לשנות אחרי שהמשתמש כבר רשום, כך שגם פיצ'רים שכבויים בהזמנה אפשר לפתוח חזרה.
 */
export function EditMemberPermissionsDialog({ open, onOpenChange, member }: Props) {
  const updatePermissions = useUpdateMemberPermissions();

  /**
   * נקודת התחלה: ההרשאות הנוכחיות של המשתמש; אם חסר/ריק — ברירות מחדל מלאות
   * כדי שהאדמין יראה את כל המתגים פעילים ויוכל לכבות בורר.
   */
  const initial = useMemo<ProfilePermissions>(() => {
    const raw = member?.permissions;
    if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
      return PERMISSION_KEYS.reduce<ProfilePermissions>((acc, key) => {
        acc[key] =
          (raw as Record<string, unknown>)[key] === true
            ? true
            : (raw as Record<string, unknown>)[key] === false
              ? false
              : true;
        return acc;
      }, {});
    }
    return getDefaultPermissions();
  }, [member?.permissions]);

  const [draft, setDraft] = useState<ProfilePermissions>(initial);

  /** רענון מצב טיוטה כשהדיאלוג נפתח עבור חבר אחר. */
  useEffect(() => {
    setDraft(initial);
  }, [initial, open]);

  const memberLabel = (member?.full_name || member?.email || '').trim() || '—';

  const dirty = useMemo(() => {
    for (const key of PERMISSION_KEYS) {
      if (Boolean(initial[key]) !== Boolean(draft[key])) return true;
    }
    return false;
  }, [draft, initial]);

  const handleToggle = (key: PermissionKey, value: boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!member?.id) return;
    updatePermissions.mutate(
      { profileId: member.id, permissions: { ...draft } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const setAll = (value: boolean) => {
    setDraft(
      PERMISSION_KEYS.reduce<ProfilePermissions>((acc, key) => {
        acc[key] = value;
        return acc;
      }, {}),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>עריכת הרשאות</DialogTitle>
          <DialogDescription>
            הרשאות בסיס עבור <strong>{memberLabel}</strong>. כיבוי הרשאה מסתיר את הקטעים
            הרלוונטיים בממשק עבור המשתמש (לא משפיע על הרשאות אדמין-על).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">בחר/בטל הרשאות:</span>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => setAll(true)}
            >
              סמן הכל
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => setAll(false)}
            >
              נקה הכל
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 bg-background max-h-[60vh] overflow-y-auto">
          {PERMISSION_KEYS.map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 cursor-pointer text-sm text-right"
            >
              <input
                type="checkbox"
                checked={draft[key] === true}
                onChange={(e) => handleToggle(key, e.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={updatePermissions.isPending}
              />
              {PERMISSION_LABELS[key]}
            </label>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updatePermissions.isPending}
          >
            ביטול
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={updatePermissions.isPending || !dirty || !member?.id}
          >
            {updatePermissions.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : null}
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
