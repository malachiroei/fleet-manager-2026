import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveRestore, Download, FileText, FolderCog, GripVertical, Loader2, MoreHorizontal, Pencil, Plus, Settings, Trash2, Upload } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { OrgDocument, useOrgDocuments, useOrgDocumentsAdmin, useCreateOrgDocument, useUpdateOrgDocument } from '@/hooks/useOrgDocuments';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { useDrivers } from '@/hooks/useDrivers';
import { useVehicles } from '@/hooks/useVehicles';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { HANDOVER_ACCESSORY_CEILINGS, formatCeilingPrice } from '@/lib/accessoryCeilings';
import { buildFormsAutoFillContext, FormsCategory, resolveSchemaAutoFill } from '@/lib/formsAutofill';
import hebrewFontUrl from '@/assets/fonts/NotoSansHebrew.ttf?url';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function FormCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-4/5" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  );
}

const DEFAULT_FORM_FOLDERS: FormsCategory[] = ['תפעול', 'בטיחות', 'מסמכים אישיים'];
type CategoryFilter = FormsCategory | 'הכל';
const FORMS_MANAGER_EMAIL_ALLOWLIST = ['malachiroei@gmail.com'];
const ALLOWED_FORM_EXTENSIONS = ['pdf', 'doc', 'docx'];
type TemplateMode = 'file' | 'generated';
const DELETE_FORMS_PASSWORD = '2101';
const FORMS_CUSTOM_FOLDERS_STORAGE_KEY = 'forms-custom-folders-v1';
const FORMS_REVIEW_MARKS_STORAGE_KEY = 'forms-review-marks-v1';
type FormReviewMark = 'keep' | 'delete';

const isDefaultFolder = (folder: string) => DEFAULT_FORM_FOLDERS.includes(folder);
const getPersistedCategory = (folder: string): FormsCategory => (isDefaultFolder(folder) ? folder : DEFAULT_FORM_FOLDERS[0]);
const withCustomFolderInSchema = (schema: Record<string, any> | null | undefined, folder: string) => {
  const nextSchema = schema && typeof schema === 'object' ? { ...schema } : {};
  if (isDefaultFolder(folder)) {
    delete (nextSchema as any).custom_folder;
  } else {
    (nextSchema as any).custom_folder = folder;
  }
  return Object.keys(nextSchema).length > 0 ? nextSchema : null;
};

const STANDARD_INPUT_FOOTER_TEXT = [
  'פרטים אישיים ואישור (לפני חתימה):',
  'אישור סופי: "אישור זה נחתם לאחר שבררתי את כל זכויותיי, ללא כפיה ובדעה צלולה."',
  '- שם פרטי + משפחה: [משיכה אוטומטית/קבוע]',
  '- מספר ת"ז: [שדה חובה להזנה]',
  '- מספר רישוי: [משיכה אוטומטית/קבוע]',
  '- תאריך: [מילוי אוטומטי של היום]',
].join('\n');

const STANDARD_INPUT_VALIDATION_SCHEMA = {
  manual_fields: [
    { key: 'id_number', label: 'מספר ת"ז', pattern: '^\\d{9}$', error: 'מספר ת"ז חייב להכיל 9 ספרות' },
    { key: 'employee_name', label: 'שם פרטי + משפחה', source: 'employee_name', readOnly: true },
    { key: 'vehicle_number', label: 'מספר רישוי', source: 'vehicle_number', readOnly: true },
    { key: 'date', label: 'תאריך', source: 'date', readOnly: true },
  ],
};

let cachedHebrewFontBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function FormsPage() {
  const queryClient = useQueryClient();
  const { user, isManager } = useAuth();
  const { data: orgSettings } = useOrgSettings();
  const [searchParams] = useSearchParams();
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();
  const { data: forms, isLoading } = useOrgDocuments();
  const { data: allForms } = useOrgDocumentsAdmin();
  const createForm = useCreateOrgDocument({ storageFolder: 'templates' });
  const updateForm = useUpdateOrgDocument({ storageFolder: 'templates' });

  const contextDriver = useMemo(() => {
    const driverId = searchParams.get('driverId');
    if (!driverId) return null;
    return (drivers ?? []).find((d) => d.id === driverId) ?? null;
  }, [drivers, searchParams]);

  const contextVehicle = useMemo(() => {
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) return null;
    return (vehicles ?? []).find((v) => v.id === vehicleId) ?? null;
  }, [vehicles, searchParams]);

  const autoFillContext = useMemo(
    () => buildFormsAutoFillContext({ user, driver: contextDriver, vehicle: contextVehicle }),
    [contextDriver, contextVehicle, user],
  );
  const canManageForms = useMemo(() => {
    if (isManager) return true;
    if (user?.email && FORMS_MANAGER_EMAIL_ALLOWLIST.includes(user.email.toLowerCase())) return true;

    const metadataRole = String(
      (user?.app_metadata as any)?.role ?? (user?.user_metadata as any)?.role ?? '',
    ).toLowerCase();
    if (metadataRole === 'admin' || metadataRole === 'fleet_manager') return true;

    const adminEmails = String(orgSettings?.admin_email ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    return !!user?.email && adminEmails.includes(user.email.toLowerCase());
  }, [isManager, orgSettings?.admin_email, user?.app_metadata, user?.email, user?.user_metadata]);
  const [formsManagementUnlocked, setFormsManagementUnlocked] = useState(false);
  const [managementAuthOpen, setManagementAuthOpen] = useState(false);
  const [managementPassword, setManagementPassword] = useState('');
  const canShowManagementControls = canManageForms && formsManagementUnlocked;
  const canDeleteForms = canShowManagementControls;

  const [open, setOpen] = useState(false);
  const [quickUploadOpen, setQuickUploadOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FormsCategory>('תפעול');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('הכל');
  const [file, setFile] = useState<File | null>(null);
  const [templateMode, setTemplateMode] = useState<TemplateMode>('file');
  const [generatedContent, setGeneratedContent] = useState('');
  const [includeInHandover, setIncludeInHandover] = useState(false);
  const [includeInDelivery, setIncludeInDelivery] = useState(false);
  const [includeInReturn, setIncludeInReturn] = useState(false);
  const [syncingBuiltin, setSyncingBuiltin] = useState(false);
  const [editingForm, setEditingForm] = useState<OrgDocument | null>(null);
  const [contentEditorOpen, setContentEditorOpen] = useState(false);
  const [contentEditingForm, setContentEditingForm] = useState<(OrgDocument & { category: FormsCategory }) | null>(null);
  const [contentEditorTitle, setContentEditorTitle] = useState('');
  const [contentEditorDescription, setContentEditorDescription] = useState('');
  const [contentEditorValue, setContentEditorValue] = useState('');
  const [contentEditorConverting, setContentEditorConverting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState<(OrgDocument & { category: FormsCategory }) | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<FormsCategory>('תפעול');
  const [renamedFolderValue, setRenamedFolderValue] = useState('');
  const [folderToMoveAll, setFolderToMoveAll] = useState<FormsCategory>('תפעול');
  const [folderMoveTarget, setFolderMoveTarget] = useState('');
  const [newFolderValue, setNewFolderValue] = useState('');
  const [customFolders, setCustomFolders] = useState<FormsCategory[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(FORMS_CUSTOM_FOLDERS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => String(item).trim())
        .filter((item): item is FormsCategory => Boolean(item));
    } catch {
      return [];
    }
  });
  const [formReviewMarks, setFormReviewMarks] = useState<Record<string, FormReviewMark>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(FORMS_REVIEW_MARKS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value === 'keep' || value === 'delete'),
      ) as Record<string, FormReviewMark>;
    } catch {
      return {};
    }
  });
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [movingFolder, setMovingFolder] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [formToMove, setFormToMove] = useState<(OrgDocument & { category: FormsCategory }) | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<FormsCategory>('תפעול');
  const [moveTargetFolderCustom, setMoveTargetFolderCustom] = useState('');
  const [movingForm, setMovingForm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [restoringFormId, setRestoringFormId] = useState<string | null>(null);
  const [draggedForm, setDraggedForm] = useState<{
    id: string;
    title: string;
    category: FormsCategory;
    jsonSchema?: Record<string, any> | null;
  } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<FormsCategory | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FORMS_CUSTOM_FOLDERS_STORAGE_KEY, JSON.stringify(customFolders));
  }, [customFolders]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FORMS_REVIEW_MARKS_STORAGE_KEY, JSON.stringify(formReviewMarks));
  }, [formReviewMarks]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory(DEFAULT_FORM_FOLDERS[0]);
    setEditingForm(null);
    setFile(null);
    setTemplateMode('file');
    setGeneratedContent('');
    setIncludeInHandover(false);
    setIncludeInDelivery(false);
    setIncludeInReturn(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const openCreateDialog = () => {
    resetForm();
    setOpen(true);
  };

  const openEditDialog = (form: OrgDocument & { category: FormsCategory }) => {
    const schema = (form.json_schema as any) ?? {};
    const isGenerated = schema?.template_mode === 'generated';
    setEditingForm(form);
    setTitle(form.title);
    setDescription(form.description ?? '');
    setCategory(form.category);
    setTemplateMode(isGenerated ? 'generated' : 'file');
    setGeneratedContent(isGenerated ? String(schema?.template_content ?? '') : '');
    setIncludeInHandover(Boolean(form.include_in_handover));
    setIncludeInDelivery(Boolean(form.include_in_delivery));
    setIncludeInReturn(Boolean(form.include_in_return));
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setOpen(true);
  };

  const openContentEditor = (form: OrgDocument & { category: FormsCategory }) => {
    const schema = (form.json_schema as any) ?? {};
    const isGenerated = schema?.template_mode === 'generated';
    setContentEditingForm(form);
    setContentEditorTitle(form.title ?? '');
    setContentEditorDescription(form.description ?? '');
    setContentEditorValue(isGenerated ? String(schema?.template_content ?? '') : '');
    setContentEditorConverting(!isGenerated);
    setContentEditorOpen(true);
  };

  const generateStyledPdfBlob = async (
    formTitle: string,
    content: string,
    headerContext?: { employeeName?: string; vehicleNumber?: string },
  ) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const rightX = doc.internal.pageSize.getWidth() - 40;

    if (!cachedHebrewFontBase64) {
      const fontResponse = await fetch(hebrewFontUrl);
      if (!fontResponse.ok) {
        throw new Error(`טעינת פונט עברי נכשלה (${fontResponse.status})`);
      }
      cachedHebrewFontBase64 = arrayBufferToBase64(await fontResponse.arrayBuffer());
    }

    doc.addFileToVFS('NotoSansHebrew.ttf', cachedHebrewFontBase64);
    doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
    doc.setFont('NotoSansHebrew', 'normal');
    doc.setR2L(true);

    doc.setFontSize(22);
    doc.text(formTitle, rightX, 68, { align: 'right' });
    doc.setFontSize(12);
    doc.text(`תאריך נוכחי: ${new Date().toLocaleDateString('he-IL')}`, rightX, 92, { align: 'right' });
    doc.text(`שם הנהג: ${headerContext?.employeeName || 'לא זמין'}`, rightX, 112, { align: 'right' });
    doc.text(`מספר רישוי: ${headerContext?.vehicleNumber || 'לא זמין'}`, rightX, 132, { align: 'right' });
    doc.setDrawColor(180, 190, 205);
    doc.line(40, 142, 555, 142);

    const sections = (content || '-').split('\n').map((line) => line.trim());
    doc.setFontSize(13);
    let y = 168;
    for (const section of sections) {
      const wrapped = doc.splitTextToSize(section || ' ', 515);
      for (const row of wrapped) {
        doc.text(row, rightX, y, { align: 'right' });
        y += 20;
      }
      y += 4;
      if (y > 780) {
        doc.addPage();
        y = 60;
      }
    }

    return doc.output('blob');
  };

  const uploadGeneratedDocumentPdf = async (formTitle: string, content: string) => {
    const blob = await generateStyledPdfBlob(formTitle, content, {
      employeeName: autoFillContext.employee_name,
      vehicleNumber: autoFillContext.vehicle_number,
    });
    const safeTitle = formTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'generated_form';
    const path = `templates/generated_${safeTitle}_${Date.now()}.pdf`;
    const { error } = await supabase.storage
      .from('vehicle-documents')
      .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (error) throw error;

    const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
    return data.publicUrl;
  };

  const upsertGeneratedTemplate = async (args: {
    existing?: OrgDocument | null;
    builtinTemplateKey?: string;
    formTitle: string;
    formDescription: string;
    formCategory: FormsCategory;
    content: string;
    includeDelivery?: boolean;
    includeReturn?: boolean;
    includeHandover?: boolean;
  }) => {
    const fileUrl = await uploadGeneratedDocumentPdf(args.formTitle, args.content);
    const baseJsonSchema = {
      template_mode: 'generated',
      builtin_template_key: args.builtinTemplateKey ?? null,
      template_content: args.content,
      template_header: {
        labels: ['תאריך נוכחי', 'שם הנהג', 'מספר רישוי'],
        sources: ['date', 'employee_name', 'vehicle_number'],
      },
      input_footer: STANDARD_INPUT_FOOTER_TEXT,
      validation: STANDARD_INPUT_VALIDATION_SCHEMA,
    };
    const persistedCategory = getPersistedCategory(args.formCategory);
    const jsonSchema = withCustomFolderInSchema(baseJsonSchema, args.formCategory);

    const delivery = args.includeDelivery ?? includeInDelivery;
    const ret = args.includeReturn ?? includeInReturn;
    const effectiveIncludeInHandover = (args.includeHandover ?? includeInHandover) || delivery || ret;

    if (args.existing) {
      await updateForm.mutateAsync({
        id: args.existing.id,
        title: args.formTitle,
        description: args.formDescription,
        category: persistedCategory,
        file_url: fileUrl,
        json_schema: jsonSchema,
        include_in_handover: effectiveIncludeInHandover,
        include_in_delivery: delivery,
        include_in_return: ret,
      } as any);
      return;
    }

    await createForm.mutateAsync({
      title: args.formTitle,
      description: args.formDescription,
      category: persistedCategory,
      file_url: fileUrl,
      json_schema: jsonSchema,
      autofill_fields: ['employee_name', 'id_number', 'vehicle_number', 'date'],
      include_in_handover: effectiveIncludeInHandover,
      include_in_delivery: delivery,
      include_in_return: ret,
      is_standalone: true,
      requires_signature: false,
      sort_order: 0,
      is_active: true,
    } as any);
  };

  const handleSyncBuiltinDocs = async () => {
    if (!canManageForms) {
      toast.error('אין הרשאה לסנכרון מסמכי מערכת');
      return;
    }

    setSyncingBuiltin(true);
    try {
      const accessoryLines = HANDOVER_ACCESSORY_CEILINGS
        .map((item, idx) => `${idx + 1}. ${item.name} - תקרה: ${formatCeilingPrice(item.maxPriceNis)}`)
        .join('\n');

      const policyText = String(orgSettings?.vehicle_policy_text ?? '').trim();
      const healthText = String(orgSettings?.health_statement_text ?? '').trim();

      const templates = [
        {
          key: 'system-reception-form',
          title: 'טופס קבלת רכב - מסמך מערכת',
          description: 'עותק מובנה שנוצר מתוך מסמך קבלת הרכב באפליקציה.',
          category: 'תפעול' as FormsCategory,
          content: `הצהרה על קבלת רכב חברה

1. התחייבות והצהרת הנהג:
הנני מתחייב להשתמש ברכב אך ורק לשם מילוי תפקידי ולנסיעות פרטיות, ולנהוג לפי חוקי התעבורה והנחיות החברה.
הנני מתחייב לדאוג לשטיפת הרכב לפחות פעם בחודש ולא לבצע שינויים ברכב ללא אישור.
ידוע לי כי הרכב יימצא בשליטתי הבלעדית ואין לאפשר לגורם מחוץ לחברה לנהוג בו (למעט מורשים שאושרו).
השתתפות עצמית: במקרה של תאונה באשמתי, אשא בעלות החל מנזק שני בשנה קלנדרית. במידה ונהג מורשה שאינו עובד חברה נהג, אשא בעלות החל מנזק ראשון. גובה ההשתתפות כנהוג באותה עת (800 ₪ נכון ליוני 2019).
דוחות וקנסות: ידוע לי כי כל דוחות התנועה והחניה יוסבו על שמי. החל מדוח חניה שני בשנה, אחויב בדמי טיפול בסך 50 ₪.
כבישי אגרה: הנני מתחייב לעשות מנוי על חשבוני בכבישי אגרה (כביש 6, מנהרות הכרמל וכו').
הנני מאשר כי קיבלתי הסבר על תפעול מערכות הרכב (ABS, כריות אוויר וכו') וקראתי את נוהל השימוש ברכב חברה.
הנני נותן הרשאה בלתי חוזרת לנכות ממשכורתי עלויות אביזרים חסרים או חובות בגין השימוש ברכב כמפורט לעיל.

2. טבלת אישור אביזרים (Checklist):
נא לסמן אישור על קבלת האביזרים הבאים (בסוגריים: תקרת עלות לחיוב במקרה של חוסר):
[ ] גלגל רזרבי (200 ₪)
[ ] מגבה - ג'ק (150 ₪)
[ ] מפתח גלגלים (30 ₪)
[ ] משולש אזהרה (30 ₪)
[ ] אפוד זוהר (10 ₪)
[ ] סט כלים (100 ₪)
[ ] 2 מפתחות (עד 1,500 ₪ ליחידה)

תקרות אביזרים מעודכנות במערכת:
${accessoryLines}

3. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

4. חתימה דיגיטלית:
[אזור חתימה]
תאריך: [מילוי אוטומטי]`,
          includeDelivery: true,
          includeReturn: false,
        },
        {
          key: 'system-upgrade-request',
          title: 'בקשה לשדרוג רכב חברה - מסמך מערכת',
          description: 'טופס מובנה לבקשת שדרוג דגם רכב חברה וחיוב חודשי.',
          category: 'תפעול' as FormsCategory,
          content: `בקשה לשדרוג רכב חברה

1. פרטי השדרוג והחיוב:
הצהרה: העובד מצהיר כי ברצונו לשדרג את דגם הרכב שהחברה מעמידה לרשותו לדגם אחר שעלות הליסינג שלו יקרה יותר.
דגם הרכב המבוקש: [שדה טקסט חופשי או בחירה מרשימה]
סכום חיוב חודשי (הפרש ליסינג): [שדה להזנת סכום ב-₪ נטו]
מועד תחילת החיוב: החל מתאריך קבלת הרכב.

2. התחייבות והצהרת העובד:
הסכמה לניכוי: הריני נותן בזאת את הסכמתי לחייב אותי בשכר החודשי בעלות ההפרש בין עלויות הליסינג של דגמי הרכבים כאמור לעיל.
אי-חזרה מהבקשה: ידוע לי כי לא אוכל לחזור בי מבקשת השדרוג ומההרשאה לניכוי במשך כל תקופת הליסינג של הרכב ו/או עד לסיום העסקתי בחברה, המוקדם מבניהם.
משך תקופת הליסינג: ידוע לי כי משך תקופת הליסינג יכול להשתנות מעת לעת על ידי החברה בהתאם לשיקול דעתה העסקי, ויכול שתהיה ארוכה או קצרה מהנהוג ביום חתימה זו.
הבהרה כספית: הובהר לי כי שדרוג הרכב כרוך בתוספת תשלום על חשבוני, המהווה את ההפרש בין עלויות הליסינג של הרכב המקורי לבין עלות הרכב המשודרג.

3. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

4. אישור וחתימה:
[אזור חתימה דיגיטלית של העובד]`,
          includeDelivery: false,
          includeReturn: false,
          includeHandover: false,
        },
        {
          key: 'system-traffic-liability-annex',
          title: "נספח א' - אחריות אישית בגין עבירות תנועה - מסמך מערכת",
          description: "מסמך התחייבות אישי לאחריות הנהג בגין עבירות תנועה ותעבורה.",
          category: 'בטיחות' as FormsCategory,
          content: `נספח א' - אחריות אישית בגין עבירות תנועה

1. סעיפי התחייבות:
קראתי והבנתי את נהלי "שימוש ברכב חברה" ואני מתחייב/ת לפעול לפיהם.
החל ממועד קבלת הרכב, אשא באופן אישי ובלעדי בכל תוצאה של עבירות תנועה ותעבורה ואני פוטר/ת את החברה מכל אחריות.
אני מתחייב/ת לדווח על כל דוח (משטרה או עירייה) תוך 48 שעות ולטפל בתשלומו או בהסבתו על שמי מיידית.
התחייבות זו חלה גם אם הרכב לא היה פיזית בידיי בעת העבירה, אלא אם הוכח אחרת לשביעות רצון החברה.
אני מייפה את כוחה של החברה לייחס לי ולהודיע לרשויות על אחריותי האישית לכל דוח.
במידה ולא אדווח על ביטול/תשלום דוח עד 7 ימי עסקים לפני המועד האחרון, החברה רשאית:
א. לנכות משכרי את גובה הקנס בצירוף הוצאות ושכר טרחת עו"ד.
ב. לדרוש ממני תשלום מיידי במידה ואינני מועסק עוד בחברה.
אני מתחייב/ת לעדכן את משאבי אנוש על כל שינוי בכתובתי.
התחייבות זו תעמוד בתוקפה גם לאחר סיום עבודתי עבור עבירות שבוצעו בתקופת החזקתי ברכב.

2. שדות מילוי ואישור:
${STANDARD_INPUT_FOOTER_TEXT}

3. חתימה דיגיטלית:
[אזור חתימה]`,
          includeDelivery: false,
          includeReturn: false,
          includeHandover: false,
        },
        {
          key: 'system-return-form',
          title: 'טופס החזרת רכב - מסמך מערכת',
          description: 'טופס מובנה להחזרת רכב עם בדיקת אביזרים והצהרת עובד.',
          category: 'תפעול' as FormsCategory,
          content: `טופס החזרת רכב

1. נתוני שימוש בעת ההחזרה:
מד אוץ (ק"מ): [שדה להזנה].
כמות דלק בהחזרה: [בחירה: רבע/חצי/שלושת-רבעי/מלא].

2. בדיקת אביזרים וציוד (Checklist):
עבור כל פריט, יש לסמן "קיים", "לא קיים" או "הערה":
[ ] גלגל רזרבי
[ ] סט כלים
[ ] אפודה זוהרת
[ ] 2 מפתחות
[ ] מגבה (ג'ק)
[ ] משולש אזהרה
[ ] מפתח גלגלים

3. הצהרת והתחייבות העובד:
הנני מורה בזאת באופן בלתי חוזר לנכות ממשכורתי או מכל תשלום המגיע לי עקב עבודתי, כל סכום אשר אהיה חייב בגין השימוש במכונית, לרבות עלות אביזרים חסרים כפי שפורטו לעיל.
אני מצהיר כי הפרטים לעיל אמת הם.
הערות כלליות על מצב הרכב: [שדה טקסט חופשי].

4. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

5. אישור וחתימה:
[אזור חתימה דיגיטלית של העובד]`,
          includeDelivery: false,
          includeReturn: true,
          includeHandover: true,
        },
        {
          key: 'system-replacement-usage',
          title: 'שימוש ברכב חילופי/רזרבי - מסמך מערכת',
          description: 'טופס מובנה לשימוש זמני ברכב חילופי או רזרבי.',
          category: 'תפעול' as FormsCategory,
          content: `שימוש ברכב חילופי/רזרבי

1. הצהרת הנהג לשימוש זמני:
הריני מאשר/ת כי בדקתי את הרכב לפני התחלת הנסיעה.
הנני מצהיר/ה בזאת כי ידוע לי שאני אחראי/ת לשלמות ותקינות הרכב.
חלות עלי כל החובות והאחריות מרגע קבלת הרכב ועד להחזרתו לגבי תאונות, עבירות תנועה וחניות שלא כחוק.
התחייבות לנהוג לפי חוקי ותקנות התעבורה ולפי נהלי החברה (מגדל).
אישור קבלת הסבר על תפעול מערכות הרכב והפעלתו.
התחייבות להחזיר את הרכב בתום תקופת השימוש במצב שבו נמסר.
איסור עישון: ידוע לי כי חל איסור מוחלט על עישון ברכב.

2. סגירת תקופת שימוש (למילוי בהחזרה):
תאריך ושעת החזרה: [מילוי אוטומטי/ידני].

3. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

4. אישור וחתימה:
[אזור חתימה בקבלת הרכב]`,
          includeDelivery: false,
          includeReturn: false,
          includeHandover: false,
        },
        {
          key: 'system-practical-driving-test',
          title: 'טופס מבחן מעשי בנהיגה - מסמך מערכת',
          description: 'טופס מובנה לתיעוד מבחן נהיגה מעשי עם Checklist בוחן.',
          category: 'בטיחות' as FormsCategory,
          content: `טופס מבחן מעשי בנהיגה

1. מרכיבי המבחן (Checklist של הבוחן):
עבור כל מרכיב, הבוחן יסמן "תקין" או "הערה":
א. שליטה ברכב: התחלת נסיעה, שליטה בהגה, נסיעה לאחור, איתות.
ב. הדרך: מיקום בנתיבי הכביש, התנהגות ומיקום בצמתים.
ג. תנועה: הסתכלות, מהירות, קצב נסיעה, שמירת רווח מלפנים ומהצדדים, עקומות/פניות, עצירת הרכב וחנייתו, זהירות, ציות לתקנות/רמזורים/תמרורים.

2. סיכום ואישור:
הערות הבוחן: [שדה טקסט חופשי].

3. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

4. חתימת קצין בטיחות בתעבורה:
[אזור חתימה].`,
          includeDelivery: false,
          includeReturn: false,
          includeHandover: false,
        },
        {
          key: 'system-health-employee',
          title: 'הצהרת בריאות לעובד - מסמך מערכת',
          description: 'טופס מובנה להצהרת בריאות הנהג העובד.',
          category: 'בטיחות' as FormsCategory,
          content: `הצהרת בריאות לעובד

1. הצהרה כללית:
הנני מצהיר בזה כי לא נתגלו אצלי, למיטב ידיעתי, מגבלות במערכת העצבים, העצמות, הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.

2. סעיפי התחייבות:
לא נפסלתי מלהחזיק ברישיון נהיגה ולא הותלה רישיוני על ידי גורם מוסמך.
אין לי כל מגבלה בריאותית או רפואית המונעת ממני להחזיק ברישיון נהיגה.
אינני צורך סמים.
אינני צורך אלכוהול מעבר לכמות המותרת על פי דין בעת נהיגה.
במידה ויוטלו הגבלות על רישיוני או יחול שינוי במצבי הבריאותי, אדווח על כך מיידית לקצין הבטיחות.
קיבלתי הדרכה לצורך תפעול וההפעלה של הרכב.

3. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

4. אישור:
[חתימה דיגיטלית]
תאריך: [מילוי אוטומטי].`,
          includeDelivery: false,
          includeReturn: false,
          includeHandover: false,
        },
        {
          key: 'system-health-family',
          title: 'הצהרת בריאות לבן/בת זוג או לילד/ה - מסמך מערכת',
          description: 'טופס מובנה להצהרת בריאות בן/בת זוג או ילד/ה לנהיגה ברכב חברה.',
          category: 'בטיחות' as FormsCategory,
          content: `הצהרת בריאות לבן/בת זוג או לילד/ה

1. סעיפי הצהרה:
הנני מצהיר בזה כי לא נתגלו אצלי, למיטב ידיעתי, מגבלות במערכת העצבים, העצמות, הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.
לא נפסלתי מלהחזיק ברישיון נהיגה ולא הותלה רישיוני על ידי גורם מוסמך.
אין לי כל מגבלה בריאותית או רפואית המונעת ממני להחזיק ברישיון נהיגה.
אינני צורך סמים.
אינני צורך אלכוהול מעבר לכמות המותרת על פי דין בעת נהיגה.
במידה ויוטלו הגבלות על רישיוני או יחול שינוי במצבי הבריאותי, אדווח על כך מיידית לקצין הבטיחות.
סעיף הדרכה (לבן/בת זוג): "קיבלתי הדרכה מבן/בת זוגי לצורך תפעול וההפעלה של הרכב".
סעיף הדרכה (לילד/ה): "קיבלתי הדרכה מאבי/אימי שהם מחזיק/ת לצורך תפעול וההפעלה של הרכב".

2. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

3. אישור:
[חתימה דיגיטלית של המצהיר]
תאריך: [מילוי אוטומטי].`,
          includeDelivery: false,
          includeReturn: false,
          includeHandover: false,
        },
        {
          key: 'system-vehicle-policy',
          title: 'נוהל שימוש ברכב - מסמך מערכת',
          description: 'עותק מובנה שנוצר מתוך מסמך נוהל שימוש ברכב באפליקציה.',
          category: 'בטיחות' as FormsCategory,
          content: policyText || 'לא הוגדר תוכן נוהל שימוש ברכב בהגדרות הארגון.',
          includeDelivery: true,
          includeReturn: true,
          includeHandover: true,
        },
        {
          key: 'system-health-statement',
          title: 'הצהרת בריאות - מסמך מערכת',
          description: 'עותק מובנה שנוצר מתוך הצהרת הבריאות באפליקציה.',
          category: 'בטיחות' as FormsCategory,
          content: `הצהרת בריאות

1. הצהרה כללית:
הנני מצהיר בזה כי לא נתגלו אצלי, למיטב ידיעתי, מגבלות במערכת העצבים, העצמות, הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.

2. סעיפי התחייבות:
לא נפסלתי מלהחזיק ברישיון נהיגה ולא הותלה רישיוני על ידי גורם מוסמך.
אין לי כל מגבלה בריאותית או רפואית המונעת ממני להחזיק ברישיון נהיגה.
אינני צורך סמים.
אינני צורך אלכוהול מעבר לכמות המותרת על פי דין בעת נהיגה.
במידה ויוטלו הגבלות על רישיוני או יחול שינוי במצבי הבריאותי, אדווח על כך מיידית לקצין הבטיחות.

3. שדות מילוי ידני:
${STANDARD_INPUT_FOOTER_TEXT}

4. אישור:
[חתימה דיגיטלית]
תאריך: [מילוי אוטומטי].`,
          includeDelivery: true,
          includeReturn: false,
          includeHandover: true,
        },
      ];

      let createdCount = 0;
      let skippedCount = 0;
      for (const tpl of templates) {
        const normalizedTitle = tpl.title.replace(/\s+/g, ' ').trim();
        const existing = (allForms ?? forms ?? []).find((f) => {
          const schema = (f.json_schema as any) ?? {};
          const byKey = String(schema?.builtin_template_key ?? '').trim() === tpl.key;
          const byNormalizedTitle = String(f.title ?? '').replace(/\s+/g, ' ').trim() === normalizedTitle;
          return byKey || byNormalizedTitle;
        }) ?? null;
        if (existing) {
          // Non-destructive sync: never overwrite existing form content edited by admins.
          skippedCount += 1;
          continue;
        }
        await upsertGeneratedTemplate({
          existing,
          builtinTemplateKey: tpl.key,
          formTitle: tpl.title,
          formDescription: tpl.description,
          formCategory: tpl.category,
          content: tpl.content,
          includeDelivery: tpl.includeDelivery,
          includeReturn: tpl.includeReturn,
          includeHandover: tpl.includeHandover ?? true,
        });
        createdCount += 1;
      }

      if (createdCount === 0) {
        toast.info(`לא נוספו מסמכים חדשים. ${skippedCount} מסמכים קיימים נשמרו ללא שינוי.`);
      } else {
        toast.success(`נוספו ${createdCount} מסמכי מערכת חדשים. ${skippedCount} קיימים נשמרו ללא שינוי.`);
      }
    } catch (error: any) {
      toast.error(`סנכרון נכשל: ${error?.message ?? 'שגיאה לא צפויה'}`);
    } finally {
      setSyncingBuiltin(false);
    }
  };

  const formsWithCategory = useMemo(
    () =>
      (forms ?? []).map((form) => ({
        ...form,
        dbCategory: (form.category as FormsCategory | undefined) ?? DEFAULT_FORM_FOLDERS[0],
        category:
          (form.json_schema as any)?.custom_folder ??
          (form.category as FormsCategory | undefined) ??
          DEFAULT_FORM_FOLDERS[0],
      })),
    [forms],
  );

  const folderOptions = useMemo(() => {
    const fromForms = formsWithCategory
      .map((form) => form.category)
      .filter((value): value is FormsCategory => Boolean(value && String(value).trim()));

    const merged = Array.from(new Set([...customFolders, ...fromForms]));
    return merged.length > 0 ? merged : [...DEFAULT_FORM_FOLDERS];
  }, [formsWithCategory, customFolders]);

  const filteredForms = useMemo(() => {
    if (activeCategory === 'הכל') return formsWithCategory;
    return formsWithCategory.filter((form) => form.category === activeCategory);
  }, [activeCategory, formsWithCategory]);
  const archivedForms = useMemo(
    () =>
      (allForms ?? [])
        .filter((form) => !form.is_active)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [allForms],
  );
  const filteredArchivedForms = useMemo(() => {
    const query = archiveSearch.trim().toLowerCase();
    if (!query) return archivedForms;
    return archivedForms.filter(
      (form) =>
        String(form.title ?? '').toLowerCase().includes(query) ||
        String(form.id ?? '').toLowerCase().includes(query),
    );
  }, [archivedForms, archiveSearch]);

  const markedKeepCount = useMemo(
    () => Object.values(formReviewMarks).filter((mark) => mark === 'keep').length,
    [formReviewMarks],
  );
  const markedDeleteCount = useMemo(
    () => Object.values(formReviewMarks).filter((mark) => mark === 'delete').length,
    [formReviewMarks],
  );

  const groupedForms = useMemo(() => {
    return folderOptions.map((cat) => ({
      category: cat,
      items: filteredForms.filter((form) => form.category === cat),
    })).filter((group) => group.items.length > 0);
  }, [filteredForms, folderOptions]);

  const openFormFile = async (url: string) => {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      const isSameOrigin = parsedUrl.origin === window.location.origin;

      // For same-origin files (e.g. /forms-files/*.pdf), verify file exists before opening.
      if (isSameOrigin) {
        const response = await fetch(parsedUrl.toString(), {
          method: 'HEAD',
          cache: 'no-store',
        });

        if (!response.ok) {
          toast.error('הטופס אינו זמין כרגע או לא קיים במערכת');
          return;
        }
      }

      window.open(parsedUrl.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('לא ניתן לפתוח את הטופס המבוקש');
    }
  };

  const handleSave = async () => {
    if (!canManageForms) {
      toast.error('אין הרשאה להוסיף טופס חדש');
      return;
    }

    if (!title.trim()) {
      toast.error('נא להזין שם טופס');
      return;
    }
    if (templateMode === 'generated') {
      if (!generatedContent.trim()) {
        toast.error('נא להזין תוכן למסמך המובנה');
        return;
      }
    }

    if (templateMode === 'file' && file) {
      const ext = file.name.toLowerCase().split('.').pop() ?? '';
      if (!ALLOWED_FORM_EXTENSIONS.includes(ext)) {
        toast.error('ניתן להעלות רק קבצי PDF או Word (.doc, .docx)');
        return;
      }
    }

    if (!editingForm && templateMode === 'file' && !file) {
      toast.error('נא לבחור קובץ PDF או Word');
      return;
    }

    try {
      if (templateMode === 'generated') {
        await upsertGeneratedTemplate({
          existing: editingForm,
          formTitle: title.trim(),
          formDescription: description.trim(),
          formCategory: category,
          content: generatedContent.trim(),
        });
        toast.success(editingForm ? 'הטופס המובנה עודכן בהצלחה' : 'הטופס המובנה נוסף בהצלחה');
        setOpen(false);
        resetForm();
        return;
      }

      if (editingForm) {
        const effectiveIncludeInHandover = includeInHandover || includeInDelivery || includeInReturn;
        const nextJsonSchema = withCustomFolderInSchema((editingForm.json_schema as any) ?? null, category);
        await updateForm.mutateAsync({
          id: editingForm.id,
          title: title.trim(),
          description: description.trim(),
          category: getPersistedCategory(category),
          json_schema: nextJsonSchema,
          include_in_handover: effectiveIncludeInHandover,
          include_in_delivery: includeInDelivery,
          include_in_return: includeInReturn,
          ...(file ? { file } : {}),
        } as any);
        toast.success('הטופס עודכן בהצלחה');
      } else {
        const effectiveIncludeInHandover = includeInHandover || includeInDelivery || includeInReturn;
        const nextJsonSchema = withCustomFolderInSchema(null, category);
        await createForm.mutateAsync({
          title: title.trim(),
          description: description.trim(),
          category: getPersistedCategory(category),
          file_url: null,
          json_schema: nextJsonSchema,
          autofill_fields: ['employee_name', 'id_number', 'vehicle_number', 'date'],
          include_in_handover: effectiveIncludeInHandover,
          include_in_delivery: includeInDelivery,
          include_in_return: includeInReturn,
          is_standalone: true,
          requires_signature: false,
          sort_order: 0,
          is_active: true,
          file,
        });
        toast.success('הטופס נוסף בהצלחה');
      }

      setOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(`שמירה נכשלה: ${error?.message ?? 'שגיאה לא צפויה'}`);
    }
  };

  const handleSaveContentEditor = async () => {
    if (!canManageForms || !contentEditingForm) {
      toast.error('אין הרשאה לעריכת מסמך');
      return;
    }

    if (!contentEditorTitle.trim()) {
      toast.error('שם הטופס הוא שדה חובה');
      return;
    }

    if (!contentEditorValue.trim()) {
      toast.error('נא להזין תוכן למסמך');
      return;
    }

    try {
      await upsertGeneratedTemplate({
        existing: contentEditingForm,
        formTitle: contentEditorTitle.trim(),
        formDescription: contentEditorDescription.trim(),
        formCategory: contentEditingForm.category,
        content: contentEditorValue.trim(),
        includeDelivery: Boolean(contentEditingForm.include_in_delivery),
        includeReturn: Boolean(contentEditingForm.include_in_return),
        includeHandover: Boolean(contentEditingForm.include_in_handover),
      });

      toast.success(contentEditorConverting ? 'המסמך הומר למסמך עריך ונשמר' : 'תוכן המסמך עודכן בהצלחה');
      setContentEditorOpen(false);
      setContentEditingForm(null);
      setContentEditorTitle('');
      setContentEditorDescription('');
      setContentEditorValue('');
      setContentEditorConverting(false);
    } catch (error: any) {
      toast.error(`שמירת תוכן נכשלה: ${error?.message ?? 'שגיאה לא צפויה'}`);
    }
  };

  const openDeleteDialog = (form: OrgDocument & { category: FormsCategory }) => {
    setFormToDelete(form);
    setDeletePassword('');
    setDeleteDialogOpen(true);
  };

  const openMoveDialog = (form: OrgDocument & { category: FormsCategory }) => {
    setFormToMove(form);
    setMoveTargetFolder(form.category);
    setMoveTargetFolderCustom('');
    setMoveDialogOpen(true);
  };

  const handleCreateFolder = () => {
    const nextFolder = newFolderValue.trim();
    if (!nextFolder) {
      toast.error('יש להזין שם תיקייה חדשה');
      return;
    }

    if (folderOptions.includes(nextFolder)) {
      toast.error('תיקייה בשם זה כבר קיימת');
      return;
    }

    setCustomFolders((prev) => [...prev, nextFolder]);
    setActiveCategory(nextFolder);
    setCategory(nextFolder);
    setMoveTargetFolder(nextFolder);
    setFolderToRename(nextFolder);
    setRenamedFolderValue(nextFolder);
    setNewFolderValue('');
    toast.success(`התיקייה "${nextFolder}" נוצרה בהצלחה`);
  };

  const handleRenameFolder = async () => {
    const nextName = renamedFolderValue.trim();
    if (!folderToRename) {
      toast.error('יש לבחור תיקייה לעריכה');
      return;
    }
    if (!nextName) {
      toast.error('יש להזין שם תיקייה חדש');
      return;
    }
    if (nextName === folderToRename) {
      toast.error('שם התיקייה החדש זהה לשם הקיים');
      return;
    }
    if (isDefaultFolder(folderToRename)) {
      toast.error('לא ניתן לשנות שם לתיקיית מערכת מובנית. ניתן ליצור תיקייה חדשה ולהעביר אליה טפסים.');
      return;
    }

    setRenamingFolder(true);
    try {
      const docsInFolder = formsWithCategory.filter((doc) => doc.category === folderToRename);

      for (const doc of docsInFolder) {
        const nextSchema = withCustomFolderInSchema((doc.json_schema as any) ?? null, nextName);
        const { error } = await (supabase as any)
          .from('org_documents')
          .update({
            category: getPersistedCategory(nextName),
            json_schema: nextSchema,
            updated_at: new Date().toISOString(),
          })
          .eq('id', doc.id)
          .eq('is_active', true);

        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      setCustomFolders((prev) => {
        const updated = prev
          .filter((item) => item !== folderToRename)
          .map((item) => (item === folderToRename ? nextName : item));
        if (!isDefaultFolder(nextName)) {
          updated.push(nextName);
        }
        return Array.from(new Set(updated));
      });
      setActiveCategory((current) => (current === folderToRename ? nextName : current));
      if (category === folderToRename) {
        setCategory(nextName);
      }
      toast.success(`שם התיקייה עודכן ל-${nextName}`);
      setFolderManagerOpen(false);
      setRenamedFolderValue('');
    } catch (error: any) {
      toast.error(`עדכון תיקייה נכשל: ${error?.message ?? 'שגיאה לא צפויה'}`);
    } finally {
      setRenamingFolder(false);
    }
  };

  const handleMoveEntireFolder = async () => {
    const sourceFolder = folderToMoveAll.trim();
    const targetFolder = folderMoveTarget.trim();

    if (!sourceFolder) {
      toast.error('יש לבחור תיקיית מקור');
      return;
    }

    if (!targetFolder) {
      toast.error('יש להזין/לבחור תיקיית יעד');
      return;
    }

    if (sourceFolder === targetFolder) {
      toast.error('תיקיית המקור והיעד זהות');
      return;
    }

    const docsInSource = formsWithCategory.filter((doc) => doc.category === sourceFolder);
    if (docsInSource.length === 0) {
      toast.error('אין מסמכים להעברה בתיקיית המקור');
      return;
    }

    setMovingFolder(true);
    try {
      for (const doc of docsInSource) {
        const { error } = await (supabase as any)
          .from('org_documents')
          .update({
            category: getPersistedCategory(targetFolder),
            json_schema: withCustomFolderInSchema((doc.json_schema as any) ?? null, targetFolder),
            updated_at: new Date().toISOString(),
          })
          .eq('id', doc.id)
          .eq('is_active', true);

        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });

      setCustomFolders((prev) => {
        const next = prev.filter((item) => item !== sourceFolder);
        if (!isDefaultFolder(targetFolder)) {
          next.push(targetFolder);
        }
        return Array.from(new Set(next));
      });

      if (activeCategory === sourceFolder) {
        setActiveCategory(targetFolder);
      }

      setFolderToRename(targetFolder);
      setRenamedFolderValue(targetFolder);
      setFolderToMoveAll(targetFolder);
      setFolderMoveTarget('');
      toast.success(`כל המסמכים הועברו מ-${sourceFolder} ל-${targetFolder}`);
    } catch (error: any) {
      toast.error(`העברת תיקייה נכשלה: ${error?.message ?? 'שגיאה לא צפויה'}`);
    } finally {
      setMovingFolder(false);
    }
  };

  const moveFormToFolder = async (params: {
    formId: string;
    fromFolder: FormsCategory;
    nextFolder: FormsCategory;
    formTitle?: string;
    jsonSchema?: Record<string, any> | null;
    closeDialog?: boolean;
  }) => {
    const { formId, fromFolder, nextFolder, formTitle, jsonSchema, closeDialog } = params;
    const targetFolder = nextFolder.trim();

    if (!targetFolder) {
      toast.error('יש לבחור תיקיית יעד');
      return false;
    }

    if (targetFolder === fromFolder) {
      toast.error('הטופס כבר נמצא בתיקייה שנבחרה');
      return false;
    }

    try {
      const { error } = await (supabase as any)
        .from('org_documents')
        .update({
          category: getPersistedCategory(targetFolder),
          json_schema: withCustomFolderInSchema((jsonSchema as any) ?? null, targetFolder),
          updated_at: new Date().toISOString(),
        })
        .eq('id', formId)
        .eq('is_active', true);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      if (activeCategory !== 'הכל' && activeCategory === fromFolder) {
        setActiveCategory('הכל');
      }

      toast.success(formTitle ? `הטופס "${formTitle}" הועבר ל-${targetFolder}` : 'הטופס הועבר לתיקייה בהצלחה');

      if (closeDialog) {
        setMoveDialogOpen(false);
        setFormToMove(null);
      }

      return true;
    } catch (error: any) {
      toast.error(`העברת טופס נכשלה: ${error?.message ?? 'שגיאה לא צפויה'}`);
      return false;
    }
  };

  const handleMoveFormToFolder = async () => {
    if (!formToMove) {
      toast.error('לא נבחר טופס להעברה');
      return;
    }

    const effectiveTargetFolder = moveTargetFolderCustom.trim() || moveTargetFolder;
    setMovingForm(true);
    try {
      await moveFormToFolder({
        formId: formToMove.id,
        fromFolder: formToMove.category,
        nextFolder: effectiveTargetFolder,
        formTitle: formToMove.title,
        jsonSchema: (formToMove.json_schema as any) ?? null,
        closeDialog: true,
      });
    } finally {
      setMovingForm(false);
    }
  };

  const handleDropOnFolder = async (targetFolder: FormsCategory) => {
    if (!draggedForm) return;

    await moveFormToFolder({
      formId: draggedForm.id,
      fromFolder: draggedForm.category,
      nextFolder: targetFolder,
      formTitle: draggedForm.title,
      jsonSchema: draggedForm.jsonSchema,
    });

    setDragOverFolder(null);
    setDraggedForm(null);
  };

  const handleDropFromEvent = async (event: DragEvent, targetFolder: FormsCategory) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-org-document');

    let payload: {
      id: string;
      title: string;
      category: FormsCategory;
      jsonSchema?: Record<string, any> | null;
    } | null = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }

    if (!payload && draggedForm) {
      payload = draggedForm;
    }

    if (!payload) {
      setDragOverFolder(null);
      setDraggedForm(null);
      return;
    }

    setDraggedForm(payload);
    await handleDropOnFolder(targetFolder);
  };

  const handleDragStartForm = (event: DragEvent, form: OrgDocument & { category: FormsCategory }) => {
    const payload = {
      id: form.id,
      title: form.title,
      category: form.category,
      jsonSchema: (form.json_schema as any) ?? null,
    };
    setDraggedForm(payload);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', form.id);
    event.dataTransfer.setData('application/x-org-document', JSON.stringify(payload));
  };

  const handleDeleteForm = async () => {
    if (!formToDelete) {
      toast.error('לא נבחר טופס למחיקה');
      return;
    }

    if (deletePassword !== DELETE_FORMS_PASSWORD) {
      toast.error('סיסמת מנהל שגויה');
      return;
    }

    setIsDeleting(true);
    try {
      const { error: deleteError } = await (supabase as any)
        .from('org_documents')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', formToDelete.id);

      if (deleteError) {
        throw deleteError;
      }

      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      toast.success('הטופס הוסר מהתצוגה (נשמר בארכיון)');
      setDeleteDialogOpen(false);
      setFormToDelete(null);
      setDeletePassword('');
    } catch (error: any) {
      toast.error(`מחיקת טופס נכשלה: ${error?.message ?? 'שגיאה לא צפויה'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreArchivedForm = async (formId: string) => {
    setRestoringFormId(formId);
    try {
      const { error } = await (supabase as any)
        .from('org_documents')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', formId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      await queryClient.invalidateQueries({ queryKey: ['org-documents', 'admin'] });
      toast.success('הטופס שוחזר בהצלחה מהארכיון');
    } catch (error: any) {
      toast.error(`שחזור טופס נכשל: ${error?.message ?? 'שגיאה לא צפויה'}`);
    } finally {
      setRestoringFormId(null);
    }
  };

  const handleUnlockFormsManagement = () => {
    if (managementPassword.trim() !== DELETE_FORMS_PASSWORD) {
      toast.error('סיסמה שגויה לניהול טפסים');
      return;
    }
    setFormsManagementUnlocked(true);
    setManagementAuthOpen(false);
    setManagementPassword('');
    toast.success('ניהול טפסים הופעל בהצלחה');
  };

  return (
    <div className="container py-4 sm:py-6 space-y-6 forms-clean">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">טפסים</h1>
          <p className="text-muted-foreground mt-1">מרכז הטפסים הארגוני לצפייה והורדה</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setFolderManagerOpen(true)}
            title="עריכת תיקיות"
            aria-label="עריכת תיקיות"
          >
            <FolderCog className="h-4 w-4" />
            עריכת תיקיות
          </Button>
          {canManageForms && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                if (canShowManagementControls) {
                  setSettingsOpen(true);
                  return;
                }
                setManagementAuthOpen(true);
              }}
              title={canShowManagementControls ? 'הגדרות ניהול' : 'ניהול טפסים'}
              aria-label={canShowManagementControls ? 'הגדרות ניהול' : 'ניהול טפסים'}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['הכל', ...folderOptions] as CategoryFilter[]).map((cat) => (
          (() => {
            const isDropFolder = cat !== 'הכל' && canShowManagementControls;
            const isDragOver = isDropFolder && dragOverFolder === cat;

            return (
          <Button
            key={cat}
            type="button"
            variant={activeCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat)}
            className={cn(
              isDropFolder && 'transition-all',
              isDragOver && 'border-cyan-300 bg-cyan-500/20 text-cyan-100 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]'
            )}
            onDragOver={(event) => {
              if (!isDropFolder) return;
              event.preventDefault();
              setDragOverFolder(cat as FormsCategory);
            }}
            onDragLeave={() => {
              if (dragOverFolder === cat) {
                setDragOverFolder(null);
              }
            }}
            onDrop={(event) => {
              if (!isDropFolder) return;
              void handleDropFromEvent(event, cat as FormsCategory);
            }}
          >
            {cat}
          </Button>
            );
          })()
        ))}
      </div>

      {canShowManagementControls && (
        <p className="text-xs text-muted-foreground">טיפ: ניתן לגרור כרטיס טופס ולשחרר על תיקייה למעלה כדי להעביר אותו.</p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <FormCardSkeleton key={idx} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedForms.map((group) => (
            <section
              key={group.category}
              className={cn('space-y-3 rounded-xl p-1 transition-colors', dragOverFolder === group.category && 'bg-cyan-500/10 ring-1 ring-cyan-300/40')}
              onDragOver={(event) => {
                if (!canShowManagementControls) return;
                event.preventDefault();
                setDragOverFolder(group.category);
              }}
              onDragLeave={() => {
                if (dragOverFolder === group.category) {
                  setDragOverFolder(null);
                }
              }}
              onDrop={(event) => {
                if (!canShowManagementControls) return;
                void handleDropFromEvent(event, group.category);
              }}
            >
              <div className={cn('flex items-center gap-2 rounded-md px-2 py-1', dragOverFolder === group.category && 'bg-cyan-500/15')}>
                <h2 className="text-lg font-semibold">{group.category}</h2>
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {group.items.length}
                </span>
                {canShowManagementControls && (
                  <span className="mr-auto text-xs text-muted-foreground">גררי לכאן לשיוך לתיקייה</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.items.map((form) => {
                  const autoFill = resolveSchemaAutoFill(form.json_schema, autoFillContext);
                  const autoFillKeys = Object.keys(autoFill);
                  const hasPdf = Boolean(form.file_url);

                  return (
                    <Card
                      key={form.id}
                      className={cn('relative h-full', canShowManagementControls && 'cursor-grab active:cursor-grabbing', draggedForm?.id === form.id && 'opacity-70')}
                      draggable={canShowManagementControls}
                      onDragStart={(event) => {
                        if (!canShowManagementControls) return;
                        handleDragStartForm(event, form as OrgDocument & { category: FormsCategory });
                      }}
                      onDragEnd={() => {
                        setDraggedForm(null);
                        setDragOverFolder(null);
                      }}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="truncate forms-file-name">{form.title}</span>
                          {canShowManagementControls && (
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => handleDragStartForm(event, form as OrgDocument & { category: FormsCategory })}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="גרירת טופס לתיקייה"
                              title="גרירה לתיקייה"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                          )}
                          {canShowManagementControls && (
                            <button
                              type="button"
                              className="mr-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="עריכת כותרת ותיאור"
                              onClick={() => openContentEditor(form as OrgDocument & { category: FormsCategory })}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="העברה בין תיקיות"
                            title="העברה בין תיקיות"
                            onClick={() => openMoveDialog(form as OrgDocument & { category: FormsCategory })}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {canShowManagementControls && (
                            <button
                              type="button"
                              className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-white shadow-sm transition-colors hover:bg-cyan-700"
                              aria-label="הוספה"
                              title="הוספה"
                              onClick={() => setQuickUploadOpen(true)}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                          {form.description || 'ללא תיאור'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          עודכן: {new Date(form.updated_at).toLocaleDateString('he-IL')}
                        </p>
                        {autoFillKeys.length > 0 && (
                          <p className="text-xs text-cyan-400">
                            מילוי אוטומטי: {autoFillKeys.join(', ')}
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="flex-col gap-2 pb-14">
                        <Button
                          type="button"
                          className="w-full gap-2"
                          data-no-theme
                          data-file-action="download"
                          data-clean-file-row
                          
                          variant="outline"
                          disabled={!hasPdf}
                          onClick={() => {
                            if (!hasPdf) return;
                            void openFormFile(form.file_url as string);
                          }}
                        >
                          <Download className="h-4 w-4" />
                          {hasPdf ? 'צפייה/הורדה' : 'קובץ לא זמין'}
                        </Button>
                        {canShowManagementControls && (
                          <Button
                            type="button"
                            className="w-full gap-2"
                            variant="secondary"
                            onClick={() => openContentEditor(form as OrgDocument & { category: FormsCategory })}
                          >
                            <Pencil className="h-4 w-4" />
                            עריכת תוכן מסמך
                          </Button>
                        )}
                        {canShowManagementControls && (
                          <Button
                            type="button"
                            className="w-full gap-2"
                            variant="ghost"
                            onClick={() => openEditDialog(form as OrgDocument & { category: FormsCategory })}
                          >
                            <Pencil className="h-4 w-4" />
                            עריכה/החלפת PDF
                          </Button>
                        )}
                        {canDeleteForms && (
                          <Button
                            type="button"
                            className="w-full gap-2 text-red-500 hover:text-red-600"
                            variant="ghost"
                            onClick={() => openDeleteDialog(form as OrgDocument & { category: FormsCategory })}
                          >
                            <Trash2 className="h-4 w-4" />
                            מחיקת טופס
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}

          {filteredForms.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">אין טפסים להצגה בקטגוריה זו</p>
                <p className="text-sm text-muted-foreground mt-1">ניתן לבחור קטגוריה אחרת או להוסיף טופס חדש</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={quickUploadOpen}
        onOpenChange={setQuickUploadOpen}
      >
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>העלאת טופס</DialogTitle>
            <DialogDescription>
              העלאה מהירה של קובץ טופס חדש למרכז הטפסים.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <Button
              type="button"
              className="w-full gap-2"
              onClick={() => {
                setQuickUploadOpen(false);
                openCreateDialog();
              }}
            >
              <Upload className="h-4 w-4" />
              העלאת קובץ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingForm ? 'עדכון טופס' : 'הוסף טופס חדש'}</DialogTitle>
            <DialogDescription>
              {editingForm
                ? 'עדכון פרטי טופס קיים והחלפת קובץ PDF במידת הצורך.'
                : 'העלאת טופס PDF חדש למרכז הטפסים.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-title">שם הטופס</Label>
              <Input
                id="form-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="לדוגמה: טופס התחייבות נהג"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="form-description">תיאור קצר</Label>
              <Textarea
                id="form-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="הסבר קצר על מטרת הטופס"
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>סוג טופס</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={templateMode === 'file' ? 'default' : 'outline'}
                  onClick={() => setTemplateMode('file')}
                  className="flex-1"
                >
                  קובץ מוכן (PDF/Word)
                </Button>
                <Button
                  type="button"
                  variant={templateMode === 'generated' ? 'default' : 'outline'}
                  onClick={() => setTemplateMode('generated')}
                  className="flex-1"
                >
                  מסמך מובנה
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="form-category">קטגוריה</Label>
              <select
                id="form-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as FormsCategory)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {folderOptions.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="או הזן שם תיקייה חדשה"
              />
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">הצגה בפעולות אשף</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeInDelivery} onCheckedChange={(v) => setIncludeInDelivery(Boolean(v))} />
                מסירה
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeInReturn} onCheckedChange={(v) => setIncludeInReturn(Boolean(v))} />
                החזרה
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={includeInHandover} onCheckedChange={(v) => setIncludeInHandover(Boolean(v))} />
                כולל באשף (כללי)
              </label>
            </div>

            {templateMode === 'file' ? (
              <div className="space-y-2">
                <Label>קובץ PDF / Word</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {file?.name ?? (editingForm ? 'בחר קובץ חדש (PDF/Word) אופציונלי' : 'בחר קובץ PDF/Word')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="generated-content">תוכן מסמך מובנה</Label>
                <Textarea
                  id="generated-content"
                  rows={10}
                  value={generatedContent}
                  onChange={(e) => setGeneratedContent(e.target.value)}
                  placeholder="הדבק/י כאן את תוכן המסמך. האפליקציה תיצור ממנו PDF בפורמט אחיד."
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={createForm.isPending || updateForm.isPending}
              className="gap-2"
            >
              {(createForm.isPending || updateForm.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingForm ? 'עדכון' : 'שמירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={contentEditorOpen}
        onOpenChange={(next) => {
          setContentEditorOpen(next);
          if (!next) {
            setContentEditingForm(null);
            setContentEditorTitle('');
            setContentEditorDescription('');
            setContentEditorValue('');
            setContentEditorConverting(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת תוכן מסמך</DialogTitle>
            <DialogDescription>
              {contentEditorConverting
                ? 'המסמך הנוכחי אינו מסמך מובנה. בשמירה, יווצר PDF חדש לפי התוכן שתזין/י כאן.'
                : 'עריכת תוכן הטופס ושמירת גרסה מעודכנת.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="content-editor-title">שם הטופס</Label>
            <Input
              id="content-editor-title"
              value={contentEditorTitle}
              onChange={(e) => setContentEditorTitle(e.target.value)}
              placeholder="הזן/י שם טופס"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-editor-description">תיאור קצר</Label>
            <Textarea
              id="content-editor-description"
              rows={3}
              value={contentEditorDescription}
              onChange={(e) => setContentEditorDescription(e.target.value)}
              placeholder="הזן/י תיאור טופס"
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-editor">תוכן המסמך</Label>
            <Textarea
              id="content-editor"
              rows={14}
              value={contentEditorValue}
              onChange={(e) => setContentEditorValue(e.target.value)}
              placeholder="הקלד/י או הדבק/י כאן את התוכן המעודכן של המסמך"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setContentEditorOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              onClick={handleSaveContentEditor}
              disabled={createForm.isPending || updateForm.isPending}
              className="gap-2"
            >
              {(createForm.isPending || updateForm.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              שמור תוכן
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderManagerOpen}
        onOpenChange={(next) => {
          setFolderManagerOpen(next);
          if (!next) {
            setRenamedFolderValue('');
            setFolderMoveTarget('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת תיקיית מסמכים</DialogTitle>
            <DialogDescription>
              שינוי שם תיקייה יעדכן את כל הטפסים שבתוכה לשם החדש.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label htmlFor="new-folder-name">יצירת תיקייה חדשה</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="new-folder-name"
                  value={newFolderValue}
                  onChange={(e) => setNewFolderValue(e.target.value)}
                  placeholder="לדוגמה: נהגים חדשים"
                />
                <Button type="button" variant="secondary" onClick={handleCreateFolder}>
                  צור
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-to-rename">תיקייה לעריכה</Label>
              <select
                id="folder-to-rename"
                value={folderToRename}
                onChange={(e) => {
                  setFolderToRename(e.target.value);
                  setRenamedFolderValue(e.target.value);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {folderOptions.map((folder) => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="renamed-folder">שם חדש</Label>
              <Input
                id="renamed-folder"
                value={renamedFolderValue}
                onChange={(e) => setRenamedFolderValue(e.target.value)}
                placeholder="שם תיקייה חדש"
              />
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <Label className="text-sm font-medium">העברת תיקייה</Label>
              <p className="text-xs text-muted-foreground">מעביר את כל המסמכים מתיקיית מקור לתיקיית יעד.</p>

              <div className="space-y-2">
                <Label htmlFor="folder-to-move-all">תיקיית מקור</Label>
                <select
                  id="folder-to-move-all"
                  value={folderToMoveAll}
                  onChange={(e) => setFolderToMoveAll(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {folderOptions.map((folder) => (
                    <option key={`move-all-${folder}`} value={folder}>{folder}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="folder-move-target">תיקיית יעד</Label>
                <select
                  id="folder-move-target"
                  value={folderMoveTarget}
                  onChange={(e) => setFolderMoveTarget(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">בחר יעד</option>
                  {folderOptions
                    .filter((folder) => folder !== folderToMoveAll)
                    .map((folder) => (
                      <option key={`move-target-${folder}`} value={folder}>{folder}</option>
                    ))}
                </select>
                <Input
                  value={folderMoveTarget}
                  onChange={(e) => setFolderMoveTarget(e.target.value)}
                  placeholder="או הזן שם תיקיית יעד חדשה"
                />
              </div>

              <Button type="button" variant="secondary" className="w-full" onClick={handleMoveEntireFolder} disabled={movingFolder}>
                {movingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                העבר את כל התיקייה
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setFolderManagerOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={handleRenameFolder} disabled={renamingFolder} className="gap-2">
              {renamingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              שמור שינוי תיקייה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveDialogOpen}
        onOpenChange={(next) => {
          setMoveDialogOpen(next);
          if (!next) {
            setFormToMove(null);
            setMoveTargetFolderCustom('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>העברת טופס בין תיקיות</DialogTitle>
            <DialogDescription>
              בחרי תיקיית יעד עבור הטופס: {formToMove?.title ?? ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="move-target-folder">תיקיית יעד</Label>
            <select
              id="move-target-folder"
              value={moveTargetFolder}
              onChange={(e) => setMoveTargetFolder(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {folderOptions.map((folder) => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
            </select>
            <Input
              value={moveTargetFolderCustom}
              onChange={(e) => setMoveTargetFolderCustom(e.target.value)}
              placeholder="שם תיקייה חדשה (אופציונלי) - אם ימולא, הטופס יועבר לתיקייה חדשה זו"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setMoveDialogOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={handleMoveFormToFolder} disabled={movingForm} className="gap-2">
              {movingForm ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              העבר טופס
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(next) => {
          setDeleteDialogOpen(next);
          if (!next) {
            setFormToDelete(null);
            setDeletePassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיקת טופס מהמערכת</DialogTitle>
            <DialogDescription>
              פעולה זו תעביר את הטופס לארכיון (הטופס לא יוצג למשתמשים, וניתן לשחזר מארכיון).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              האם למחוק את הטופס: <span className="font-semibold text-foreground">{formToDelete?.title ?? ''}</span>?
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-form-password">סיסמת מנהל</Label>
              <Input
                id="delete-form-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="הזן סיסמה לאישור מחיקה"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              onClick={handleDeleteForm}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              אישור מחיקה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={managementAuthOpen}
        onOpenChange={(next) => {
          setManagementAuthOpen(next);
          if (!next) setManagementPassword('');
        }}
      >
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>ניהול טפסים</DialogTitle>
            <DialogDescription>
              להזנת סיסמה להצגת פעולות ניהול מתקדמות.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="management-password">סיסמה</Label>
            <Input
              id="management-password"
              type="password"
              value={managementPassword}
              onChange={(e) => setManagementPassword(e.target.value)}
              placeholder="הזן סיסמה"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setManagementAuthOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={handleUnlockFormsManagement}>
              כניסה לניהול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={settingsOpen}
        onOpenChange={(next) => setSettingsOpen(next)}
      >
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>הגדרות טפסים (מנהל בלבד)</DialogTitle>
            <DialogDescription>
              כל פעולות הניהול מרוכזות כאן בלבד.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-500/5 px-3 py-2 text-xs">
              <span className="font-semibold text-cyan-200">סימון סקירה:</span>
              <span className="text-emerald-300">שמור: {markedKeepCount}</span>
              <span className="text-red-300">מחק: {markedDeleteCount}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 mr-auto"
                onClick={async () => {
                  const lines = Object.entries(formReviewMarks)
                    .map(([id, mark]) => `${mark === 'keep' ? 'שמור' : 'מחק'} | ${id}`)
                    .join('\n');
                  await navigator.clipboard.writeText(lines || 'אין סימונים');
                  toast.success('רשימת הסימונים הועתקה ללוח');
                }}
              >
                העתק רשימת סימונים
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setFormReviewMarks({})}
              >
                נקה סימונים
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleSyncBuiltinDocs}
              disabled={syncingBuiltin}
            >
              {syncingBuiltin ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
              סנכרון מסמכי מערכת
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                setSettingsOpen(false);
                setArchiveOpen(true);
              }}
            >
              <ArchiveRestore className="h-4 w-4" />
              ארכיון ושחזור
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                setSettingsOpen(false);
                const firstFolder = folderOptions[0] ?? DEFAULT_FORM_FOLDERS[0];
                setFolderToRename(firstFolder);
                setRenamedFolderValue(firstFolder);
                setFolderToMoveAll(firstFolder);
                setFolderMoveTarget('');
                setFolderManagerOpen(true);
              }}
            >
              <FolderCog className="h-4 w-4" />
              עריכת תיקיות
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveOpen}
        onOpenChange={(next) => {
          setArchiveOpen(next);
          if (!next) {
            setRestoringFormId(null);
            setArchiveSearch('');
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>ארכיון טפסים</DialogTitle>
            <DialogDescription>
              כאן ניתן לשחזר טפסים שהועברו לארכיון.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder="חיפוש בארכיון לפי שם טופס או מזהה"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {filteredArchivedForms.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין טפסים בארכיון.</p>
            ) : (
              filteredArchivedForms.map((form) => (
                <div key={form.id} className="flex items-center gap-2 rounded-md border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{form.title}</p>
                    <p className="text-xs text-muted-foreground">
                      מזהה: {form.id} | עודכן: {new Date(form.updated_at).toLocaleString('he-IL')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleRestoreArchivedForm(form.id)}
                    disabled={restoringFormId === form.id}
                  >
                    {restoringFormId === form.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                    שחזור
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setArchiveOpen(false)}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
