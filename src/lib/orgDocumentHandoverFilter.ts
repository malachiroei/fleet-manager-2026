import type { OrgDocument } from '@/hooks/useOrgDocuments';

/** כותרת תצוגה: title, אחרת name — בלי רווחים מיותרים */
export function orgDocumentHandoverLabel(doc: Pick<OrgDocument, 'title' | 'name'>): string {
  const t = String(doc.title ?? '').trim();
  if (t.length > 0) return t;
  return String(doc.name ?? '').trim();
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
