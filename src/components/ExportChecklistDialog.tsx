import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import type { OrgDocument } from '@/hooks/useOrgDocuments';
import {
  HEALTH_STATEMENT_FALLBACK_DOC_TITLE,
  VEHICLE_POLICY_FALLBACK_DOC_TITLE,
} from '@/lib/orgDocumentTemplate';
import {
  docFingerprint,
  safeExportDocumentFingerprints,
  safeExportFields,
  type OrgExportSelections,
  type OrgSettingsFormUiSnapshot,
} from '@/lib/orgSettingsReleaseSnapshot';

const EMPTY_FORM_UI: OrgSettingsFormUiSnapshot = {
  org_id_number: '',
  health_statement_text: '',
  vehicle_policy_text: '',
  health_statement_pdf_url: null,
  vehicle_policy_pdf_url: null,
};

function trimTitle(doc: OrgDocument): string {
  return String(doc.title ?? '').trim();
}

function isActiveDoc(doc: OrgDocument): boolean {
  return doc.is_active !== false;
}

export type ExportChecklistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** אופציונלי — בסביבה חדשה ללא שורות org_documents ייתכן undefined */
  documents?: OrgDocument[] | null;
  documentsLoading?: boolean;
  /** ערכי הטופס מהמסך — לבדיקה אם להציג צ׳קבוקסי טקסט/PDF */
  formUiSnapshot?: OrgSettingsFormUiSnapshot | null;
  selections: OrgExportSelections;
  setSelections: Dispatch<SetStateAction<OrgExportSelections>>;
  onConfirmExport: () => void | Promise<void>;
  isExporting: boolean;
};

