import type { OrgDocument } from '@/hooks/useOrgDocuments';
import { normalizePdfDisplayFlags } from '@/lib/formsGeneratedPdf';

/** תוויות רכב כמו ב-PDF האשף — ללא כפילות קידומת; לא מציגים UUID גולמי */
export function formatVehicleLabelForHandoverHeader(label: string): string {
  const t = String(label ?? '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return 'לא זמין';
  return t.length > 0 ? t : 'לא זמין';
}

export type HandoverDocHeaderContext = {
  /** תאריך מסירה כבר מפורמט (כמו today באשף) */
  dateLabel: string;
  printedAt: Date;
  /** אם מוגדר — משמש לשורת שעת חתימה במקום פורמט מ־printedAt */
  timeLabel?: string;
  vehicleLabel: string;
  driverName: string;
  employeeNumber: string;
  idNumber: string;
  mobile: string;
};

/**
 * שורות כותרת לפי דגלי org_documents — תואם לעריכת טפסים ול-PDF.
 */
export function buildHandoverFormHeaderMetaLines(
  doc: Pick<
    OrgDocument,
    | 'show_date'
    | 'show_time'
    | 'show_driver_name'
    | 'show_license_plate'
    | 'show_employee_id'
    | 'show_id_number'
    | 'show_mobile'
  > | null | undefined,
  ctx: HandoverDocHeaderContext,
): string[] {
  const f = normalizePdfDisplayFlags(doc ?? {});
  const lines: string[] = [];
  if (f.show_date) lines.push(`תאריך חתימה: ${ctx.dateLabel}`);
  if (f.show_time) {
    const timeText =
      ctx.timeLabel?.trim() ||
      ctx.printedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    lines.push(`שעת חתימה: ${timeText}`);
  }
  if (f.show_driver_name) lines.push(`נהג: ${ctx.driverName || 'לא זמין'}`);
  if (f.show_license_plate) lines.push(`רכב: ${formatVehicleLabelForHandoverHeader(ctx.vehicleLabel)}`);
  if (f.show_employee_id) lines.push(`מספר עובד: ${ctx.employeeNumber.trim() || 'לא זמין'}`);
  if (f.show_id_number) lines.push(`מספר ת.ז: ${ctx.idNumber.trim() || 'לא זמין'}`);
  if (f.show_mobile) lines.push(`מספר נייד: ${ctx.mobile.trim() || 'לא זמין'}`);
  return lines;
}
