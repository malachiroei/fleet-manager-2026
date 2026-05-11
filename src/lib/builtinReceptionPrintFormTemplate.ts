import type { OrgDocument } from '@/hooks/useOrgDocuments';
import type { FormsCategory } from '@/lib/formsAutofill';
import { HANDOVER_ACCESSORY_CEILINGS, formatCeilingPrice } from '@/lib/accessoryCeilings';
import { orgDocumentHandoverLabel } from '@/lib/orgDocumentHandoverFilter';
import {
  normalizeChecklistTable,
  type FormsPdfDisplayFlags,
  type FormsTemplateExtensions,
} from '@/lib/formsGeneratedPdf';

export const BUILTIN_RECEPTION_PRINT_FORM_KEY = 'system-reception-form-printable' as const;

/** כותרת תצוגה שמזהה את טופס ההדפסה (גם רשומות ישנות בלי builtin_template_key) */
export const RECEPTION_PRINT_FORM_DISPLAY_TITLE = 'טופס קבלת רכב';

/**
 * האם למלא בעריכת תוכן ברירות מהתבנית (תוכן, טבלה, תיאור, דגלי PDF).
 * כולל שורות ישנות: כותרת «טופס קבלת רכב» בלי מפתח / בלי template_content / או רק x_forms_download_only.
 */
export function isReceptionPrintPdfBuiltinDoc(doc: Pick<OrgDocument, 'json_schema'>): boolean {
  const s = doc.json_schema;
  if (!s || typeof s !== 'object') return false;
  return String((s as Record<string, unknown>).builtin_template_key ?? '').trim() === BUILTIN_RECEPTION_PRINT_FORM_KEY;
}

/** טופס הקבלה האינטראקטיבי באשף — לא עותק ה-PDF (printable) */
export function isInteractiveHandoverReceptionDoc(doc: Pick<OrgDocument, 'title' | 'name' | 'json_schema'>): boolean {
  return orgDocumentHandoverLabel(doc as OrgDocument).includes('טופס קבלת רכב') && !isReceptionPrintPdfBuiltinDoc(doc);
}

export function shouldHydrateReceptionPrintFormDefaults(
  form: Pick<OrgDocument, 'title' | 'name'>,
  schema: unknown,
): boolean {
  const s = schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : {};
  if (String(s.builtin_template_key ?? '').trim() === BUILTIN_RECEPTION_PRINT_FORM_KEY) {
    return true;
  }
  const label = orgDocumentHandoverLabel(form as Pick<OrgDocument, 'title' | 'name'>)
    .replace(/\s+/g, ' ')
    .trim();
  if (label !== RECEPTION_PRINT_FORM_DISPLAY_TITLE) return false;
  if (s.x_forms_download_only === true) return true;
  if (s.template_mode !== 'generated') return true;
  if (!String(s.template_content ?? '').trim()) return true;
  return false;
}

/** תואם ברירת מחדל נפוצה בעריכת תוכן: תאריך/שעה/שם/לוחית/חתימה; ללא ת.ז/עובד/נייד בכותרת (שורות מילוי בגוף). */
export const RECEPTION_PRINT_PDF_DISPLAY_FLAGS: FormsPdfDisplayFlags = {
  show_date: true,
  show_time: true,
  show_driver_name: true,
  show_license_plate: true,
  show_employee_id: false,
  show_id_number: false,
  show_mobile: false,
  show_signature_block: true,
};

const RECEPTION_PRINT_BODY = [
  'יש לסמן ✓ או ✗ על כל פריט בטבלה להלן ולחתום בתחתית הטופס.',
  '',
  '1. התחייבות והצהרת הנהג',
  'הנני מתחייב להשתמש ברכב אך ורק לשם מילוי תפקידי ולנהוג לפי חוקי התעבורה והנחיות החברה.',
  'ידוע לי כי אחריותי המלאה חלה על שימוש תקין ברכב ועל החזרתו בשלמות.',
  '',
  '3. שדות מילוי נדרשים (במידה ולא סומנו בכותרת המודפסת — נא להשלים בשורות)',
  'שם מלא: ________________________________________________________',
  'מספר תעודת זהות (*): ________________________________________',
  'מספר עובד (*): ______________________________________________',
  'טלפון נייד (*): _____________________________________________',
  'כתובת העובד — עיר ורחוב (*): ________________________________',
  'דגם רכב: ____________________________________________________',
  'מספר רכב (לוחית): ___________________________________________',
  'קוד קודנית (*): _____________________________________________',
  'תאריך ושעת מסירה: ___________________________________________',
  'הערות: ________________________________________________________',
].join('\n');

function receptionPrintTemplateExtensions(): FormsTemplateExtensions {
  return {
    checklist_tables: [
      normalizeChecklistTable({
        id: 'reception_accessories_print_v1',
        title: '2. טבלת אישור אביזרים',
        variant: 'accessory',
        rows: HANDOVER_ACCESSORY_CEILINGS.map((a) => a.name),
        row_ceiling_labels: HANDOVER_ACCESSORY_CEILINGS.map((a) => formatCeilingPrice(a.maxPriceNis)),
        columns: [],
      }),
    ],
  };
}

/** מפרט לסנכרון מסמכי מערכת — יוצר PDF מובנה + סכמה לעריכה במרכז הטפסים */
export const builtinReceptionPrintFormSyncTpl = {
  key: BUILTIN_RECEPTION_PRINT_FORM_KEY,
  title: 'טופס קבלת רכב',
  description:
    'מסמך מובנה למילוי ידני, עריכה במרכז הטפסים והפקת PDF. אינו מחליף את טופס הקבלה הדיגיטלי באשף המסירה.',
  category: 'תפעול' as FormsCategory,
  content: RECEPTION_PRINT_BODY,
  templateExtensions: receptionPrintTemplateExtensions(),
  pdfDisplayFlags: RECEPTION_PRINT_PDF_DISPLAY_FLAGS,
  includeDelivery: true,
  includeReturn: false,
  includeHandover: false,
  /** נשמר ב-json_schema — לא נכלל באשף מסירה / בחירת טפסים במסך מסירה */
  formsLibraryOnly: true,
};
