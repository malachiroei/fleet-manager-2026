import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  ArrowRight, Building2, FileText, Heart, Loader2, Save,
  Upload, ExternalLink, Trash2, Plus, Pencil, FileCheck, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganizations';
import { useOrgSettings, useUpdateOrgSettings, uploadTemplatePdf } from '@/hooks/useOrgSettings';
import { useUiLabels, useUpdateUiLabels, UiLabel } from '@/hooks/useUiLabels';
import {
  useOrgDocumentsAdmin, useCreateOrgDocument,
  useUpdateOrgDocument, useDeleteOrgDocument,
  OrgDocument,
} from '@/hooks/useOrgDocuments';

// ─── PDF Template Upload slot ─────────────────────────────────────
function PdfUploadSlot({ label, description, currentUrl, onUploaded, slot }: {
  label: string; description: string; currentUrl: string | null;
  onUploaded: (url: string) => void; slot: 'health' | 'policy';
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
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onUploaded('')} title="הסר תבנית">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="gap-2 w-full"
          disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'מעלה...' : 'העלה PDF'}
        </Button>
      )}
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Document row ──────────────────────────────────────────────────
function DocRow({ doc, onEdit, onDelete }: {
  doc: OrgDocument; onEdit: (d: OrgDocument) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 border border-border rounded-xl p-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{doc.title}</p>
        {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
        <div className="flex flex-wrap gap-2 mt-2">
          {doc.include_in_handover && <span className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 rounded-full px-2 py-0.5">כלול באשף מסירה</span>}
          {doc.is_standalone && <span className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 rounded-full px-2 py-0.5">טופס עצמאי</span>}
          {doc.requires_signature && <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-full px-2 py-0.5">דורש חתימה</span>}
          {doc.file_url && <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}><ExternalLink className="h-3 w-3" /> קובץ</a>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => onDelete(doc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
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
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? null;
  const { data: organization, isLoading: orgLoading } = useOrganization(orgId);
  const updateOrganization = useUpdateOrganization();
  const { data: settings, isLoading: settingsLoading } = useOrgSettings(orgId);
  const updateSettings = useUpdateOrgSettings();

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
        organization_id: orgId ?? undefined,
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
  const { data: labels, isLoading: labelsLoading } = useUiLabels();
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
          title: '', description: '', file_url: null,
          include_in_handover: false, is_standalone: false,
          requires_signature: true, sort_order: 0, is_active: true, ...data,
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6" dir="rtl">

        <div className="flex items-center gap-4">
          <Link to="/admin/settings">
            <Button variant="ghost" size="icon" className="rounded-full"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הגדרות ארגון</h1>
            <p className="text-muted-foreground text-sm">ניהול פרטי חברה, תבניות PDF, שמות מותאמים ומסמכים נוספים</p>
          </div>
        </div>

        {(orgLoading || settingsLoading) ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !orgId ? (
          <Card className="p-6">
            <p className="text-muted-foreground text-center">לא שויך ארגון למשתמש. נא ליצור קשר עם מנהל המערכת לשיוך ארגון.</p>
          </Card>
        ) : (
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
                        {orgDetailsLocked && (
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
                        readOnly={orgDetailsLocked}
                        className={orgDetailsLocked ? 'cursor-not-allowed opacity-80' : ''}
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
                        readOnly={orgDetailsLocked}
                        className={orgDetailsLocked ? 'cursor-not-allowed opacity-80' : ''}
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
                      readOnly={orgDetailsLocked}
                      className={orgDetailsLocked ? 'cursor-not-allowed opacity-80' : ''}
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
                  <Textarea value={healthText} onChange={(e) => setHealthText(e.target.value)} className="min-h-[200px] font-mono text-sm resize-y" dir="rtl" placeholder="אינני סובל/ת ממחלת עצבים..." />
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
                  <Textarea value={policyText} onChange={(e) => setPolicyText(e.target.value)} className="min-h-[300px] font-mono text-sm resize-y" dir="rtl" placeholder="הרכב ישמש לצרכי עבודה בלבד..." />
                  <p className="text-xs text-muted-foreground">{policyText.split('\n').filter(l => l.trim()).length} סעיפים</p>
                </CardContent>
              </Card>
              <div className="flex justify-start pb-6">
                <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור הגדרות
                </Button>
              </div>
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
                  <PdfUploadSlot slot="health" label="הצהרת בריאות — תבנית PDF" description="הנהג יצפה ויחתום דיגיטלית" currentUrl={healthPdfUrl} onUploaded={(u) => setHealthPdfUrl(u || null)} />
                  <PdfUploadSlot slot="policy" label="נוהל שימוש ברכב — תבנית PDF" description="הנהג יקרא ויאשר בחתימה" currentUrl={policyPdfUrl} onUploaded={(u) => setPolicyPdfUrl(u || null)} />
                </CardContent>
              </Card>
              <div className="flex justify-start pb-6">
                <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור קישורי תבניות
                </Button>
              </div>
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
                                  disabled={!edit.is_visible}
                                />
                                <div className="flex justify-center">
                                  <Switch
                                    checked={edit.is_visible}
                                    onCheckedChange={(v) => setEdit({ is_visible: v })}
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
              <div className="flex justify-start pb-6">
                <Button onClick={handleSaveLabels} disabled={savingLabels} size="lg" className="gap-2 px-8">
                  {savingLabels ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור שנויים
                </Button>
              </div>
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
                    <Button size="sm" className="gap-2 shrink-0" onClick={() => { setAddingDoc(true); setEditingDoc(null); }}>
                      <Plus className="h-4 w-4" /> הוסף מסמך
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {addingDoc && !editingDoc && (
                    <DocForm initial={{}} onSave={handleSaveDoc} onCancel={() => setAddingDoc(false)} saving={createDoc.isPending} />
                  )}
                  {docsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (docs ?? []).length === 0 && !addingDoc ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">אין מסמכים נוספים עדיין</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(docs ?? []).map((doc) => (
                        <React.Fragment key={doc.id}>
                          {editingDoc?.id === doc.id ? (
                            <DocForm initial={doc} onSave={handleSaveDoc} onCancel={() => setEditingDoc(null)} saving={updateDoc.isPending} />
                          ) : (
                            <DocRow doc={doc} onEdit={(d) => { setEditingDoc(d); setAddingDoc(false); }} onDelete={handleDeleteDoc} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        )}
      </div>
    </div>
  );
}
