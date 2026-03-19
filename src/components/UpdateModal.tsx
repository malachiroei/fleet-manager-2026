import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type UpdateManifest = {
  version?: string;
  released_at?: string;
  notes?: string;
  changelog?: string[] | string;
  update_url?: string;
  download_url?: string;
};

interface UpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersion: string;
  manifest: UpdateManifest | null;
  onVersionApplied?: (version: string) => void;
}

export function UpdateModal({
  open,
  onOpenChange,
  currentVersion,
  manifest,
  onVersionApplied,
}: UpdateModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) {
      setIsUpdating(false);
      setProgress(0);
    }
  }, [open]);

  const changelogLines = useMemo(() => {
    const raw = manifest?.changelog ?? manifest?.notes;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return String(raw)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }, [manifest]);

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setProgress(5);

    for (let p = 10; p <= 100; p += 10) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      setProgress(p);
    }

    const nextVersion = (manifest?.version ?? '').trim();
    if (nextVersion) {
      localStorage.setItem('fleet_installed_version', nextVersion);
      onVersionApplied?.(nextVersion);
    }

    // Force hard refresh from the deployment host.
    window.location.href = window.location.href;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>נמצא עדכון חדש למערכת</DialogTitle>
          <DialogDescription>
            גרסה נוכחית: {currentVersion} · גרסה חדשה: {manifest?.version ?? 'לא ידוע'}
            {manifest?.released_at ? ` · תאריך שחרור: ${manifest.released_at}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2 max-h-[40vh] overflow-y-auto rounded-md border border-border p-3 bg-background/40">
            {changelogLines.length > 0 ? (
              <ul className="list-disc pr-5 space-y-1 text-sm">
                {changelogLines.map((line, idx) => (
                  <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">לא סופק changelog בקובץ manifest.</p>
            )}
          </div>

          {isUpdating && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>מתקין עדכון...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            סגור
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                מעדכן...
              </>
            ) : (
              'Update Now'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

