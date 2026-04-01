import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Loader2 } from 'lucide-react';
import type { OrgExportSelections } from '@/lib/orgSettingsReleaseSnapshot';

export type ExportChecklistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selections: OrgExportSelections;
  setSelections: Dispatch<SetStateAction<OrgExportSelections>>;
  /** נקרא רק מלחיצה על «הורד» בדיאלוג — לא מהכפתור שפותח את הדיאלוג */
  onConfirmExport: () => void | Promise<void>;
  isExporting: boolean;
};

export function ExportChecklistDialog({
  open,
  onOpenChange,
  selections,
  setSelections,
  onConfirmExport,
  isExporting,
}: ExportChecklistDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>סנכרון הגדרות — בחירת תוכן לייצוא</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            יווצר קובץ <code className="text-xs">release_snapshot.json</code> ללא מזהה הארגון ב-Supabase, לייבוא בפרודקשן.
            הגדרות הטפסים נשמרות בטבלת <code className="text-xs">ui_settings</code>; המסמכים המותאמים ב־
            <code className="text-xs">org_documents</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={selections.documents}
              onCheckedChange={(v) => setSelections((s) => ({ ...s, documents: v === true }))}
            />
            <span className="text-sm">מסמכים (org_documents)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={selections.uiSettings}
              onCheckedChange={(v) => setSelections((s) => ({ ...s, uiSettings: v === true }))}
            />
            <span className="text-sm">הגדרות ממשק וטפסים (טקסטים ותבניות PDF)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={selections.orgDetails}
              onCheckedChange={(v) => setSelections((s) => ({ ...s, orgDetails: v === true }))}
            />
            <span className="text-sm">פרטי ארגון (שם, דוא״ל, ח.פ./ע.מ.)</span>
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={() => void onConfirmExport()} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Download className="h-4 w-4 ml-2" />}
            הורד release_snapshot.json
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
