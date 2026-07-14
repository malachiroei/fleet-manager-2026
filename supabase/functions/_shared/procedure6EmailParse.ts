/**
 * Parse Hebrew Procedure 6 call-center email body (Image 1 format).
 * Keys include: פנייה עבור רכב, בתאריך, במקום, תיאור הפנייה, שם המדווח, טלפון של המדווח
 */

export type ParsedProcedure6Email = {
  vehicle_number: string;
  report_date_time: string | null;
  location: string | null;
  description: string | null;
  reporter_name: string | null;
  reporter_cell_phone: string | null;
  driver_name: string | null;
  driver_cell_phone: string | null;
  company: string | null;
  report_id: string | null;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Digits only — matches client normalizePlateNumber */
export function normalizePlateDigits(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw).replace(/\D/g, '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, '');
}

function fieldAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：\\-–]?\\s*(.+)`,
      'imu',
    );
    const m = text.match(re);
    if (m?.[1]) {
      const line = m[1].split(/\n/)[0]?.trim() ?? '';
      if (line) return line;
    }
  }
  return null;
}

/** Parse DD/MM/YYYY HH:mm:ss (or with AM/PM) → ISO UTC-ish local Israeli noon offset unknown → ISO string */
export function parseHebrewIncidentDateTime(raw: string | null | undefined): string | null {
  const s = clean(raw);
  if (!s) return null;
  const m = s.match(
    /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i,
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] ? Number(m[6]) : 0;
  const ampm = (m[7] ?? '').toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  // Treat as Israel local (UTC+3 typical) without TZ DB — encode as UTC wall clock for storage
  const iso = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), hour, minute, second));
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

export function parseProcedure6EmailBody(rawBody: string): ParsedProcedure6Email | null {
  const text = stripHtml(rawBody || '');
  if (!text.trim()) return null;

  const vehicleRaw =
    fieldAfterLabel(text, ['פנייה עבור רכב', 'דיווח על רכב מספר', 'מספר רכב', 'רכב']) ?? '';
  const vehicle_number = normalizePlateDigits(vehicleRaw);
  if (vehicle_number.length < 5) return null;

  const reportDateRaw = fieldAfterLabel(text, ['בתאריך', 'מועד האירוע', 'תאריך']);
  const location = fieldAfterLabel(text, ['במקום', 'מיקום האירוע', 'מיקום']);
  const description = fieldAfterLabel(text, ['תיאור הפנייה', 'תיאור האירוע', 'תיאור']);
  const reporter_name = fieldAfterLabel(text, ['שם המדווח', 'מדווח']);
  const reporter_cell_phone = fieldAfterLabel(text, [
    'טלפון של המדווח',
    'טלפון המדווח',
    'טלפון מדווח',
  ]);
  const driver_name = fieldAfterLabel(text, ['נהג', 'שם הנהג']);
  const driver_cell_phone = fieldAfterLabel(text, ['סלולרי נהג', 'טלפון נהג']);
  const company = fieldAfterLabel(text, ['חברה']);
  const report_id = fieldAfterLabel(text, ['מספר פנייה', 'מספר דיווח', 'ReportID']);

  return {
    vehicle_number,
    report_date_time: parseHebrewIncidentDateTime(reportDateRaw),
    location,
    description,
    reporter_name,
    reporter_cell_phone,
    driver_name,
    driver_cell_phone,
    company,
    report_id,
  };
}

/** Dev subject filter + production call-center subjects */
export function isProcedure6ComplaintSubject(subject: string): boolean {
  const s = clean(subject);
  if (!s) return false;
  if (/התקבלה\s*תלונה\s*נוהל\s*6/i.test(s)) return true;
  if (/התקבלה\s*פני[י]?ה/i.test(s) && /נהיגה|נוהל\s*6|איך\s*הנהיגה/i.test(s)) return true;
  if (/נוהל\s*6/i.test(s) && /תלונה|פני[י]?ה|דיווח/i.test(s)) return true;
  return false;
}

export function randomResponseToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${crypto.randomUUID().replace(/-/g, '')}${hex}`;
}
