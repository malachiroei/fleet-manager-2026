import { jsPDF } from 'jspdf';
import hebrewFontUrl from '@/assets/fonts/NotoSansHebrew.ttf?url';

export interface FormsCustomFieldDef {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface FormsChecklistColumn {
  key: string;
  label: string;
}

export interface FormsChecklistTableDef {
  id: string;
  title?: string;
  rows: string[];
  columns: FormsChecklistColumn[];
}

export interface FormsTemplateExtensions {
  custom_fields?: FormsCustomFieldDef[];
  checklist_tables?: FormsChecklistTableDef[];
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
  return {
    id: table.id,
    title: table.title?.trim() || undefined,
    columns: cols,
    rows: rows.length > 0 ? rows : ['פריט 1'],
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
  };
}

export function mergeExtensionsIntoSchema(
  base: Record<string, unknown>,
  extensions: FormsTemplateExtensions | null | undefined,
): Record<string, unknown> {
  const next = { ...base };
  if (
    extensions &&
    ((extensions.custom_fields?.length ?? 0) > 0 || (extensions.checklist_tables?.length ?? 0) > 0)
  ) {
    next.template_extensions = {
      custom_fields: extensions.custom_fields ?? [],
      checklist_tables: (extensions.checklist_tables ?? []).map(normalizeChecklistTable),
    };
  } else {
    delete (next as { template_extensions?: unknown }).template_extensions;
  }
  return next;
}

const MANDATORY_SIGNATURE_FOOTER = [
  '────────────── אישור עובד ──────────────',
  'תאריך: ____________________    שעה: ____________________',
  'חתימת העובד: __________________________________________________________',
].join('\n');

/**
 * יוצר PDF עברי RTL למסמך מובנה (טפסים), כולל שדות דינמיים, טבלאות סימון,
 * ותחתית חובה עם תאריך/שעה/חתימה.
 */
export async function generateFormsPdfBlob(params: {
  formTitle: string;
  mainContent: string;
  extensions?: FormsTemplateExtensions | null;
  headerContext?: { employeeName?: string; vehicleNumber?: string };
  /** תאריך/שעה לכותרת (מילוי אוטומטי בזמן יצירת הקובץ) */
  printedAt?: Date;
}): Promise<Blob> {
  const { formTitle, mainContent, extensions, headerContext, printedAt } = params;
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
  doc.text(`תאריך (הדפסה): ${now.toLocaleDateString('he-IL')}`, rightX, 78, { align: 'right' });
  doc.text(`שעה (הדפסה): ${now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`, rightX, 94, {
    align: 'right',
  });
  doc.text(`שם הנהג/עובד: ${headerContext?.employeeName || 'לא זמין'}`, rightX, 110, { align: 'right' });
  doc.text(`מספר רישוי: ${headerContext?.vehicleNumber || 'לא זמין'}`, rightX, 126, { align: 'right' });
  doc.setDrawColor(180, 190, 205);
  doc.line(leftX, 136, pageW - leftX, 136);

  let y = 152;
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
    y += 12;
  }

  ensureSpace(80);
  doc.setFontSize(12);
  doc.setDrawColor(160, 170, 185);
  doc.line(leftX, y, pageW - leftX, y);
  y += 20;
  writeParagraphBlock(MANDATORY_SIGNATURE_FOOTER, 12);

  return doc.output('blob');
}
