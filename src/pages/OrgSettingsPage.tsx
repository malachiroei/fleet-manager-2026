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
import { useOrgSettings, useUpdateOrgSettings, uploadTemplatePdf } from '@/hooks/useOrgSettings';
import { useUiLabels, useUpdateUiLabels } from '@/hooks/useUiLabels';
import {
  useOrgDocumentsAdmin, useCreateOrgDocument,
  useUpdateOrgDocument, useDeleteOrgDocument,
  OrgDocument,
} from '@/hooks/useOrgDocuments';

// â”€â”€â”€ PDF Template Upload slot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PdfUploadSlot({ label, description, currentUrl, onUploaded, slot }: {
  label: string; description: string; currentUrl: string | null;
  onUploaded: (url: string) => void; slot: 'health' | 'policy';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) { toast.error('× × ×œ×”×¢×œ×•×ª ×§×•×‘×¥ PDF ×‘×œ×‘×“'); return; }
    setUploading(true);
    try {
      const url = await uploadTemplatePdf(f, slot);
      onUploaded(url);
      toast.success(`×ª×‘× ×™×ª "${label}" ×”×•×¢×œ×ª×” ×‘×”×¦×œ×—×”`);
    } catch (err: any) {
      toast.error(`×©×’×™××” ×‘×”×¢×œ××”: ${err?.message ?? err}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {currentUrl && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" /> ×ª×¦×•×’×” ×ž×§×“×™×ž×”
            </Button>
          </a>
        )}
      </div>
      {currentUrl ? (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
          <FileCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-xs text-green-700 dark:text-green-300 truncate flex-1">×§×•×‘×¥ ×ž×•×¢×œ×”</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onUploaded('')}>×”×—×œ×£</Button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors" onClick={() => inputRef.current?.click()}>
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            : <><Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">×œ×—×¥ ×œ×”×¢×œ××ª PDF</p></>
          }
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFile} />
    </div>
  );
}

// â”€â”€â”€ Document row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DocRow({ doc, onEdit, onDelete }: { doc: OrgDocument; onEdit: (d: OrgDocument) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 border border-border rounded-xl p-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{doc.title}</p>
        {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
        <div className="flex flex-wrap gap-2 mt-2">
          {doc.include_in_handover && <span className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 rounded-full px-2 py-0.5">×›×œ×•×œ ×‘××©×£ ×ž×¡×™×¨×”</span>}
          {doc.is_standalone && <span className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 rounded-full px-2 py-0.5">×˜×•×¤×¡ ×¢×¦×ž××™</span>}
          {doc.requires_signature && <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-full px-2 py-0.5">×“×•×¨×© ×—×ª×™×ž×”</span>}
          {doc.file_url && <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}><ExternalLink className="h-3 w-3" /> ×§×•×‘×¥</a>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => onDelete(doc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Add/Edit Document form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    <div className="border border-primary/30 bg-muted/20 rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1"><Label>×©× ×”×ž×¡×ž×š *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="×œ×“×•×’×ž×”: ×“×•×— × ×–×§" /></div>
        <div className="space-y-1"><Label>×ª×™××•×¨</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="×ª×™××•×¨ ×§×¦×¨" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-2"><Switch checked={inHandover} onCheckedChange={setInHandover} id="in-handover" /><Label htmlFor="in-handover" className="cursor-pointer text-sm">×›×œ×•×œ ×‘××©×£ ×ž×¡×™×¨×”</Label></div>
        <div className="flex items-center gap-2"><Switch checked={standalone} onCheckedChange={setStandalone} id="standalone" /><Label htmlFor="standalone" className="cursor-pointer text-sm">×˜×•×¤×¡ ×¢×¦×ž××™</Label></div>
        <div className="flex items-center gap-2"><Switch checked={reqSig} onCheckedChange={setReqSig} id="req-sig" /><Label htmlFor="req-sig" className="cursor-pointer text-sm">×“×•×¨×© ×—×ª×™×ž×”</Label></div>
      </div>
      <div>
        <Label>×§×•×‘×¥ PDF (××•×¤×¦×™×•× ×œ×™)</Label>
        <div className="flex items-center gap-3 mt-1">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="gap-2"><Upload className="h-3.5 w-3.5" />{file ? file.name : '×‘×—×¨ ×§×•×‘×¥'}</Button>
          {initial.file_url && !file && <a href={initial.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" /> ×§×•×‘×¥ ×§×™×™×</a>}
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ title, description, include_in_handover: inHandover, is_standalone: standalone, requires_signature: reqSig, file: file ?? undefined })} disabled={!title.trim() || saving} size="sm" className="gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} ×©×ž×•×¨
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>×‘×™×˜×•×œ</Button>
      </div>
    </div>
  );
}

export default function OrgSettingsPage() {
  const { data: settings, isLoading } = useOrgSettings();
  const updateSettings = useUpdateOrgSettings();

  // Tab 1 state
  const [orgName, setOrgName] = useState('');
  const [orgIdNumber, setOrgIdNumber] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [healthText, setHealthText] = useState('');
  const [policyText, setPolicyText] = useState('');
  const [healthPdfUrl, setHealthPdfUrl] = useState<string | null>(null);
  const [policyPdfUrl, setPolicyPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setOrgName(settings.org_name ?? '');
    setOrgIdNumber(settings.org_id_number ?? '');
    setAdminEmail(settings.admin_email ?? '');
    setHealthText(settings.health_statement_text ?? '');
    setPolicyText(settings.vehicle_policy_text ?? '');
    setHealthPdfUrl((settings as any).health_statement_pdf_url ?? null);
    setPolicyPdfUrl((settings as any).vehicle_policy_pdf_url ?? null);
  }, [settings]);

  const handleSaveDetails = async () => {
    try {
      await updateSettings.mutateAsync({
        org_name: orgName.trim(),
        org_id_number: orgIdNumber.trim(),
        admin_email: adminEmail.trim(),
        health_statement_text: healthText,
        vehicle_policy_text: policyText,
        health_statement_pdf_url: healthPdfUrl || null,
        vehicle_policy_pdf_url: policyPdfUrl || null,
      } as any);
      toast.success('×”×’×“×¨×•×ª ×”××¨×’×•×Ÿ × ×©×ž×¨×• ×‘×”×¦×œ×—×”');
    } catch { toast.error('×©×ž×™×¨×” × ×›×©×œ×”'); }
  };

  // Tab 3 â€” UI Labels
  const { data: labels, isLoading: labelsLoading } = useUiLabels();
  const updateLabels = useUpdateUiLabels();
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
  const [savingLabels, setSavingLabels] = useState(false);

  useEffect(() => {
    if (!labels) return;
    const map: Record<string, string> = {};
    labels.forEach((l) => { map[l.key] = l.custom_label; });
    setLabelEdits(map);
  }, [labels]);

  const handleSaveLabels = async () => {
    setSavingLabels(true);
    try {
      await updateLabels.mutateAsync(Object.entries(labelEdits).map(([key, custom_label]) => ({ key, custom_label: String(custom_label) })));
      toast.success('×©×ž×•×ª ×ž×•×ª××ž×™× × ×©×ž×¨×•');
    } catch { toast.error('×©×ž×™×¨×” × ×›×©×œ×”'); }
    finally { setSavingLabels(false); }
  };

  // Tab 4 â€” Dynamic Documents
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
      toast.success(editingDoc ? '×ž×¡×ž×š ×¢×•×“×›×Ÿ' : '×ž×¡×ž×š × ×•×¡×£');
    } catch { toast.error('×©×ž×™×¨×” × ×›×©×œ×”'); }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('×œ×ž×—×•×§ ×ž×¡×ž×š ×–×”?')) return;
    try { await deleteDoc.mutateAsync(id); toast.success('×ž×¡×ž×š ×”×•×¡×¨'); }
    catch { toast.error('×ž×—×™×§×” × ×›×©×œ×”'); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6" dir="rtl">

        <div className="flex items-center gap-4">
          <Link to="/admin/settings">
            <Button variant="ghost" size="icon" className="rounded-full"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">×”×’×“×¨×•×ª ××¨×’×•×Ÿ</h1>
            <p className="text-muted-foreground text-sm">× ×™×”×•×œ ×¤×¨×˜×™ ×—×‘×¨×”, ×ª×‘× ×™×•×ª PDF, ×©×ž×•×ª ×ž×•×ª××ž×™× ×•×ž×¡×ž×›×™× × ×•×¡×¤×™×</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="details">
            <TabsList className="w-full grid grid-cols-4 mb-6">
              <TabsTrigger value="details" className="gap-1.5 text-xs md:text-sm"><Building2 className="h-3.5 w-3.5 shrink-0 hidden sm:block" />×¤×¨×˜×™ ×—×‘×¨×”</TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5 text-xs md:text-sm"><Upload className="h-3.5 w-3.5 shrink-0 hidden sm:block" />×ª×‘× ×™×•×ª PDF</TabsTrigger>
              <TabsTrigger value="labels" className="gap-1.5 text-xs md:text-sm"><Tag className="h-3.5 w-3.5 shrink-0 hidden sm:block" />×©×ž×•×ª ×ž×•×ª××ž×™×</TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 text-xs md:text-sm"><FileText className="h-3.5 w-3.5 shrink-0 hidden sm:block" />×ž×¡×ž×›×™× × ×•×¡×¤×™×</TabsTrigger>
            </TabsList>

            {/* TAB 1 â€” Company & Texts */}
            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                    <div><CardTitle>×¤×¨×˜×™ ×”×—×‘×¨×”</CardTitle><CardDescription>×©× ×”××¨×’×•×Ÿ, ×ž×¡×¤×¨ ×—.×¤. ×•×“×•×"×œ × ×™×”×•×œ×™</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="org_name">×©× ×”××¨×’×•×Ÿ</Label><Input id="org_name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="×—×‘×¨×” ×‘×¢×´×ž" /></div>
                    <div className="space-y-2"><Label htmlFor="org_id">×ž×¡×¤×¨ ×—.×¤. / ×¢.×ž.</Label><Input id="org_id" value={orgIdNumber} onChange={(e) => setOrgIdNumber(e.target.value)} placeholder="515XXXXXXX" dir="ltr" /></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="admin_email">×“×•×"×œ × ×™×”×•×œ×™ ×¨××©×™</Label><Input id="admin_email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@company.co.il" dir="ltr" /></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10"><Heart className="h-5 w-5 text-rose-600 dark:text-rose-400" /></div>
                    <div><CardTitle>× ×•×¡×— ×”×¦×”×¨×ª ×”×‘×¨×™××•×ª</CardTitle><CardDescription>×›×œ ×©×•×¨×” = ×¡×¢×™×£. ×‘×©×™×ž×•×© ×›××©×¨ ××™×Ÿ ×ª×‘× ×™×ª PDF ×ž×•×¢×œ×™×ª.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea value={healthText} onChange={(e) => setHealthText(e.target.value)} className="min-h-[200px] font-mono text-sm resize-y" dir="rtl" placeholder="××™× × ×™ ×¡×•×‘×œ/×ª ×ž×ž×—×œ×ª ×¢×¦×‘×™×..." />
                  <p className="text-xs text-muted-foreground">{healthText.split('\n').filter(l => l.trim()).length} ×¡×¢×™×¤×™×</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10"><FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
                    <div><CardTitle>× ×•×¡×— × ×•×”×œ ×©×™×ž×•×© ×‘×¨×›×‘</CardTitle><CardDescription>×›×œ ×©×•×¨×” = ×¡×¢×™×£. ×ž×ž×•×¡×¤×¨ ××•×˜×•×ž×˜×™×ª.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea value={policyText} onChange={(e) => setPolicyText(e.target.value)} className="min-h-[300px] font-mono text-sm resize-y" dir="rtl" placeholder="×”×¨×›×‘ ×™×©×ž×© ×œ×¦×¨×›×™ ×¢×‘×•×“×” ×‘×œ×‘×“..." />
                  <p className="text-xs text-muted-foreground">{policyText.split('\n').filter(l => l.trim()).length} ×¡×¢×™×¤×™×</p>
                </CardContent>
              </Card>
              <div className="flex justify-start pb-6">
                <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ×©×ž×•×¨ ×”×’×“×¨×•×ª
                </Button>
              </div>
            </TabsContent>

            {/* TAB 2 â€” PDF Templates */}
            <TabsContent value="templates" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10"><Upload className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /></div>
                    <div><CardTitle>×ª×‘× ×™×•×ª PDF ×œ×—×ª×™×ž×”</CardTitle><CardDescription>×”×¢×œ×” ×§×•×‘×¥ PDF ×©×œ ×”×˜×•×¤×¡ ×”×¨×©×ž×™. ×”× ×”×’ ×™×¦×¤×” ×‘×• ×‘×ª×•×š ×”××©×£ ×•×™×—×ª×•×.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                    <strong>×”×¢×¨×”:</strong> ×›××©×¨ ×ª×‘× ×™×ª ×ž×•×¢×œ×™×ª â€” ×”××©×£ ×™×¦×™×’ ××•×ª×” ×œ× ×”×’ ×•×™××¡×•×£ ×—×ª×™×ž×” × ×¤×¨×“×ª. ×œ×œ× ×ª×‘× ×™×ª â€” ×™×™×•×•×¦×¨ PDF ×ž×”×˜×§×¡×˜ ×©×‘"×¤×¨×˜×™ ×—×‘×¨×”".
                  </div>
                  <PdfUploadSlot slot="health" label="×”×¦×”×¨×ª ×‘×¨×™××•×ª â€” ×ª×‘× ×™×ª PDF" description="×”× ×”×’ ×™×¦×¤×” ×•×™×—×ª×•× ×“×™×’×™×˜×œ×™×ª" currentUrl={healthPdfUrl} onUploaded={(u) => setHealthPdfUrl(u || null)} />
                  <PdfUploadSlot slot="policy" label="× ×•×”×œ ×©×™×ž×•×© ×‘×¨×›×‘ â€” ×ª×‘× ×™×ª PDF" description="×”× ×”×’ ×™×§×¨× ×•×™××©×¨ ×‘×—×ª×™×ž×”" currentUrl={policyPdfUrl} onUploaded={(u) => setPolicyPdfUrl(u || null)} />
                </CardContent>
              </Card>
              <div className="flex justify-start pb-6">
                <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ×©×ž×•×¨ ×§×™×©×•×¨×™ ×ª×‘× ×™×•×ª
                </Button>
              </div>
            </TabsContent>

            {/* TAB 3 â€” White Labeling */}
            <TabsContent value="labels" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10"><Tag className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div>
                    <div><CardTitle>×©×ž×•×ª ×ž×•×ª××ž×™× (White Labeling)</CardTitle><CardDescription>×©× ×” ×©×ž×•×ª ×›×¤×ª×•×¨×™× ×•×ª×¤×¨×™×˜×™×. ×”×©××¨ ×¨×™×§ ×œ×©×ž×™×¨×ª ×‘×¨×™×¨×ª ×ž×—×“×œ.</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent>
                  {labelsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-3">
                      {(labels ?? []).map((lbl) => (
                        <div key={lbl.key} className="grid grid-cols-2 gap-3 items-center py-1 border-b border-border/50 last:border-0">
                          <div>
                            <p className="text-xs text-muted-foreground font-mono">{lbl.key}</p>
                            <p className="text-sm font-medium text-foreground">{lbl.default_label}</p>
                          </div>
                          <Input
                            value={labelEdits[lbl.key] ?? ''}
                            onChange={(e) => setLabelEdits(prev => ({ ...prev, [lbl.key]: e.target.value }))}
                            placeholder={lbl.default_label}
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="flex justify-start pb-6">
                <Button onClick={handleSaveLabels} disabled={savingLabels} size="lg" className="gap-2 px-8">
                  {savingLabels ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ×©×ž×•×¨ ×©×ž×•×ª
                </Button>
              </div>
            </TabsContent>

            {/* TAB 4 â€” Dynamic Documents */}
            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10"><FileText className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
                      <div><CardTitle>×ž×¡×ž×›×™× × ×•×¡×¤×™×</CardTitle><CardDescription>×˜×¤×¡×™× ×ž×•×ª××ž×™× â€” ×œ××©×£ ×”×ž×¡×™×¨×” ××• ×›×§×™×©×•×¨×™× ×¢×¦×ž××™×™× ×œ× ×”×’.</CardDescription></div>
                    </div>
                    <Button size="sm" className="gap-2 shrink-0" onClick={() => { setAddingDoc(true); setEditingDoc(null); }}>
                      <Plus className="h-4 w-4" /> ×”×•×¡×£ ×ž×¡×ž×š
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
                      <p className="text-sm">××™×Ÿ ×ž×¡×ž×›×™× × ×•×¡×¤×™× ×¢×“×™×™×Ÿ</p>
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
