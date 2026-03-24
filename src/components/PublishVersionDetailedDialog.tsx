import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import snapshotBundled from '@/config/version_snapshot.json';
import { APP_VERSION } from '@/constants/version';
import { invokePublishVersionSnapshot } from '@/lib/invokePublishVersionSnapshot';
import {
  buildVersionSnapshotFeaturesFromSelection,
  getVersionPublishInventory,
  versionPublishInventoryGroups,
} from '@/lib/versionPublishInventory';
import type { VersionSnapshotFile } from '@/lib/versionSnapshotTypes';
import { compareSemver, toCanonicalThreePartVersion, normalizeVersion } from '@/lib/versionManifest';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PUBLISHER_EMAIL = 'malachiroei@gmail.com';

function checkboxDomId(inventoryId: string): string {
  return `pv-inv-${inventoryId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function kindLabel(kind: string): string {
  if (kind === 'form') return 'טופס';
  if (kind === 'page') return 'עמוד';
  if (kind === 'button') return 'כפתור';
  if (kind === 'hook') return 'לוגיקה';
  if (kind === 'infra') return 'תשתית';
  return kind;
}

export type PublishVersionDetailedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  codeVersion: string;
  isFleetManagerTestHost: boolean;
  publishDiffSupabaseVersion: string;
  publishVersionInput: string;
  onPublishVersionInputChange: (v: string) => void;
  publishNextVersion: string;
  publishVersionPlaceholder: string;
  stagingDebugLines: string[];
  /** אחרי דחיפה מוצלחת ל-GitHub — שמירת app_version ו-last_update_date ב-Supabase הנוכחי */
  onAfterGithubPublish: (versionCanonical: string) => Promise<void>;
  /** לנעילת כפתור «פרסם גרסה חדשה» בזמן הזרימה */
  onFullPublishBusyChange?: (busy: boolean) => void;
};

export function PublishVersionDetailedDialog({
  open,
  onOpenChange,
  userEmail,
  codeVersion,
  isFleetManagerTestHost,
  publishDiffSupabaseVersion,
  publishVersionInput,
  onPublishVersionInputChange,
  publishNextVersion,
  publishVersionPlaceholder,
  stagingDebugLines,
  onAfterGithubPublish,
  onFullPublishBusyChange,
}: PublishVersionDetailedDialogProps) {
  const canPublishSnapshot = userEmail.trim().toLowerCase() === PUBLISHER_EMAIL;
  const [description, setDescription] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [uiChanges, setUiChanges] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isPublishingFull, setIsPublishingFull] = useState(false);

  const groups = useMemo(() => {
    if (!open) return [];
    return versionPublishInventoryGroups();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const s = snapshotBundled as VersionSnapshotFile;
    setDescription(typeof s.description === 'string' ? s.description : '');
    setReleaseNotes(typeof s.release_notes === 'string' ? s.release_notes : '');
    setUiChanges(typeof s.ui_changes === 'string' ? s.ui_changes : '');
    setReleaseDate(
      typeof s.release_date === 'string' && s.release_date.trim()
        ? s.release_date.trim()
        : new Date().toISOString().slice(0, 10)
    );
    const ids = new Set<string>();
    const invIds = new Set(getVersionPublishInventory().map((i) => i.id));
    for (const f of s.features ?? []) {
      if (f && typeof f.id === 'string' && invIds.has(f.id)) ids.add(f.id);
    }
    setSelectedIds(ids);
  }, [open]);

  const toggleId = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAllInGroup = useCallback((ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const handlePublishAll = async () => {
    const version =
      normalizeVersion(publishVersionInput.trim()) ||
      normalizeVersion(publishNextVersion.trim()) ||
      publishVersionInput.trim();
    if (!version) {
      toast.error('נא להזין מספר גרסה.');
      return;
    }
    if (!canPublishSnapshot) {
      toast.error('פרסום מלא מותר רק מהחשבון המורשה.');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('בחר לפחות רכיב אחד ברשימה.');
      return;
    }

    const features = buildVersionSnapshotFeaturesFromSelection(selectedIds);
    // eslint-disable-next-line no-console
    console.log(
      '[PublishVersionDetailedDialog] modal selection → features:',
      'checkboxes=',
      selectedIds.size,
      'features.length=',
      features.length,
      'ids sample:',
      features.slice(0, 8).map((f) => f.id),
    );

    const snapshot: VersionSnapshotFile = {
      version,
      release_date: releaseDate.trim() || new Date().toISOString().slice(0, 10),
      description: description.trim() || `גרסה ${version}`,
      release_notes: releaseNotes.trim() || undefined,
      features,
      ui_changes: uiChanges.trim() || releaseNotes.trim() || '—',
    };

    setIsPublishingFull(true);
    onFullPublishBusyChange?.(true);
    try {
      const res = await invokePublishVersionSnapshot(snapshot);
      const prod = res.production as { updated?: boolean; skipped?: boolean; reason?: string; error?: string };
      const prodMsg =
        prod.updated === true
          ? 'עודכן version_snapshot_published בפרודקשן.'
          : prod.skipped
            ? `פרודקשן: דולג (${prod.reason ?? 'לא הוגדרו סודות PRODUCTION_*'}).`
            : prod.error
              ? `פרודקשן: ${prod.error}`
              : 'פרודקשן: סטטוס לא ידוע.';

      const deps = res.dependencies_sync as {
        source_repo?: string;
        source_branch?: string;
        resolved_via?: string;
      } | undefined;
      const depsMsg =
        deps?.source_repo != null
          ? ` תלויות: package.json + lock מ־${deps.source_repo}@${deps.source_branch ?? 'dev'} (${deps.resolved_via ?? 'sync'}).`
          : '';

      await onAfterGithubPublish(version);

      toast.success(
        `GitHub: ${res.github.path} (${res.github.branch}).${depsMsg} ${prodMsg} נשמרה גרסה ב-Supabase.`,
      );
      onOpenChange(false);
      if (isFleetManagerTestHost) {
        window.setTimeout(() => {
          window.location.reload();
        }, 600);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`פרסום נכשל: ${msg}`);
    } finally {
      setIsPublishingFull(false);
      onFullPublishBusyChange?.(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>פרסום גרסה — snapshot + GitHub + Supabase</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block text-xs text-muted-foreground">
              «פרסם לכולם» מעדכן את <code className="text-[10px]">version_snapshot.json</code> ב-GitHub (פרו), מסמן
              ב-DB של הפרו אם הוגדרו סודות, ומקפיץ את <code className="text-[10px]">app_version</code> בסביבת
              Supabase הנוכחית.
            </span>
            <span className="block text-xs">
              גרסת <code className="text-[10px]">APP_VERSION</code> מקומית:{' '}
              <code className="text-[10px] font-mono" dir="ltr">
                {APP_VERSION}
              </code>
            </span>
            {!canPublishSnapshot ? (
              <span className="block text-xs text-amber-700 dark:text-amber-400 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1">
                מחובר כ־{userEmail || '—'} — פרסום מלא זמין רק מ־{PUBLISHER_EMAIL}.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 min-h-0 flex-1 overflow-y-auto pe-1">
          {isFleetManagerTestHost ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-sm shrink-0">
              <p className="font-semibold text-foreground">השוואת גרסאות (Diff)</p>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">גרסת בנדל</span>
                <code className="font-mono text-xs bg-background px-2 py-0.5 rounded" dir="ltr">
                  {codeVersion}
                </code>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">app_version ב-Supabase</span>
                <code className="font-mono text-xs bg-background px-2 py-0.5 rounded" dir="ltr">
                  {publishDiffSupabaseVersion || '—'}
                </code>
              </div>
              {publishDiffSupabaseVersion ? (
                <p className="text-xs text-muted-foreground">
                  {compareSemver(codeVersion, publishDiffSupabaseVersion) > 0
                    ? 'הבנדל חדש יותר מהרשומה בענן.'
                    : compareSemver(codeVersion, publishDiffSupabaseVersion) < 0
                      ? 'בענן גרסה גבוהה מהבנדל.'
                      : 'גרסאות תואמות (semver).'}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-dashed border-muted-foreground/35 bg-muted/20 p-3 space-y-2 text-sm shrink-0">
            <p className="font-semibold text-foreground" dir="ltr">
              Staging/Debug (מידע בלבד)
            </p>
            {stagingDebugLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1 list-disc list-inside text-xs text-muted-foreground">
                {stagingDebugLines.map((line) => (
                  <li key={line} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border border-border rounded-md p-3 bg-muted/5 shrink-0">
            <h3 className="text-sm font-semibold text-foreground">מה חדש בגרסה?</h3>
            <Textarea
              id="pv-release-notes"
              rows={4}
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="תאר בקצרה מה השתנה לצוות / למשתמשים..."
              className="text-sm resize-y min-h-[80px]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 shrink-0">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pv-version">מספר גרסה לפרסום</Label>
              <Input
                id="pv-version"
                dir="ltr"
                className="font-mono text-sm"
                value={publishVersionInput}
                onChange={(e) => onPublishVersionInputChange(e.target.value)}
                placeholder={
                  publishVersionPlaceholder ||
                  toCanonicalThreePartVersion(normalizeVersion(codeVersion)) ||
                  codeVersion
                }
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-date">תאריך שחרור</Label>
              <Input
                id="pv-date"
                type="date"
                dir="ltr"
                className="font-mono text-sm"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pv-desc">תיאור קצר (כותרת)</Label>
              <Textarea
                id="pv-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm resize-y min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pv-ui">שינויי ממשק (אופציונלי — טקסט חופשי)</Label>
              <Textarea
                id="pv-ui"
                rows={2}
                value={uiChanges}
                onChange={(e) => setUiChanges(e.target.value)}
                className="text-sm resize-y min-h-[60px]"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-semibold">מלאי רכיבים (סריקה אוטומטית)</p>
            <p className="text-[11px] text-muted-foreground">
              בקטגוריית התשתית: <code className="text-[10px]">package.json</code> ו־
              <code className="text-[10px]">package-lock.json</code> בשורש. בנוסף נסרקים{' '}
              <code className="text-[10px]">src/pages</code>, <code className="text-[10px]">src/components</code> (ללא
              ui/), ו-<code className="text-[10px]">src/hooks</code> — קבצים חדשים יופיעו אחרי בנייה מחדש.
            </p>
            <div className="space-y-4 max-h-[38vh] overflow-y-auto pe-1 border rounded-md p-3 bg-muted/10">
              {groups.map(({ group, items }) => {
                const ids = items.map((i) => i.id);
                return (
                  <div key={group} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{group}</span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => selectAllInGroup(ids, true)}
                        >
                          בחר הכל
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => selectAllInGroup(ids, false)}
                        >
                          נקה
                        </Button>
                        <span className="text-[10px] text-muted-foreground self-center">
                          {ids.filter((id) => selectedIds.has(id)).length}/{ids.length}
                        </span>
                      </div>
                    </div>
                    <ul className="space-y-2 ps-1">
                      {items.map((item) => (
                        <li key={item.id} className="flex items-start gap-2">
                          <Checkbox
                            id={checkboxDomId(item.id)}
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={(v) => toggleId(item.id, v === true)}
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={checkboxDomId(item.id)}
                            className="text-xs leading-snug cursor-pointer flex-1"
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground ms-1">({kindLabel(item.kind)})</span>
                            <span className="block text-[10px] text-muted-foreground/80 font-mono" dir="ltr">
                              {item.id}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-amber-700/90 dark:text-amber-400/95 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 shrink-0">
            לפני פריסה: ודא ש־<code className="text-[10px]">src/constants/version.ts</code> תואם לגרסה המפורסמת כדי
            שלא יופיע bundle mismatch אחרי «עדכן עכשיו».
          </p>
        </div>

        <DialogFooter className="mt-2 flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPublishingFull}>
            ביטול
          </Button>
          <Button onClick={() => void handlePublishAll()} disabled={!canPublishSnapshot || isPublishingFull}>
            {isPublishingFull ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            פרסם לכולם
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
