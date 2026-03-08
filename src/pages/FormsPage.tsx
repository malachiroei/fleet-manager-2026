import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { OrgDocument, useOrgDocuments, useCreateOrgDocument, useUpdateOrgDocument } from '@/hooks/useOrgDocuments';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { useDrivers } from '@/hooks/useDrivers';
import { useVehicles } from '@/hooks/useVehicles';
import { supabase } from '@/integrations/supabase/client';
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

const FORM_CATEGORIES: FormsCategory[] = ['תפעול', 'בטיחות', 'מסמכים אישיים'];
type CategoryFilter = FormsCategory | 'הכל';
const FORMS_MANAGER_EMAIL_ALLOWLIST = ['malachiroei@gmail.com'];
const ALLOWED_FORM_EXTENSIONS = ['pdf', 'doc', 'docx'];
type TemplateMode = 'file' | 'generated';
const DELETE_FORMS_PASSWORD = '2101';

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
  const canDeleteForms = true;

  const canManageForms = useMemo(() => {
    if (isManager) return true;

    if (user?.email && FORMS_MANAGER_EMAIL_ALLOWLIST.includes(user.email.toLowerCase())) {
      return true;
    }

    const metadataRole = String(
      (user?.app_metadata as any)?.role ?? (user?.user_metadata as any)?.role ?? '',
    ).toLowerCase();

    if (metadataRole === 'admin' || metadataRole === 'fleet_manager') {
      return true;
    }

    const adminEmails = String(orgSettings?.admin_email ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    return !!user?.email && adminEmails.includes(user.email.toLowerCase());
  }, [isManager, orgSettings?.admin_email, user?.app_metadata, user?.email, user?.user_metadata]);

  const [open, setOpen] = useState(false);
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
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('תפעול');
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
    formTitle: string;
    formDescription: string;
    formCategory: FormsCategory;
    content: string;
    includeDelivery?: boolean;
    includeReturn?: boolean;
    includeHandover?: boolean;
  }) => {
    const fileUrl = await uploadGeneratedDocumentPdf(args.formTitle, args.content);
    const jsonSchema = {
      template_mode: 'generated',
      template_content: args.content,
      template_header: {
        labels: ['תאריך נוכחי', 'שם הנהג', 'מספר רישוי'],
        sources: ['date', 'employee_name', 'vehicle_number'],
      },
      input_footer: STANDARD_INPUT_FOOTER_TEXT,
      validation: STANDARD_INPUT_VALIDATION_SCHEMA,
    };

    const delivery = args.includeDelivery ?? includeInDelivery;
    const ret = args.includeReturn ?? includeInReturn;
    const effectiveIncludeInHandover = (args.includeHandover ?? includeInHandover) || delivery || ret;

    if (args.existing) {
      await updateForm.mutateAsync({
        id: args.existing.id,
        title: args.formTitle,
        description: args.formDescription,
        category: args.formCategory,
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
      category: args.formCategory,
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
          title: 'נוהל שימוש ברכב - מסמך מערכת',
          description: 'עותק מובנה שנוצר מתוך מסמך נוהל שימוש ברכב באפליקציה.',
          category: 'בטיחות' as FormsCategory,
          content: policyText || 'לא הוגדר תוכן נוהל שימוש ברכב בהגדרות הארגון.',
          includeDelivery: true,
          includeReturn: true,
          includeHandover: true,
        },
        {
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

      for (const tpl of templates) {
        const existing = (forms ?? []).find((f) => f.title === tpl.title) ?? null;
        await upsertGeneratedTemplate({
          existing,
          formTitle: tpl.title,
          formDescription: tpl.description,
          formCategory: tpl.category,
          content: tpl.content,
          includeDelivery: tpl.includeDelivery,
          includeReturn: tpl.includeReturn,
          includeHandover: tpl.includeHandover ?? true,
        });
      }

      toast.success('מסמכי המערכת סונכרנו לטפסים בהצלחה');
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
        category: (form.category as FormsCategory | undefined) ?? 'תפעול',
      })),
    [forms],
  );

  const filteredForms = useMemo(() => {
    if (activeCategory === 'הכל') return formsWithCategory;
    return formsWithCategory.filter((form) => form.category === activeCategory);
  }, [activeCategory, formsWithCategory]);

  const groupedForms = useMemo(() => {
    return FORM_CATEGORIES.map((cat) => ({
      category: cat,
      items: filteredForms.filter((form) => form.category === cat),
    })).filter((group) => group.items.length > 0);
  }, [filteredForms]);

  const openFormFile = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
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
        await updateForm.mutateAsync({
          id: editingForm.id,
          title: title.trim(),
          description: description.trim(),
          category,
          include_in_handover: effectiveIncludeInHandover,
          include_in_delivery: includeInDelivery,
          include_in_return: includeInReturn,
          ...(file ? { file } : {}),
        } as any);
        toast.success('הטופס עודכן בהצלחה');
      } else {
        const effectiveIncludeInHandover = includeInHandover || includeInDelivery || includeInReturn;
        await createForm.mutateAsync({
          title: title.trim(),
          description: description.trim(),
          category,
          file_url: null,
          json_schema: null,
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

  const extractVehicleDocumentsPath = (fileUrl: string): string | null => {
    try {
      const url = new URL(fileUrl);
      const marker = '/storage/v1/object/public/vehicle-documents/';
      const idx = url.pathname.indexOf(marker);
      if (idx === -1) return null;
      return decodeURIComponent(url.pathname.slice(idx + marker.length));
    } catch {
      return null;
    }
  };

  const openDeleteDialog = (form: OrgDocument & { category: FormsCategory }) => {
    setFormToDelete(form);
    setDeletePassword('');
    setDeleteDialogOpen(true);
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
      const fileUrl = formToDelete.file_url;
      if (fileUrl) {
        const storagePath = extractVehicleDocumentsPath(fileUrl);
        if (storagePath) {
          const { error: removeError } = await supabase.storage
            .from('vehicle-documents')
            .remove([storagePath]);
          if (removeError) {
            throw removeError;
          }
        }
      }

      const { error: deleteError } = await (supabase as any)
        .from('org_documents')
        .delete()
        .eq('id', formToDelete.id);

      if (deleteError) {
        throw deleteError;
      }

      await queryClient.invalidateQueries({ queryKey: ['org-documents'] });
      toast.success('הטופס נמחק בהצלחה');
      setDeleteDialogOpen(false);
      setFormToDelete(null);
      setDeletePassword('');
    } catch (error: any) {
      toast.error(`מחיקת טופס נכשלה: ${error?.message ?? 'שגיאה לא צפויה'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container py-4 sm:py-6 space-y-6 forms-clean">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">טפסים</h1>
          <p className="text-muted-foreground mt-1">מרכז הטפסים הארגוני לצפייה והורדה</p>
        </div>

        {canManageForms && (
          <div className="flex w-full sm:w-auto gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleSyncBuiltinDocs} disabled={syncingBuiltin}>
              {syncingBuiltin ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              סנכרון מסמכי מערכת
            </Button>
            <Button className="w-full sm:w-auto gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              הוסף טופס חדש
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['הכל', ...FORM_CATEGORIES] as CategoryFilter[]).map((cat) => (
          <Button
            key={cat}
            type="button"
            variant={activeCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <FormCardSkeleton key={idx} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedForms.map((group) => (
            <section key={group.category} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{group.category}</h2>
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {group.items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.items.map((form) => {
                  const autoFill = resolveSchemaAutoFill(form.json_schema, autoFillContext);
                  const autoFillKeys = Object.keys(autoFill);
                  const hasPdf = Boolean(form.file_url);

                  return (
                    <Card key={form.id} className="h-full">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="truncate forms-file-name">{form.title}</span>
                          {canManageForms && (
                            <button
                              type="button"
                              className="mr-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="עריכת כותרת ותיאור"
                              onClick={() => openContentEditor(form as OrgDocument & { category: FormsCategory })}
                            >
                              <Pencil className="h-4 w-4" />
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
                      <CardFooter className="flex-col gap-2">
                        <Button
                          type="button"
                          className="w-full gap-2"
                          data-no-theme
                          data-file-action="download"
                          data-clean-file-row
                          
                          variant="outline"
                          disabled={!hasPdf}
                          onClick={() => hasPdf && openFormFile(form.file_url as string)}
                        >
                          <Download className="h-4 w-4" />
                          {hasPdf ? 'צפייה/הורדה' : 'קובץ לא זמין'}
                        </Button>
                        {canManageForms && (
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
                        {canManageForms && (
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
                {FORM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
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
              פעולה זו תמחק את הטופס מטבלת המערכת ותנסה למחוק גם את הקובץ המשויך מה-Storage.
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
    </div>
  );
}
