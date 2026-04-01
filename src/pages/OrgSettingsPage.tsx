import React, { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight, Building2, FileText, Heart, Loader2, Save,
  Upload, ExternalLink, Trash2, Plus, Pencil, FileCheck, Tag,
  Download, RotateCcw, RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getTestStaticManifestUrl, isFleetManagerProHostname } from '@/lib/versionManifest';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganizations';
import { useOrgSettings, useUpdateOrgSettings, uploadTemplatePdf } from '@/hooks/useOrgSettings';
import { useUiLabels, useUpdateUiLabels, UiLabel } from '@/hooks/useUiLabels';
import {
  useOrgDocumentsAdmin, useCreateOrgDocument,
  useUpdateOrgDocument, useDeleteOrgDocument,
  fetchOrgDocumentsAdmin,
  ORG_DOCUMENTS_ADMIN_QUERY_KEY,
  OrgDocument,
} from '@/hooks/useOrgDocuments';
import { ExportChecklistDialog } from '@/components/ExportChecklistDialog';
import { isFleetAppStagingEnvironment } from '@/lib/fleetAppStagingEnvironment';
import {
  applyOrgDocumentsFromSnapshot,
  buildOrgCrossEnvSnapshot,
  buildOrgSettingsPatchFromSelection,
  buildOrganizationUpdateFromSelection,
  computeOrgCrossEnvDiffRows,
  importSelectionTouchesDocuments,
  importSelectionTouchesOrganizationRow,
  importSelectionTouchesUiSettings,
  parseOrgCrossEnvSnapshot,
  type OrgCrossEnvSnapshotFile,
  type OrgExportSelections,
  type OrgReleaseDiffRow,
} from '@/lib/orgSettingsReleaseSnapshot';