export function ExportChecklistDialog({
  open,
  onOpenChange,
  documents: documentsProp,
  documentsLoading = false,
  formUiSnapshot: formUiProp,
  selections,
  setSelections,
  onConfirmExport,
  isExporting,
}: ExportChecklistDialogProps) {
  const documents = Array.isArray(documentsProp) ? documentsProp : [];
  const formUiSnapshot = formUiProp ?? EMPTY_FORM_UI;

  const activeTitledDocs = useMemo(
    () => documents.filter((d) => isActiveDoc(d) && trimTitle(d).length > 0),
    [documents],
  );

  const activeDocFingerprintsKey = useMemo(
    () =>
      [...activeTitledDocs]
        .map((d) => docFingerprint(d))
        .sort()
        .join('\n'),
    [activeTitledDocs],
  );

  const hasVehiclePolicyDocument = useMemo(
    () => activeTitledDocs.some((d) => trimTitle(d) === VEHICLE_POLICY_FALLBACK_DOC_TITLE),
    [activeTitledDocs],
  );

  const hasHealthStatementDocument = useMemo(
    () => activeTitledDocs.some((d) => trimTitle(d) === HEALTH_STATEMENT_FALLBACK_DOC_TITLE),
    [activeTitledDocs],
  );

  const vehiclePolicyTextPopulated = String(formUiSnapshot.vehicle_policy_text ?? '').trim().length > 0;
  const healthStatementTextPopulated = String(formUiSnapshot.health_statement_text ?? '').trim().length > 0;
  const hasAnyTemplatePdf =
    Boolean(String(formUiSnapshot.health_statement_pdf_url ?? '').trim()) ||
    Boolean(String(formUiSnapshot.vehicle_policy_pdf_url ?? '').trim());

  const showVehiclePolicyText =
    !hasVehiclePolicyDocument && vehiclePolicyTextPopulated;
  const showHealthStatementText =
    !hasHealthStatementDocument && healthStatementTextPopulated;
  const showBrandPdfTemplates = hasAnyTemplatePdf;

  const showPolicySection = showVehiclePolicyText || showHealthStatementText || showBrandPdfTemplates;

  const docFingerprints = useMemo(() => activeTitledDocs.map((d) => docFingerprint(d)), [activeTitledDocs]);

  const fpSet = safeExportDocumentFingerprints(selections);
  const f = safeExportFields(selections);

  const allDocsSelected =
    docFingerprints.length > 0 && docFingerprints.every((fp) => fpSet.has(fp));

  const setField = (patch: Partial<OrgExportSelections['fields']>) => {
    setSelections((s) => ({
      fields: { ...safeExportFields(s), ...patch },
      documentFingerprints: safeExportDocumentFingerprints(s),
    }));
  };

  const toggleDoc = (fp: string, checked: boolean) => {
    setSelections((s) => {
      const next = new Set(safeExportDocumentFingerprints(s));
      if (checked) next.add(fp);
      else next.delete(fp);
      return { fields: safeExportFields(s), documentFingerprints: next };
    });
  };

  const toggleAllDocs = (checked: boolean) => {
    setSelections((s) => ({
      fields: safeExportFields(s),
      documentFingerprints: checked ? new Set(docFingerprints) : new Set(),
    }));
  };

  useEffect(() => {
    if (!open) return;
    const validFps = new Set(activeTitledDocs.map((d) => docFingerprint(d)));
    setSelections((prev) => {
      const prevFields = safeExportFields(prev);
      const fields = { ...prevFields };
      let fieldsChanged = false;
      if (!showVehiclePolicyText && fields.vehiclePolicyText) {
        fields.vehiclePolicyText = false;
        fieldsChanged = true;
      }
      if (!showHealthStatementText && fields.healthStatementText) {
        fields.healthStatementText = false;
        fieldsChanged = true;
      }
      if (!showBrandPdfTemplates && fields.brandPdfTemplates) {
        fields.brandPdfTemplates = false;
        fieldsChanged = true;
      }
      const prevFps = safeExportDocumentFingerprints(prev);
      const nextFps = new Set([...prevFps].filter((fp) => validFps.has(fp)));
      const fpsChanged =
        nextFps.size !== prevFps.size || ![...prevFps].every((fp) => nextFps.has(fp));
      if (!fieldsChanged && !fpsChanged) return prev;
      return {
        fields: fieldsChanged ? fields : prevFields,
        documentFingerprints: fpsChanged ? nextFps : prevFps,
      };
    });
  }, [
    open,
    showVehiclePolicyText,
    showHealthStatementText,
    showBrandPdfTemplates,
    activeDocFingerprintsKey,
    setSelections,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[min(90vh,920px)] flex flex-col gap-0 overflow-hidden p-0"
        dir="rtl"
      >
        <DialogHeader className="shrink-0 space-y-1.5 px-6 pt-6 text-right sm:text-right pr-12">
          <DialogTitle>העברת הגדרות לפרו — בחירת תוכן</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            סמנו מה לכלול בקובץ. בשלב הבא יורד קובץ JSON למחשב — אותו ניתן לייבא בסביבת הפרודקשן.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 max-h-[60vh] flex-1 overflow-y-auto overscroll-y-contain px-6 pb-8">
          <div className="space-y-5 pt-1">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">פרטי ארגון</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={f.orgDetails} onCheckedChange={(v) => setField({ orgDetails: v === true })} />
                <span className="text-sm">שם, דוא״ל וח.פ./ע.מ.</span>
              </label>
            </div>

            {showPolicySection ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">טפסים ומסמכי מדיניות</p>
                {showVehiclePolicyText ? (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={f.vehiclePolicyText}
                      onCheckedChange={(v) => setField({ vehiclePolicyText: v === true })}
                    />
                    <span className="text-sm">נוהל שימוש ברכב — טקסט</span>
                  </label>
                ) : null}
                {showHealthStatementText ? (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={f.healthStatementText}
                      onCheckedChange={(v) => setField({ healthStatementText: v === true })}
                    />
                    <span className="text-sm">הצהרת בריאות — טקסט</span>
                  </label>
                ) : null}
                {showBrandPdfTemplates ? (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={f.brandPdfTemplates}
                      onCheckedChange={(v) => setField({ brandPdfTemplates: v === true })}
                    />
                    <span className="text-sm">תבניות PDF ולוגו הארגון</span>
                  </label>
                ) : null}
              </div>
            ) : null}

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
              ) : activeTitledDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">אין מסמכים פעילים עם כותרת לייצוא</p>
              ) : (
                <ul className="space-y-2 list-none">
                  {activeTitledDocs.map((doc) => {
                    const fp = docFingerprint(doc);
                    const id = `export-doc-${fp}`;
                    return (
                      <li key={fp}>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <Checkbox
                            id={id}
                            className="mt-0.5"
                            checked={fpSet.has(fp)}
                            onCheckedChange={(v) => toggleDoc(fp, v === true)}
                          />
                          <span className="text-sm leading-snug">
                            <span className="font-medium text-foreground">{trimTitle(doc)}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4 sm:flex-row sm:justify-end sm:gap-2 sm:space-x-0">
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
