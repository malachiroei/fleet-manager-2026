import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { TEAM_MEMBERS_QUERY_KEY } from '@/hooks/useTeam';
import {
  ALLOWED_FEATURE_GROUPS,
  ALLOWED_FEATURE_LABELS,
  type AllowedFeatureKey,
  normalizeAllowedFeaturesFromProfile,
} from '@/lib/allowedFeatures';
import type { Profile } from '@/types/fleet';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export type MemberAllowedFeaturesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Profile | null;
};

export function MemberAllowedFeaturesDialog({
  open,
  onOpenChange,
  member,
}: MemberAllowedFeaturesDialogProps) {
  const queryClient = useQueryClient();
  const { profile: currentProfile, refreshProfile } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !member) return;
    const normalized = normalizeAllowedFeaturesFromProfile(member.allowed_features);
    if (normalized === null) {
      setSelected(new Set());
    } else {
      setSelected(new Set(normalized));
    }
  }, [open, member]);

  const toggle = useCallback(
    async (key: AllowedFeatureKey, checked: boolean) => {
      if (!member?.id) return;
      const next = new Set(selected);
      if (checked) next.add(key);
      else next.delete(key);
      setSelected(next);
      setSavingKey(key);
      const arr = ALLOWED_FEATURE_GROUPS.flatMap((g) => g.keys).filter((k) => next.has(k)) as AllowedFeatureKey[];
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            allowed_features: arr,
            updated_at: new Date().toISOString(),
          })
          .eq('id', member.id);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_QUERY_KEY });
        if (currentProfile?.id === member.id) {
          await refreshProfile();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'שמירת הרשאות נכשלה');
        const normalized = normalizeAllowedFeaturesFromProfile(member.allowed_features);
        setSelected(normalized === null ? new Set() : new Set(normalized));
      } finally {
        setSavingKey(null);
      }
    },
    [member, selected, queryClient, currentProfile?.id, refreshProfile],
  );

  const setLegacyMode = useCallback(async () => {
    if (!member?.id) return;
    setSavingKey('_legacy');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          allowed_features: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);
      if (error) throw error;
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_QUERY_KEY });
      if (currentProfile?.id === member.id) {
        await refreshProfile();
      }
      toast.success('חזרה לרשאות לפי מערכת הישנה (JSON permissions)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון נכשל');
    } finally {
      setSavingKey(null);
    }
  }, [member, queryClient, currentProfile?.id, refreshProfile]);

  const explicit = member ? normalizeAllowedFeaturesFromProfile(member.allowed_features) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>הרשאות גישה</DialogTitle>
          <DialogDescription className="text-start">
            {member?.full_name || member?.email || 'משתמש'} — סימון מעדכן מיד את{' '}
            <code className="text-xs">allowed_features</code> בפרופיל.
            {explicit === null ? (
              <span className="block mt-1 text-amber-700 dark:text-amber-400">
                <code className="text-xs">allowed_features</code> ריק ב-DB — רכיבים תחת PermissionGuard חסומים (מלבד
                סופר־אדמין). סמן מפתחות כדי לפתוח גישה מפורשת.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {ALLOWED_FEATURE_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-semibold text-foreground">{group.title}</p>
              <div className="space-y-2 ps-1">
                {group.keys.map((key) => {
                  const id = `af-${key}`;
                  const checked = selected.has(key);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={checked}
                        disabled={!member || savingKey === key}
                        onCheckedChange={(v) => void toggle(key, v === true)}
                      />
                      <Label htmlFor={id} className="text-sm font-normal cursor-pointer leading-tight">
                        <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
                        <span className="mx-1">—</span>
                        {ALLOWED_FEATURE_LABELS[key]}
                      </Label>
                      {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!member || savingKey != null}
            onClick={() => void setLegacyMode()}
          >
            {savingKey === '_legacy' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            נקה allowed_features (חסימה מחמירה)
          </Button>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
