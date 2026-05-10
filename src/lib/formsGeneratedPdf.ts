import { jsPDF } from 'jspdf';
import hebrewFontUrl from '@/assets/fonts/NotoSansHebrew.ttf?url';
import { drawVehicleDamageDiagramInPdf } from '@/lib/pdfVehicleDamageDiagram';
import { EMPTY_DAMAGE_REPORT } from '@/lib/vehicleDamage';

export interface FormsCustomFieldDef {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface FormsChecklistColumn {
  key: string;
  label: string;
}

/** tri_state = תקין/לא תקין/טופל (ברירת מחדל); accessory = ✓/✗/פריט/תקרה/הערות כמו טופס קבלת רכב */
export type FormsChecklistTableVariant = 'tri_state' | 'accessory';

export interface FormsChecklistTableDef {
  id: string;
  title?: string;
  rows: string[];
  columns: FormsChecklistColumn[];
  variant?: FormsChecklistTableVariant;
  /** לוריאנט accessory — תווית תקרה לכל שורה (מקביל ל־rows) */
  row_ceiling_labels?: string[];
}

export interface FormsTemplateExtensions {
  custom_fields?: FormsCustomFieldDef[];
  checklist_tables?: FormsChecklistTableDef[];
  /** בלוק סימון נזקים לפי צד (כמו באשף מסירה) ב-PDF המודפס */
  include_damage_diagram?: boolean;
}

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

const DEFAULT_CHECKLIST_COLUMNS: FormsChecklistColumn[] = [
  { key: 'ok', label: 'תקין' },
  { key: 'fail', label: 'לא תקין' },
  { key: 'handled', label: 'טופל' },
];

export const DEFAULT_FORMS_CHECKLIST_COLUMNS = DEFAULT_CHECKLIST_COLUMNS;

export function normalizeChecklistTable(table: FormsChecklistTableDef): FormsChecklistTableDef {
  const cols =
    Array.isArray(table.columns) && table.columns.length > 0 ? table.columns : DEFAULT_CHECKLIST_COLUMNS;
  const rows = Array.isArray(table.rows) ? table.rows.filter((r) => String(r).trim().length > 0) : [];
  const variant: FormsChecklistTableVariant = table.variant === 'accessory' ? 'accessory' : 'tri_state';
  const ceilingsRaw = Array.isArray(table.row_ceiling_labels) ? table.row_ceiling_labels : [];
  const row_ceiling_labels =
    variant === 'accessory'
      ? rows.map((_, i) => String(ceilingsRaw[i] ?? '').trim() || '—')
      : undefined;
  return {
    id: table.id,
    title: table.title?.trim() || undefined,
    columns: cols,
    rows: rows.length > 0 ? rows : ['פריט 1'],
    variant,
    row_ceiling_labels,
  };
}

export function parseTemplateExtensions(schema: Record<string, unknown> | null | undefined): FormsTemplateExtensions {
  if (!schema || typeof schema !== 'object') return {};
  const ext = (schema as { template_extensions?: FormsTemplateExtensions }).template_extensions;
  if (!ext || typeof ext !== 'object') return {};
  const custom = Array.isArray(ext.custom_fields) ? ext.custom_fields : [];
  const tables = Array.isArray(ext.checklist_tables) ? ext.checklist_tables.map(normalizeChecklistTable) : [];
  return {
    custom_fields: custom.filter(
      (f): f is FormsCustomFieldDef =>
        f && typeof f === 'object' && typeof (f as FormsCustomFieldDef).id === 'string',
    ),
    checklist_tables: tables,
    include_damage_diagram: ext.include_damage_diagram === true,
  };
}

export function mergeExtensionsIntoSchema(
  base: Record<string, unknown>,
  extensions: FormsTemplateExtensions | null | undefined,
): Record<string, unknown> {
  const next = { ...base };
  const hasDamageDiagram = extensions?.include_damage_diagram === true;
  if (
    extensions &&
    ((extensions.custom_fields?.length ?? 0) > 0 ||
      (extensions.checklist_tables?.length ?? 0) > 0 ||
      hasDamageDiagram)
  ) {
    next.template_extensions = {
      custom_fields: extensions.custom_fields ?? [],
      checklist_tables: (extensions.checklist_tables ?? []).map(normalizeChecklistTable),
      ...(hasDamageDiagram ? { include_damage_diagram: true } : {}),
    };
  } else {
    delete (next as { template_extensions?: unknown }).template_extensions;
  }
  return next;
}

/** תחתית קבועה בכל PDF מובנה — תואם למה שנאסף באשף (חתימה/תאריך) */
export const FORMS_PDF_SIGNATURE_BLOCK = [
  '────────────── אישור עובד ──────────────',
  'תאריך: ____________________    שעה: ____________________',
  'חתימת העובד: __________________________________________________________',
].join('\n');

const MANDATORY_SIGNATURE_FOOTER = FORMS_PDF_SIGNATURE_BLOCK;

/** תיאור שורות כותרת אפשריות ב-PDF (ההדפסה בפועל נשלטת ב-display flags לכל טופס) */
export const FORMS_PDF_AUTOMATIC_HEADER_LINES = [
  'תאריך חתימה: נקבע בעת יצירת הקובץ',
  'שעת חתימה: נקבע בעת יצירת הקובץ',
  'שם הנהג/עובד: נמשך מפרטי המסירה',
  'מספר רישוי: נמשך מפרטי הרכב במסירה',
  'מספר עובד: נמשך מפרטי העובד במסירה',
  'מספר ת.ז: נמשך מפרטי העובד במסירה',
  'מספר נייד: נמשך מפרטי העובד במסירה',
] as const;

export type FormsPdfDisplayFlags = {
  show_date: boolean;
  show_time: boolean;
  show_driver_name: boolean;
  show_license_plate: boolean;
  show_employee_id: boolean;
  show_id_number: boolean;
  show_mobile: boolean;
  show_signature_block: boolean;
};

export const DEFAULT_FORMS_PDF_DISPLAY_FLAGS: FormsPdfDisplayFlags = {
  show_date: true,
  show_time: true,
  show_driver_name: true,
  show_license_plate: true,
  show_employee_id: true,
  show_id_number: true,
  show_mobile: true,
  show_signature_block: true,
};

export type PdfDisplayFlagsInput = Partial<Record<keyof FormsPdfDisplayFlags, boolean | null | undefined>>;

export function normalizePdfDisplayFlags(input: PdfDisplayFlagsInput | null | undefined): FormsPdfDisplayFlags {
  const i = input ?? {};
  const pick = (key: keyof FormsPdfDisplayFlags, fallback = true) =>
    i[key] === null || i[key] === undefined ? fallback : Boolean(i[key]);
  return {
    show_date: pick('show_date'),
    show_time: pick('show_time'),
    show_driver_name: pick('show_driver_name'),
    show_license_plate: pick('show_license_plate'),
    show_employee_id: pick('show_employee_id'),
    show_id_number: pick('show_id_number'),
    show_mobile: pick('show_mobile'),
    show_signature_block: pick('show_signature_block'),
  };
}

/**
 * יוצר PDF עברי RTL למסמך מובנה (טפסים), כולל שדות דינמיים, טבלאות סימון,
 * ותחתית חובה עם תאריך/שעה/חתימה.
 */
export async function generateFormsPdfBlob(params: {
  formTitle: string;
  mainContent: string;
  extensions?: FormsTemplateExtensions | null;
  headerContext?: {
    employeeName?: string;
    vehicleNumber?: string;
    employeeNumber?: string;
    idNumber?: string;
    mobile?: string;
  };
  displayFlags?: PdfDisplayFlagsInput | null;
  /** תאריך/שעה לכותרת (מילוי אוטומטי בזמן יצירת הקובץ) */
  printedAt?: Date;
}): Promise<Blob> {
  const { formTitle, mainContent, extensions, headerContext, printedAt } = params;
  const flags = normalizePdfDisplayFlags(params.displayFlags);
  const now = printedAt ?? new Date();

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - 40;
  const leftX = 40;

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
  doc.text(formTitle, rightX, 56, { align: 'right' });
  doc.setFontSize(11);

  let headerLineY = 78;
  const lineGap = 16;
  if (flags.show_date) {
    doc.text(`תאריך חתימה: ${now.toLocaleDateString('he-IL')}`, rightX, headerLineY, { align: 'right' });
    headerLineY += lineGap;
  }
  if (flags.show_time) {
    doc.text(
      `שעת חתימה: ${now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`,
      rightX,
      headerLineY,
      { align: 'right' },
    );
    headerLineY += lineGap;
  }
  if (flags.show_driver_name) {
    doc.text(`שם הנהג/עובד: ${headerContext?.employeeName || 'לא זמין'}`, rightX, headerLineY, { align: 'right' });
    headerLineY += lineGap;
  }
  if (flags.show_license_plate) {
    doc.text(`מספר רישוי: ${headerContext?.vehicleNumber || 'לא זמין'}`, rightX, headerLineY, { align: 'right' });
    headerLineY += lineGap;
  }
  if (flags.show_employee_id) {
    doc.text(`מספר עובד: ${headerContext?.employeeNumber?.trim() || 'לא זמין'}`, rightX, headerLineY, {
      align: 'right',
    });
    headerLineY += lineGap;
  }
  if (flags.show_id_number) {
    doc.text(`מספר ת.ז: ${headerContext?.idNumber?.trim() || 'לא זמין'}`, rightX, headerLineY, { align: 'right' });
    headerLineY += lineGap;
  }
  if (flags.show_mobile) {
    doc.text(`מספר נייד: ${headerContext?.mobile?.trim() || 'לא זמין'}`, rightX, headerLineY, { align: 'right' });
    headerLineY += lineGap;
  }

  const hasHeaderDetailLines =
    flags.show_date ||
    flags.show_time ||
    flags.show_driver_name ||
    flags.show_license_plate ||
    flags.show_employee_id ||
    flags.show_id_number ||
    flags.show_mobile;

  let y: number;
  if (hasHeaderDetailLines) {
    doc.setDrawColor(180, 190, 205);
    const sepY = headerLineY + 6;
    doc.line(leftX, sepY, pageW - leftX, sepY);
    y = sepY + 16;
  } else {
    y = Math.max(headerLineY, 88);
  }
  doc.setFontSize(13);

  const ensureSpace = (needed: number) => {
    if (y + needed > 780) {
      doc.addPage();
      y = 56;
    }
  };

  const writeParagraphBlock = (text: string, fontSize = 13) => {
    doc.setFontSize(fontSize);
    const sections = (text || '-').split('\n').map((line) => line.trim());
    for (const section of sections) {
      const wrapped = doc.splitTextToSize(section || ' ', pageW - 80);
      for (const row of wrapped) {
        ensureSpace(22);
        doc.text(row, rightX, y, { align: 'right' });
        y += 18;
      }
      y += 6;
    }
  };

  writeParagraphBlock(mainContent);

  const ext = extensions ?? {};
  const customFields = ext.custom_fields ?? [];
  if (customFields.length > 0) {
    ensureSpace(40);
    doc.setFontSize(14);
    doc.text('שדות נוספים (למילוי ידני)', rightX, y, { align: 'right' });
    y += 22;
    doc.setFontSize(12);
    for (const field of customFields) {
      const label = String(field.label ?? '').trim() || 'שדה';
      const lines = field.multiline ? 3 : 1;
      ensureSpace(24 + lines * 18);
      doc.text(`${label}:`, rightX, y, { align: 'right' });
      y += 16;
      for (let i = 0; i < lines; i++) {
        doc.setDrawColor(200, 200, 210);
        doc.line(leftX, y + 4, pageW - leftX, y + 4);
        y += 22;
      }
      y += 8;
    }
  }

  const tables = ext.checklist_tables ?? [];
  for (const rawTable of tables) {
    const table = normalizeChecklistTable(rawTable);
    ensureSpace(50);
    doc.setFontSize(14);
    const tableTitle = table.title?.trim() || 'טבלת ביקורת / סימון';
    doc.text(tableTitle, rightX, y, { align: 'right' });
    y += 22;

    if (table.variant === 'accessory') {
      doc.setFontSize(9);
      doc.text('✓      ✗      פריט (תיאור)                        תקרה        הערות', rightX, y, { align: 'right' });
      y += 14;
      doc.setFontSize(10);
      table.rows.forEach((rowLabel, idx) => {
        const ceiling = table.row_ceiling_labels?.[idx] ?? '—';
        const line = `☐      ☐      ${String(rowLabel).trim()}    ${ceiling}    _______________`;
        ensureSpace(22);
        const wrapped = doc.splitTextToSize(line, pageW - 72);
        for (const row of wrapped) {
          doc.text(row, rightX, y, { align: 'right' });
          y += 14;
        }
        y += 2;
      });
    } else {
      doc.setFontSize(10);
      /** כותרות עמודות — משמאל לימין: פריט | עמודות סימון */
      const colLabels = [...table.columns].reverse().map((c) => c.label).join('    ');
      doc.text(`פריט / בדיקה                    ${colLabels}`, rightX, y, { align: 'right' });
      y += 16;
      doc.setFontSize(11);
      for (const rowLabel of table.rows) {
        const marks = table.columns.map(() => '☐').join('      ');
        const line = `${String(rowLabel).trim()}     ${marks}`;
        ensureSpace(22);
        const wrapped = doc.splitTextToSize(line, pageW - 80);
        for (const row of wrapped) {
          doc.text(row, rightX, y, { align: 'right' });
          y += 16;
        }
        y += 4;
      }
    }
    y += 12;
  }

  if (ext.include_damage_diagram) {
    ensureSpace(360);
    y = await drawVehicleDamageDiagramInPdf(doc, pageW, rightX, y, EMPTY_DAMAGE_REPORT, 'always');
  }

  if (flags.show_signature_block) {
    ensureSpace(80);
    doc.setFontSize(12);
    doc.setDrawColor(160, 170, 185);
    doc.line(leftX, y, pageW - leftX, y);
    y += 20;
    writeParagraphBlock(MANDATORY_SIGNATURE_FOOTER, 12);
  }

  return doc.output('blob');
}

export type ChecklistTableRowResponse = { checked?: boolean; missing?: boolean; notes?: string };

/** טבלאות מתוך template_extensions ב-PDF של אשף המסירה (טופס גנרי) */
export function appendChecklistTablesToGenericHandoverPdf(
  doc: InstanceType<typeof jsPDF>,
  yStart: number,
  extensions: FormsTemplateExtensions | null | undefined,
  layout: { pageW: number; rightX: number; leftX: number; pageHeight: number },
  responsesByTableId?: Record<string, ChecklistTableRowResponse[]>,
): number {
  let y = yStart;
  const { pageW, rightX, pageHeight } = layout;
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 36) {
      doc.addPage();
      y = 50;
    }
  };

  const tables = extensions?.checklist_tables ?? [];
  for (const raw of tables) {
    const table = normalizeChecklistTable(raw);
    ensureSpace(50);
    doc.setFontSize(14);
    const tableTitle = table.title?.trim() || 'טבלה';
    doc.text(tableTitle, rightX, y, { align: 'right' });
    y += 22;

    if (table.variant === 'accessory') {
      doc.setFontSize(9);
      doc.text('✓      ✗      פריט                        תקרה        הערות', rightX, y, { align: 'right' });
      y += 14;
      doc.setFontSize(10);
      const respList = responsesByTableId?.[table.id] ?? [];
      table.rows.forEach((rowLabel, idx) => {
        const ceiling = table.row_ceiling_labels?.[idx] ?? '—';
        const r = respList[idx];
        const ok = r?.checked ? '✓' : '☐';
        const miss = r?.missing ? '✗' : '☐';
        const notes = (r?.notes ?? '').trim() || '—';
        const line = `${ok}      ${miss}      ${String(rowLabel).trim()}    ${ceiling}    ${notes}`;
        ensureSpace(28);
        const wrapped = doc.splitTextToSize(line, pageW - 72) as string[];
        for (const wline of wrapped) {
          doc.text(wline, rightX, y, { align: 'right' });
          y += 14;
        }
        y += 2;
      });
    } else {
      doc.setFontSize(10);
      const colLabels = [...table.columns].reverse().map((c) => c.label).join('    ');
      doc.text(`פריט / בדיקה                    ${colLabels}`, rightX, y, { align: 'right' });
      y += 16;
      doc.setFontSize(11);
      for (const rowLabel of table.rows) {
        const marks = table.columns.map(() => '☐').join('      ');
        const line = `${String(rowLabel).trim()}     ${marks}`;
        ensureSpace(22);
        const wrapped = doc.splitTextToSize(line, pageW - 80) as string[];
        for (const row of wrapped) {
          doc.text(row, rightX, y, { align: 'right' });
          y += 16;
        }
        y += 4;
      }
    }
    y += 12;
  }
  return y;
}
