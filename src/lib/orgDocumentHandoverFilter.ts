import type { OrgDocument } from '@/hooks/useOrgDocuments';

/** כותרת תצוגה: title, אחרת name — בלי רווחים מיותרים */
export function orgDocumentHandoverLabel(doc: Pick<OrgDocument, 'title' | 'name'>): string {
  const t = String(doc.title ?? '').trim();
  if (t.length > 0) return t;
  return String(doc.name ?? '').trim();
}

/** כותרות טפסים ישנים שלא יוצגו במסך מסירת רכב / באשף (מוחלף במסמכים מהמרכז) */
export const ORG_DOCUMENT_DELIVERY_PICKER_TITLE_BLOCKLIST = ['טופס מסירת רכב'] as const;

export function isOrgDocumentExcludedFromVehicleDeliveryPicker(
  doc: Pick<OrgDocument, 'title' | 'name'>,
): boolean {
  const label = orgDocumentHandoverLabel(doc).replace(/\s+/g, ' ').trim();
  return (ORG_DOCUMENT_DELIVERY_PICKER_TITLE_BLOCKLIST as readonly string[]).includes(label);
}

/**
 * מסמכי הורדה בלבד למרכז הטפסים — לא באשף/מסירה, **אלא** אם סומן במפורש `include_in_delivery`
 * (אז מוצג בבחירת טפסים במסך מסירה).
 */
export function isOrgDocumentFormsDownloadOnly(
  doc: Pick<OrgDocument, 'json_schema' | 'include_in_delivery'>,
): boolean {
  if (doc.include_in_delivery === true) return false;
  const s = doc.json_schema;
  if (!s || typeof s !== 'object') return false;
  return (s as Record<string, unknown>).x_forms_download_only === true;
}

/**
 * טפסים לבחירת מסירה — **אותו סט** בדף המסירה ובאשף («הוספת טפסים»).
 * רק מסמכים שסומנו במרכז הטפסים כ־`include_in_delivery` (ולא הורדה בלבד / לא בחסימה).
 */
export function filterOrgDocumentsForVehicleDeliveryPicker(docs: OrgDocument[]): OrgDocument[] {
  return docs.filter(
    (doc) =>
      doc.is_active &&
      Boolean(doc.include_in_delivery) &&
      !isOrgDocumentFormsDownloadOnly(doc) &&
      !isOrgDocumentExcludedFromVehicleDeliveryPicker(doc),
  );
}

/**
 * טפסים להצגה במסירה/אשף: פעילים, עם כותרת, ועם תוכן אמיתי (קובץ / סכמה / תיאור).
 * מונע שורות ריקות ברשימת צ'קבוקסים מרשומות DB חלקיות.
 */
export function isOrgDocumentUsableForHandoverList(doc: OrgDocument): boolean {
  if (!doc.is_active) return false;
  if (orgDocumentHandoverLabel(doc).length === 0) return false;
  const hasFile = Boolean(String(doc.file_url ?? '').trim());
  const schema = doc.json_schema;
  const hasSchema =
    schema != null && typeof schema === 'object' && Object.keys(schema as object).length > 0;
  const hasDesc = String(doc.description ?? '').trim().length > 0;
  return hasFile || hasSchema || hasDesc;
}

/** מפתח `builtin_template_key` מתוך `json_schema` (טפסי מערכת). */
export function orgDocBuiltinTemplateKey(doc: Pick<OrgDocument, 'json_schema'>): string {
  const s = doc.json_schema;
  if (!s || typeof s !== 'object') return '';
  const raw = (s as Record<string, unknown>).builtin_template_key;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** טופס הסבת דוחות / נספח אחריות אישית לעבירות תנועה — ברירת מחדל למסירת רכב חליפי. */
export function isTrafficLiabilityConversionHandoverDoc(doc: OrgDocument): boolean {
  if (orgDocBuiltinTemplateKey(doc) === 'system-traffic-liability-annex') return true;
  const label = orgDocumentHandoverLabel(doc);
  if (label.includes('הסבת דוחות')) return true;
  return label.includes('אחריות אישית') && label.includes('עבירות תנועה');
}
