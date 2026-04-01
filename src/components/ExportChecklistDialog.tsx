import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import type { OrgDocument } from '@/hooks/useOrgDocuments';
import { docFingerprint, type OrgExportSelections } from '@/lib/orgSettingsReleaseSnapshot';

export type ExportChecklistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: OrgDocument[];
  documentsLoading?: boolean;
  selections: OrgExportSelections;
  setSelections: Dispatch<SetStateAction<OrgExportSelections>>;
  onConfirmExport: () => void | Promise<void>;
  isExporting: boolean;
};

export function ExportChecklistDialog({
  open,
  onOpenChange,
  documents,
  documentsLoading = false,
  selections,
  setSelections,
  onConfirmExport,
  isExporting,
}: ExportChecklistDialogProps) {
  const titledDocs = useMemo(
    () => [...documents].filter((d) => String(d.title ?? '').trim()),
    [documents],
  );

  const docFingerprints = useMemo(() => titledDocs.map((d) => docFingerprint(d)), [titledDocs]);

  const allDocsSelected =
    docFingerprints.length > 0 && docFingerprints.every((fp) => selections.documentFingerprints.has(fp));

  const setField = (patch: Partial<OrgExportSelections['fields']>) => {
    setSelections((s) => ({
      ...s,
      fields: { ...s.fields, ...patch },
    }));
  };

  const toggleDoc = (fp: string, checked: boolean) => {
    setSelections((s) => {
      const next = new Set(s.documentFingerprints);
      if (checked) next.add(fp);
      else next.delete(fp);
      return { ...s, documentFingerprints: next };
    });
  };

  const toggleAllDocs = (checked: boolean) => {
    setSelections((s) => ({
      ...s,
      documentFingerprints: checked ? new Set(docFingerprints) : new Set(),
    }));
  };

  const f = selections.fields;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col gap-0" dir="rtl">
        <DialogHeader>
          <DialogTitle>העברת הגדרות לפרו — בחירת תוכן</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            סמנו מה לכלול בקובץ. בשלב הבא יורד קובץ JSON למחשב — אותו ניתן לייבא בסביבת הפרודקשן.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[min(52vh,420px)] pr-3 -mr-1">
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">פרטי ארגון</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={f.orgDetails} onCheckedChange={(v) => setField({ orgDetails: v === true })} />
                <span className="text-sm">שם, דוא״ל וח.פ./ע.מ.</span>
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">טפסים ומסמכי מדיניות</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={f.vehiclePolicyText}
                  onCheckedChange={(v) => setField({ vehiclePolicyText: v === true })}
                />
                <span className="text-sm">נוהל שימוש ברכב — טקסט</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={f.healthStatementText}
                  onCheckedChange={(v) => setField({ healthStatementText: v === true })}
                />
                <span className="text-sm">הצהרת בריאות — טקסט</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={f.brandPdfTemplates}
                  onCheckedChange={(v) => setField({ brandPdfTemplates: v === true })}
                />
                <span className="text-sm">צבעי מותג ולוגו (תבניות PDF לחתימה)</span>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="export-all-docs"
                  checked={allDocsSelected}
                  disabled={documentsLoading || docFingerprints.length === 0}
                  onCheckedChange={(v) => toggleAllDocs(v === true)}
                />
                <Label htmlFor="export-all-docs" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer">
                  מסמכים נוספים
                </Label>
              </div>
              {documentsLoading ? (
                <p className="text-sm text-muted-foreground py-2">טוען רשימת מסמכים…</p>
              ) : titledDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">אין מסמכים עם כותרת לייצוא</p>
              ) : (
                <ul className="space-y-2 pr-1 list-none">
                  {titledDocs.map((doc) => {
                    const fp = docFingerprint(doc);
                    const id = `export-doc-${fp}`;
                    return (
                      <li key={fp}>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <Checkbox
                            id={id}
                            className="mt-0.5"
                            checked={selections.documentFingerprints.has(fp)}
                            onCheckedChange={(v) => toggleDoc(fp, v === true)}
                          />
                          <span className="text-sm leading-snug">
                            <span className="font-medium text-foreground">{String(doc.title).trim()}</span>
                            {doc.is_active === false ? (
                              <span className="text-xs text-muted-foreground mr-2">(לא פעיל)</span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={() => void onConfirmExport()} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Download className="h-4 w-4 ml-2" />}
            הורד קובץ JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