// ─── PDF Template Upload slot ─────────────────────────────────────
function PdfUploadSlot({ label, description, currentUrl, onUploaded, slot, readOnly }: {
  label: string; description: string; currentUrl: string | null;
  onUploaded: (url: string) => void; slot: 'health' | 'policy'; readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) { toast.error('אנא להעלות קובץ PDF בלבד'); return; }
    setUploading(true);
    try {
      const url = await uploadTemplatePdf(f, slot);
      onUploaded(url);
      toast.success(`תבנית "${label}" הועלתה בהצלחה`);
    } catch (err: any) {
      toast.error(`שגיאה בהעלאה: ${err?.message ?? err}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {currentUrl && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
            <ExternalLink className="h-3.5 w-3.5" /> צפה
          </a>
        )}
      </div>
      {currentUrl ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
            <FileCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-xs text-green-700 dark:text-green-300 truncate">קובץ מועלה</span>
          </div>
          {!readOnly && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onUploaded('')} title="הסר תבנית">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : readOnly ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">אין תבנית מועלה</div>
      ) : (
        <>
          <Button type="button" variant="outline" size="sm" className="gap-2 w-full"
            disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'מעלה...' : 'העלה PDF'}
          </Button>
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}

// ─── Document row ──────────────────────────────────────────────────
function docTitleLooksInvalid(doc: OrgDocument): boolean {
  return !String(doc.title ?? '').trim();
}

function DocRow({ doc, onEdit, onDelete, readOnly }: {
  doc: OrgDocument; onEdit: (d: OrgDocument) => void; onDelete: (id: string) => void; readOnly?: boolean;
}) {
  const titleTrim = String(doc.title ?? '').trim();
  const invalid = docTitleLooksInvalid(doc);
  return (
    <div
      className={`flex items-start gap-3 border rounded-xl p-4 ${
        invalid ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">
          {titleTrim || <span className="text-amber-700 dark:text-amber-300">(ללא כותרת)</span>}
        </p>
        {invalid && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            שורה לא תקינה — מומלץ למחוק או לערוך ולשמור כותרת.
          </p>
        )}
        {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
        <div className="flex flex-wrap gap-2 mt-2">
          {doc.include_in_handover && <span className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 rounded-full px-2 py-0.5">כלול באשף מסירה</span>}
          {doc.is_standalone && <span className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 rounded-full px-2 py-0.5">טופס עצמאי</span>}
          {doc.requires_signature && <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-full px-2 py-0.5">דורש חתימה</span>}
          {doc.file_url && <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}><ExternalLink className="h-3 w-3" /> קובץ</a>}
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => onDelete(doc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

// ─── Add/Edit Document form ────────────────────────────────────────
function DocForm({ initial, onSave, onCancel, saving }: {
  initial: Partial<OrgDocument>; onSave: (d: Partial<OrgDocument> & { file?: File }) => void;
  onCancel: () => void; saving: boolean;
}) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [inHandover, setInHandover] = useState(initial.include_in_handover ?? false);
  const [standalone, setStandalone] = useState(initial.is_standalone ?? false);
  const [reqSig, setReqSig] = useState(initial.requires_signature ?? true);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border border-primary/40 rounded-xl p-4 space-y-3 bg-primary/5">
      <div className="space-y-2">
        <Label>כותרת המסמך <span className="text-destructive">*</span></Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: טופס מדיניות שימוש" />
      </div>
      <div className="space-y-2">
        <Label>תיאור (אופציונלי)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="הסבר קצר על מטרת הטופס" className="resize-none" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={inHandover} onCheckedChange={setInHandover} />
          <span className="text-xs">כלול באשף מסירה</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={standalone} onCheckedChange={setStandalone} />
          <span className="text-xs">טופס עצמאי</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={reqSig} onCheckedChange={setReqSig} />
          <span className="text-xs">דורש חתימה</span>
        </label>
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />{file ? file.name : 'העלה קובץ PDF (אופציונלי)'}
        </Button>
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ביטול</Button>
        <Button type="button" size="sm" disabled={!title.trim() || saving} className="gap-2"
          onClick={() => onSave({ title, description, include_in_handover: inHandover, is_standalone: standalone, requires_signature: reqSig, ...(file ? { file } : {}) })}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {initial.title ? 'עדכן' : 'הוסף'}
        </Button>
      </div>
    </div>
  );
}

// קוד מנהל לשינוי פרטי הארגון (ניתן לעדכון לפי הצורך)
const ORG_DETAILS_EDIT_CODE = '2101';

// ─── Main Page ─────────────────────────────────────────────────────
export default function OrgSettingsPage() {
  const queryClient = useQueryClient();
  const { activeOrgId, isAdmin, isManager, isDriver, hasPermission, user, profile } = useAuth();
  const isRoeyMainAdmin =
    (profile?.email ?? user?.email ?? '').trim().toLowerCase() === 'malachiroei@gmail.com';
  const isDriverOnly = Boolean(isDriver && !isManager && !isAdmin);
  const readOnly = isDriverOnly || !hasPermission('admin_access');

  const orgId = activeOrgId ?? null;
  const { data: organization, isLoading: orgLoading } = useOrganization(orgId);
  const updateOrganization = useUpdateOrganization();
  const { data: settings, isLoading: settingsLoading } = useOrgSettings(orgId);
  const updateSettings = useUpdateOrgSettings();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const crossEnvImportInputRef = useRef<HTMLInputElement>(null);

  const isStagingForCrossEnvSync = isFleetAppStagingEnvironment();

  const [syncExportModalOpen, setSyncExportModalOpen] = useState(false);
  const [exportSelections, setExportSelections] = useState<OrgExportSelections>({
    documents: true,
    uiSettings: true,
    orgDetails: true,
  });
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);

  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [importRows, setImportRows] = useState<OrgReleaseDiffRow[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(() => new Set());
  const [importSnapshot, setImportSnapshot] = useState<OrgCrossEnvSnapshotFile | null>(null);
  const [importFileBusy, setImportFileBusy] = useState(false);
  const [applyImportBusy, setApplyImportBusy] = useState(false);

  // Tab 1 state — name & email from organizations; rest from organization_settings
  const [orgName, setOrgName] = useState('');
  const [orgIdNumber, setOrgIdNumber] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [healthText, setHealthText] = useState('');
  const [policyText, setPolicyText] = useState('');
  const [healthPdfUrl, setHealthPdfUrl] = useState<string | null>(null);
  const [policyPdfUrl, setPolicyPdfUrl] = useState<string | null>(null);
  const [orgDetailsLocked, setOrgDetailsLocked] = useState<boolean>(true);

  // Populate from organizations (name, email) when loaded
  useEffect(() => {
    if (!organization) return;
    setOrgName(organization.name ?? '');
    setAdminEmail(organization.email ?? '');
  }, [organization]);

  // Populate from organization_settings (org_id_number, texts, pdfs) when loaded
  useEffect(() => {
    if (!settings) return;
    setOrgIdNumber(settings.org_id_number ?? '');
    setHealthText(settings.health_statement_text ?? '');
    setPolicyText(settings.vehicle_policy_text ?? '');
    setHealthPdfUrl((settings as any).health_statement_pdf_url ?? null);
    setPolicyPdfUrl((settings as any).vehicle_policy_pdf_url ?? null);
  }, [settings]);

  const handleUnlockOrgDetails = () => {
    const input = window.prompt('לשינוי פרטי הארגון (שם, ח.פ., דוא״ל) נדרש קוד מנהל. הזן קוד:');
    if (!input) return;
    if (input === ORG_DETAILS_EDIT_CODE) {
      setOrgDetailsLocked(false);
      toast.success('פרטי הארגון נפתחו לעריכה');
    } else {
      toast.error('קוד שגוי');
    }
  };

  const handleSaveDetails = async () => {
    try {
      if (orgId) {
        await updateOrganization.mutateAsync({
          id: orgId,
          name: orgName.trim(),
          email: adminEmail.trim() || null,
        });
      }
      await updateSettings.mutateAsync({
        org_id: orgId ?? undefined,
        org_id_number: orgIdNumber.trim(),
        health_statement_text: healthText,
        vehicle_policy_text: policyText,
        health_statement_pdf_url: healthPdfUrl || null,
        vehicle_policy_pdf_url: policyPdfUrl || null,
      });
      toast.success('הגדרות הארגון נשמרו בהצלחה');
    } catch (error) {
      console.error('OrgSettings handleSaveDetails error:', error);
      toast.error('שמירה נכשלה');
    }
  };

  // Tab 3 — UI Labels
  const { data: labels, isLoading: labelsLoading } = useUiLabels(orgId);
  const updateLabels = useUpdateUiLabels();
  const [labelEdits, setLabelEdits] = useState<Record<string, { custom_label: string; is_visible: boolean }>>({});
  const [savingLabels, setSavingLabels] = useState(false);

  useEffect(() => {
    if (!labels) return;
    const map: Record<string, { custom_label: string; is_visible: boolean }> = {};
    labels.forEach((l) => { map[l.key] = { custom_label: l.custom_label, is_visible: l.is_visible !== false }; });
    setLabelEdits(map);
  }, [labels]);

  const handleSaveLabels = async () => {
    setSavingLabels(true);
    try {
      await updateLabels.mutateAsync(
        Object.entries(labelEdits).map(([key, v]) => ({
          key,
          custom_label: String(v.custom_label),
          is_visible: v.is_visible,
        }))
      );
      toast.success('שמות מותאמים נשמרו');
    } catch (error) {
      console.error('OrgSettings handleSaveLabels error:', error);
      toast.error('שמירה נכשלה');
    }
    finally { setSavingLabels(false); }
  };

  const downloadJsonFile = (filename: string, obj: unknown) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const backupSystemTools = async () => {
    setIsBackingUp(true);
    try {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const dateStr = `${dd}-${mm}-${yyyy}`;

      const payload = {
        metadata: {
          appIdentifier: 'fleet-manager-pro',
          createdAt: d.toISOString(),
          scope: 'org-settings',
        },
        organization: organization ?? null,
        organization_settings: settings ?? null,
        ui_labels: labels ?? [],
      };

      downloadJsonFile(`fleet_manager_backup_${dateStr}.json`, payload);
      toast.success('הגיבוי הורד בהצלחה');
    } catch (e) {
      console.error(e);
      toast.error('גיבוי נכשל');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestorePicked = async (file: File) => {
    setIsRestoring(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as any;
      if (parsed?.metadata?.appIdentifier !== 'fleet-manager-pro') {
        toast.error('קובץ הגיבוי אינו תקין');
        return;
      }

      if (parsed?.organization && orgId) {
        const name = String(parsed.organization?.name ?? '').trim();
        const email = parsed.organization?.email ?? null;
        if (name) {
          await updateOrganization.mutateAsync({ id: orgId, name, email });
        }
      }

      if (parsed?.organization_settings && orgId) {
        await updateSettings.mutateAsync({ ...(parsed.organization_settings ?? {}), org_id: orgId });
      }

      if (Array.isArray(parsed?.ui_labels) && orgId) {
        await updateLabels.mutateAsync(
          (parsed.ui_labels as any[]).map((l) => ({
            key: String(l?.key ?? ''),
            custom_label: String(l?.custom_label ?? ''),
            is_visible: l?.is_visible !== false,
          }))
        );
      }

      toast.success('השחזור הושלם בהצלחה');
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast.error('שחזור נכשל');
    } finally {
      setIsRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  const restoreSystemTools = () => restoreInputRef.current?.click();

  const checkForUpdates = async () => {
    if (typeof window !== 'undefined' && isFleetManagerProHostname()) {
      toast.error('בדיקת מניפסט סטטי חסומה בייצור — השתמשו במודאל העדכון / Supabase.');
      return;
    }
    setIsCheckingUpdates(true);
    try {
      const manifestUrl = getTestStaticManifestUrl().trim();
      if (!manifestUrl) {
        toast.error('אין מניפסט סטטי זמין בדומיין זה.');
        return;
      }
      const res = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { version?: unknown };
      const latest = typeof json.version === 'string' ? json.version : '';
      if (!latest) throw new Error('manifest missing version');
      toast.success(`נבדק בהצלחה. גרסה זמינה: ${latest}`);
    } catch (e) {
      console.error(e);
      toast.error('בדיקת עדכונים נכשלה');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  // Tab 4 — Dynamic Documents
  const { data: docs, isLoading: docsLoading } = useOrgDocumentsAdmin();
  const createDoc = useCreateOrgDocument();
  const updateDoc = useUpdateOrgDocument();
  const deleteDoc = useDeleteOrgDocument();
  const [addingDoc, setAddingDoc] = useState(false);
  const [editingDoc, setEditingDoc] = useState<OrgDocument | null>(null);

  const handleSaveDoc = async (data: Partial<OrgDocument> & { file?: File }) => {
    try {
      if (editingDoc) {
        await updateDoc.mutateAsync({ id: editingDoc.id, ...data });
      } else {
        await createDoc.mutateAsync({
          include_in_handover: false,
          is_standalone: false,
          requires_signature: true,
          sort_order: 0,
          is_active: true,
          title: '',
          description: '',
          file_url: null,
          ...data,
        });
      }
      setAddingDoc(false); setEditingDoc(null);
      toast.success(editingDoc ? 'מסמך עודכן' : 'מסמך נוסף');
    } catch (error) {
      console.error('OrgSettings handleSaveDoc error:', error);
      toast.error('שמירה נכשלה');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('למחוק מסמך זה?')) return;
    try { await deleteDoc.mutateAsync(id); toast.success('מסמך הוסר'); }
    catch { toast.error('מחיקה נכשלה'); }
  };

  const [repairingDocs, setRepairingDocs] = useState(false);
  const [hardResettingUi, setHardResettingUi] = useState(false);

  /** Temporary: physical delete on org_documents (inactive + blank title). ui_settings has no is_active/title. */
  const handleHardResetUiSettings = async () => {
    if (readOnly) return;
    if (
      !confirm(
        'לאשר מחיקה קשה? יימחקו לצמיתות מ־org_documents: כל השורות עם is_active=false, וכל השורות שכותרתן ריקה או רווחים בלבד. לא ניתן לבטל.',
      )
    ) {
      return;
    }
    setHardResettingUi(true);
    try {
      const { error: delInactive } = await (supabase as any).from('org_documents').delete().eq('is_active', false);
      if (delInactive) throw delInactive;
      const { data: rows, error: selErr } = await (supabase as any).from('org_documents').select('id, title');
      if (selErr) throw selErr;
      const blankIds = (rows ?? [])
        .filter((r: { title?: string | null }) => !String(r.title ?? '').trim())
        .map((r: { id: string }) => r.id);
      if (blankIds.length > 0) {
        const { error: delBlank } = await (supabase as any).from('org_documents').delete().in('id', blankIds);
        if (delBlank) throw delBlank;
      }
      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      await queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      toast.success('ניקוי קשה הושלם');
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'ניקוי קשה נכשל');
    } finally {
      setHardResettingUi(false);
    }
  };

  const handleRepairInvalidDocs = async () => {
    if (readOnly) return;
    const bad = (docs ?? []).filter((d) => !String(d.title ?? '').trim());
    if (bad.length === 0) {
      toast.info('אין מסמכים ללא כותרת למחיקה');
      return;
    }
    if (!confirm(`למחוק ${bad.length} מסמכים ללא כותרת? פעולה זו אינה הפיכה מממשק המשתמש.`)) return;
    setRepairingDocs(true);
    try {
      for (const d of bad) {
        await deleteDoc.mutateAsync(d.id);
      }
      toast.success(`הוסרו ${bad.length} מסמכים ריקים`);
    } catch {
      toast.error('ניקוי נכשל');
    } finally {
      setRepairingDocs(false);
    }
  };

  const sortedDocs = useMemo(() => {
    const list = [...(docs ?? [])].filter((d) => String(d.title ?? '').trim());
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return list;
  }, [docs]);

  const allDocsForImport = useMemo(() => docs ?? [], [docs]);

  const handleConfirmExportSnapshot = async () => {
    if (!exportSelections.documents && !exportSelections.uiSettings && !exportSelections.orgDetails) {
      toast.error('בחר לפחות קטגוריה אחת לייצוא');
      return;
    }
    if (!orgId) {
      toast.error('אין ארגון פעיל');
      return;
    }
    setIsExportingSnapshot(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ORG_DOCUMENTS_ADMIN_QUERY_KEY });
      const documentsFresh = await queryClient.fetchQuery({
        queryKey: ORG_DOCUMENTS_ADMIN_QUERY_KEY,
        queryFn: fetchOrgDocumentsAdmin,
      });
      const formUiSnapshot = {
        org_id_number: orgIdNumber,
        health_statement_text: healthText,
        vehicle_policy_text: policyText,
        health_statement_pdf_url: healthPdfUrl,
        vehicle_policy_pdf_url: policyPdfUrl,
      };
      const snapshot = buildOrgCrossEnvSnapshot({
        organization: organization ?? null,
        organizationForm: {
          name: orgName.trim(),
          email: adminEmail.trim() ? adminEmail.trim() : null,
          org_id_number: orgIdNumber.trim(),
        },
        settings: settings ?? null,
        formUiSnapshot,
        documents: documentsFresh,
        selections: exportSelections,
      });
      downloadJsonFile('release_snapshot.json', snapshot);
      toast.success('הקובץ release_snapshot.json הורד (ללא מזהה ארגון בסביבת היעד)');
      setSyncExportModalOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('ייצוא הסנאפשוט נכשל');
    } finally {
      setIsExportingSnapshot(false);
    }
  };

  const openCrossEnvImportPicker = () => crossEnvImportInputRef.current?.click();

  const handleCrossEnvImportFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || readOnly) return;
    if (!orgId) {
      toast.error('אין ארגון פעיל');
      return;
    }
    setImportFileBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        toast.error('קובץ JSON לא תקין');
        return;
      }
      const { snapshot, error } = parseOrgCrossEnvSnapshot(parsed);
      if (error || !snapshot) {
        toast.error(error ?? 'קובץ לא תקין');
        return;
      }
      const rows = computeOrgCrossEnvDiffRows({
        snapshot,
        organization: organization ?? null,
        settings: settings ?? null,
        documents: allDocsForImport,
      });
      if (rows.length === 0) {
        toast.info('אין הבדלים בין הקובץ להגדרות הנוכחיות');
        return;
      }
      setImportSnapshot(snapshot);
      setImportRows(rows);
      setImportSelected(new Set(rows.filter((r) => r.defaultSelected).map((r) => r.id)));
      setImportReviewOpen(true);
    } catch (err) {
      console.error(err);
      toast.error('טעינת הקובץ נכשלה');
    } finally {
      setImportFileBusy(false);
    }
  };

  const toggleImportRow = (id: string, checked: boolean) => {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleImportCategory = (category: OrgReleaseDiffRow['category'], checked: boolean) => {
    const ids = importRows.filter((r) => r.category === category).map((r) => r.id);
    setImportSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const importCategoryAllSelected = (category: OrgReleaseDiffRow['category']) => {
    const ids = importRows.filter((r) => r.category === category).map((r) => r.id);
    return ids.length > 0 && ids.every((id) => importSelected.has(id));
  };

  const handleApplyCrossEnvImport = async () => {
    if (!importSnapshot || !orgId) return;
    if (importSelected.size === 0) {
      toast.error('סמן לפחות פריט אחד ליישום');
      return;
    }
    setApplyImportBusy(true);
    try {
      if (importSelectionTouchesOrganizationRow(importSelected)) {
        const orgUp = buildOrganizationUpdateFromSelection(importSnapshot, importSelected, orgId);
        if (orgUp && (orgUp.name !== undefined || orgUp.email !== undefined)) {
          await updateOrganization.mutateAsync(orgUp);
        }
      }
      if (importSelectionTouchesUiSettings(importSelected)) {
        const patch = buildOrgSettingsPatchFromSelection(
          importSnapshot,
          importSelected,
          settings ?? null,
          orgId,
        );
        await updateSettings.mutateAsync(patch);
      }
      if (importSelectionTouchesDocuments(importSelected)) {
        await applyOrgDocumentsFromSnapshot({
          supabase,
          snapshot: importSnapshot,
          selected: importSelected,
          currentDocuments: allDocsForImport,
        });
      }
      toast.success('העדכונים מהסטייג׳ינג יושמו בהצלחה');
      setImportReviewOpen(false);
      setImportRows([]);
      setImportSnapshot(null);
      setImportSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      await queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      window.location.reload();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'יישום נכשל');
    } finally {
      setApplyImportBusy(false);
    }
  };

  const crossEnvSyncDisabled =
    readOnly || !orgId || orgLoading || settingsLoading || docsLoading || isExportingSnapshot || importFileBusy;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6" dir="rtl">

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
          <Link to={isRoeyMainAdmin ? '/admin/settings' : '/'}>
            <Button variant="ghost" size="icon" className="rounded-full"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הגדרות ארגון</h1>
            <p className="text-muted-foreground text-sm">ניהול פרטי חברה, תבניות PDF, שמות מותאמים ומסמכים נוספים</p>
          </div>
          </div>

          {/* Always visible in Production: Backup / Restore / Check updates */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={backupSystemTools} disabled={isBackingUp || isRestoring}>
              {isBackingUp ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Download className="h-4 w-4 ml-2" />}
              גיבוי
            </Button>
            <Button variant="outline" size="sm" onClick={restoreSystemTools} disabled={isRestoring || isBackingUp}>
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <RotateCcw className="h-4 w-4 ml-2" />}
              שחזור
            </Button>
            <Button variant="outline" size="sm" onClick={checkForUpdates} disabled={isCheckingUpdates}>
              {isCheckingUpdates ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <RefreshCw className="h-4 w-4 ml-2" />}
              בדוק עדכונים
            </Button>
            {!readOnly && (
              isStagingForCrossEnvSync ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={crossEnvSyncDisabled}
                  onClick={() => setSyncExportModalOpen(true)}
                  className="gap-2"
                >
                  סנכרון הגדרות
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={crossEnvSyncDisabled}
                  onClick={openCrossEnvImportPicker}
                  className="gap-2"
                >
                  {importFileBusy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
                  טען עדכונים מסטייג׳ינג
                </Button>
              )
            )}
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleRestorePicked(f);
              }}
            />
            <input
              ref={crossEnvImportInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleCrossEnvImportFilePicked}
            />
          </div>
        </div>

        <ExportChecklistDialog
          open={syncExportModalOpen}
          onOpenChange={setSyncExportModalOpen}
          selections={exportSelections}
          setSelections={setExportSelections}
          onConfirmExport={handleConfirmExportSnapshot}
          isExporting={isExportingSnapshot}
        />

        <Dialog open={importReviewOpen} onOpenChange={setImportReviewOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 sm:max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>טעינת עדכונים מסטייג׳ינג — סקירה לפני יישום</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    ייושמו רק הפריטים המסומנים. השינויים נכתבים ל־<code className="text-xs">ui_settings</code>, ל־
                    <code className="text-xs">organizations</code> ול־<code className="text-xs">org_documents</code> בארגון
                    הפעיל בפרודקשן.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[50vh] pr-3 -mr-1">
              <div className="space-y-4 py-2">
                {(['org', 'ui', 'documents'] as const).map((cat) => {
                  const rows = importRows.filter((r) => r.category === cat);
                  if (rows.length === 0) return null;
                  const title =
                    cat === 'org'
                      ? 'פרטי ארגון'
                      : cat === 'ui'
                        ? 'הגדרות טפסים ותבניות'
                        : 'מסמכים מותאמים';
                  return (
                    <div key={cat} className="space-y-2 border-b border-border pb-3 last:border-b-0">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`import-cat-${cat}`}
                          checked={importCategoryAllSelected(cat)}
                          onCheckedChange={(v) => toggleImportCategory(cat, v === true)}
                        />
                        <Label htmlFor={`import-cat-${cat}`} className="cursor-pointer text-sm font-semibold">
                          {title}
                        </Label>
                      </div>
                      <ul className="space-y-2 pr-6 list-none">
                        {rows.map((row) => (
                          <li key={row.id} className="flex items-start gap-2">
                            <Checkbox
                              id={row.id}
                              checked={importSelected.has(row.id)}
                              onCheckedChange={(v) => toggleImportRow(row.id, v === true)}
                            />
                            <Label htmlFor={row.id} className="cursor-pointer flex-1 min-w-0 leading-snug">
                              <span className="flex flex-wrap items-center gap-2">
                                <span>{row.label}</span>
                                <Badge variant={row.status === 'new' ? 'default' : 'secondary'}>
                                  {row.status === 'new' ? 'חדש' : 'שונה'}
                                </Badge>
                              </span>
                            </Label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setImportReviewOpen(false)}>
                ביטול
              </Button>
              <Button type="button" onClick={() => void handleApplyCrossEnvImport()} disabled={applyImportBusy}>
                {applyImportBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    מיישם…
                  </>
                ) : (
                  'יישום הפריטים המסומנים'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {(orgLoading || settingsLoading) ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !orgId ? (
          <Card className="p-6">
            <p className="text-muted-foreground text-center">לא שויך ארגון למשתמש. נא ליצור קשר עם מנהל המערכת לשיוך ארגון.</p>
          </Card>
        ) : (
          <>
            {readOnly && (
              <p className="text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-4 py-2.5" role="status">
                You have read-only access to these settings.
              </p>
            )}
          <Tabs defaultValue="details">
            <TabsList className="w-full grid grid-cols-4 mb-6">
              <TabsTrigger value="details" className="gap-1.5 text-xs md:text-sm"><Building2 className="h-3.5 w-3.5 shrink-0 hidden sm:block" />פרטי חברה</TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5 text-xs md:text-sm"><Upload className="h-3.5 w-3.5 shrink-0 hidden sm:block" />תבניות PDF</TabsTrigger>
              <TabsTrigger value="labels" className="gap-1.5 text-xs md:text-sm"><Tag className="h-3.5 w-3.5 shrink-0 hidden sm:block" />שמות מותאמים</TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 text-xs md:text-sm"><FileText className="h-3.5 w-3.5 shrink-0 hidden sm:block" />מסמכים נוספים</TabsTrigger>
            </TabsList>

            {/* TAB 1 — Company & Texts */}
            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                    <div><CardTitle>פרטי החברה</CardTitle><CardDescription>שם הארגון, מספר ח.פ. ודוא"ל ניהולי</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="org_name">שם הארגון</Label>
                        {!readOnly && orgDetailsLocked && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="h-6 px-2 text-[10px]"
                            onClick={handleUnlockOrgDetails}
                          >
                            שינוי פרטים עם קוד
                          </Button>
                        )}
                      </div>
                      <Input
                        id="org_name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="חברה בע״מ"
                        readOnly={readOnly || orgDetailsLocked}
                        disabled={readOnly}
                        className={(readOnly || orgDetailsLocked) ? 'cursor-not-allowed opacity-80' : ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org_id">מספר ח.פ. / ע.מ.</Label>
                      <Input
                        id="org_id"
                        value={orgIdNumber}
                        onChange={(e) => setOrgIdNumber(e.target.value)}
                        placeholder="515XXXXXXX"
                        dir="ltr"
                        readOnly={readOnly || orgDetailsLocked}
                        disabled={readOnly}
                        className={(readOnly || orgDetailsLocked) ? 'cursor-not-allowed opacity-80' : ''}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin_email">דוא"ל ניהולי ראשי</Label>
                    <Input
                      id="admin_email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@company.co.il"
                      dir="ltr"
                      readOnly={readOnly || orgDetailsLocked}
                      disabled={readOnly}
                      className={(readOnly || orgDetailsLocked) ? 'cursor-not-allowed opacity-80' : ''}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10"><Heart className="h-5 w-5 text-rose-600 dark:text-rose-400" /></div>
                    <div><CardTitle>נוסח הצהרת הבריאות</CardTitle><CardDescription>כל שורה = סעיף. בשימוש כאשר אין תבנית PDF מועלית.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea value={healthText} onChange={(e) => setHealthText(e.target.value)} className="min-h-[200px] font-mono text-sm resize-y" dir="rtl" placeholder="אינני סובל/ת ממחלת עצבים..." disabled={readOnly} readOnly={readOnly} />
                  <p className="text-xs text-muted-foreground">{healthText.split('\n').filter(l => l.trim()).length} סעיפים</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10"><FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
                    <div><CardTitle>נוסח נוהל שימוש ברכב</CardTitle><CardDescription>כל שורה = סעיף. ממוספר אוטומטית.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea value={policyText} onChange={(e) => setPolicyText(e.target.value)} className="min-h-[300px] font-mono text-sm resize-y" dir="rtl" placeholder="הרכב ישמש לצרכי עבודה בלבד..." disabled={readOnly} readOnly={readOnly} />
                  <p className="text-xs text-muted-foreground">{policyText.split('\n').filter(l => l.trim()).length} סעיפים</p>
                </CardContent>
              </Card>
              {!readOnly && (
                <div className="flex justify-start pb-6">
                  <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                    {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור הגדרות
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB 2 — PDF Templates */}
            <TabsContent value="templates" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10"><Upload className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /></div>
                    <div><CardTitle>תבניות PDF לחתימה</CardTitle><CardDescription>העלה קובץ PDF של הטופס הרשמי. הנהג יצפה בו בתוך האשף ויחתום.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                    <strong>הערה:</strong> כאשר תבנית מועלית — האשף יציג אותה לנהג ויאסוף חתימה נפרדת. ללא תבנית — ייווצר PDF מהטקסט שב"פרטי חברה".
                  </div>
                  <PdfUploadSlot slot="health" label="הצהרת בריאות — תבנית PDF" description="הנהג יצפה ויחתום דיגיטלית" currentUrl={healthPdfUrl} onUploaded={(u) => setHealthPdfUrl(u || null)} readOnly={readOnly} />
                  <PdfUploadSlot slot="policy" label="נוהל שימוש ברכב — תבנית PDF" description="הנהג יקרא ויאשר בחתימה" currentUrl={policyPdfUrl} onUploaded={(u) => setPolicyPdfUrl(u || null)} readOnly={readOnly} />
                </CardContent>
              </Card>
              {!readOnly && (
                <div className="flex justify-start pb-6">
                  <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                    {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור קישורי תבניות
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB 3 — White Labeling */}
            <TabsContent value="labels" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10"><Tag className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div>
                    <div>
                      <CardTitle>שמות מותאמים (White Labeling)</CardTitle>
                      <CardDescription>שנה שמות כפתורים ותפריטים, או הסתר פריטים מהתפריט לגמרי. שינויים יושפעו בסידבר ובכפתורי האפליקציה.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  {labelsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-6">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_180px_60px] gap-3 px-1 pb-1 border-b border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">שם ברירת מחדל</p>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">שם מותאם</p>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">הצג</p>
                      </div>
                      {/* Group items */}
                      {Object.entries(
                        (labels ?? []).reduce<Record<string, UiLabel[]>>((acc, lbl) => {
                          const g = lbl.group_name || 'כללי';
                          if (!acc[g]) acc[g] = [];
                          acc[g].push(lbl);
                          return acc;
                        }, {})
                      ).map(([groupName, items]) => (
                        <div key={groupName} className="space-y-1">
                          <h3 className="text-xs font-bold text-foreground/50 uppercase tracking-widest px-1 mb-2">{groupName}</h3>
                          {items.map((lbl) => {
                            const edit = labelEdits[lbl.key] ?? { custom_label: lbl.custom_label, is_visible: lbl.is_visible !== false };
                            const setEdit = (patch: Partial<{ custom_label: string; is_visible: boolean }>) =>
                              setLabelEdits(prev => ({ ...prev, [lbl.key]: { ...edit, ...patch } }));
                            return (
                              <div
                                key={lbl.key}
                                className={`grid grid-cols-[1fr_180px_60px] gap-3 items-center px-2 py-2 rounded-lg transition-colors ${
                                  edit.is_visible ? 'hover:bg-muted/40' : 'opacity-50 bg-muted/20'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground leading-tight truncate">{lbl.default_label}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono truncate">{lbl.key}</p>
                                </div>
                                <Input
                                  value={edit.custom_label}
                                  onChange={(e) => setEdit({ custom_label: e.target.value })}
                                  placeholder={lbl.default_label}
                                  className="text-sm h-8"
                                  disabled={readOnly || !edit.is_visible}
                                />
                                <div className="flex justify-center">
                                  <Switch
                                    checked={edit.is_visible}
                                    onCheckedChange={(v) => setEdit({ is_visible: v })}
                                    disabled={readOnly}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {!readOnly && (
                <div className="flex justify-start pb-6">
                  <Button onClick={handleSaveLabels} disabled={savingLabels} size="lg" className="gap-2 px-8">
                    {savingLabels ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור שנויים
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB 4 — Dynamic Documents */}
            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10"><FileText className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
                      <div><CardTitle>מסמכים נוספים</CardTitle><CardDescription>טפסים מותאמים — לאשף המסירה או כקישורים עצמאיים לנהג.</CardDescription></div>
                    </div>
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={repairingDocs || docsLoading || hardResettingUi}
                          onClick={() => void handleRepairInvalidDocs()}
                        >
                          {repairingDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          ניקוי שורות ללא כותרת
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                          disabled={hardResettingUi || docsLoading || repairingDocs}
                          title="מחיקה קשה ב־org_documents (שורות לא פעילות או ללא כותרת)"
                          onClick={() => void handleHardResetUiSettings()}
                        >
                          {hardResettingUi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Hard Reset UI Settings
                        </Button>
                        <Button size="sm" className="gap-2" onClick={() => { setAddingDoc(true); setEditingDoc(null); }}>
                          <Plus className="h-4 w-4" /> הוסף מסמך
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {addingDoc && !editingDoc && (
                    <DocForm initial={{}} onSave={handleSaveDoc} onCancel={() => setAddingDoc(false)} saving={createDoc.isPending} />
                  )}
                  {docsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : sortedDocs.length === 0 && !addingDoc ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">אין מסמכים נוספים עדיין</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedDocs.map((doc) => (
                        <React.Fragment key={doc.id}>
                          {editingDoc?.id === doc.id ? (
                            <DocForm initial={doc} onSave={handleSaveDoc} onCancel={() => setEditingDoc(null)} saving={updateDoc.isPending} />
                          ) : (
                            <DocRow doc={doc} onEdit={(d) => { setEditingDoc(d); setAddingDoc(false); }} onDelete={handleDeleteDoc} readOnly={readOnly} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
