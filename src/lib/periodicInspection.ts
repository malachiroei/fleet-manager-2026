import type { Vehicle } from '@/types/fleet';

/** תחילת חישוב: עלייה לכביש (חודש/שנה) → יום 1 בחודש; אחרת תאריך קליטה; אחרת 1.1 של שנת הדגם */
export function getVehicleAscentDate(v: Vehicle): Date | null {
  const y = v.road_ascent_year;
  const m = v.road_ascent_month;
  if (y != null && m != null && m >= 1 && m <= 12) {
    return new Date(y, m - 1, 1);
  }
  if (v.pickup_date && String(v.pickup_date).trim()) {
    const d = new Date(String(v.pickup_date).slice(0, 10));
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (v.year != null && !Number.isNaN(Number(v.year))) {
    return new Date(Number(v.year), 0, 1);
  }
  return null;
}

function parseYmdLocal(ymd: string): Date | null {
  const s = String(ymd).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** הוספת חודשים בלוח שנה מקומי */
export function addMonthsYmd(ymd: string, months: number): string {
  const d = parseYmdLocal(ymd);
  if (!d) return ymd;
  const out = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return formatYmdLocal(out);
}

function addYearsToDate(d: Date, years: number): Date {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
}

/**
 * במהלך 3 השנים הראשונות ממועד העלייה לכביש — מרווח 6 חודשים; מעבר לכך — 3 חודשים.
 * ה"גבול" הוא תאריך שבו נסתיימו 3 שנים מלאות מהעלייה (אותו יום-חודש בשנה השלישית).
 */
export function intervalMonthsForNextInspectionAfter(
  lastInspectionDone: Date,
  ascent: Date,
): 6 | 3 {
  const threeYearsEnd = addYearsToDate(ascent, 3);
  return lastInspectionDone < threeYearsEnd ? 6 : 3;
}

/** תאריך הביקורת הבאה אחרי שבוצעה ביקורת ב־lastYmd */
export function computeNextInspectionDueAfterVisit(lastYmd: string, v: Vehicle): string | null {
  const ascent = getVehicleAscentDate(v);
  if (!ascent) return null;
  const done = parseYmdLocal(lastYmd);
  if (!done) return null;
  const months = intervalMonthsForNextInspectionAfter(done, ascent);
  return addMonthsYmd(lastYmd, months);
}

/**
 * תאריך יעד הבא להצגה: אם יש ביקורת אחרונה — לפי חוק; אחרת — סימולציה מהעלייה לכביש עד "היום".
 */
export function computeDisplayNextInspectionDue(v: Vehicle): string | null {
  const ascent = getVehicleAscentDate(v);
  if (!ascent) return v.next_inspection_date ? String(v.next_inspection_date).slice(0, 10) : null;

  if (v.last_inspection_date && String(v.last_inspection_date).trim()) {
    const last = String(v.last_inspection_date).slice(0, 10);
    return computeNextInspectionDueAfterVisit(last, v);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let due = addMonthsYmd(formatYmdLocal(ascent), 6);
  let dueD = parseYmdLocal(due);
  if (!dueD) return null;

  for (let guard = 0; guard < 120; guard++) {
    if (dueD >= today) return due;
    const step = intervalMonthsForNextInspectionAfter(dueD, ascent);
    due = addMonthsYmd(due, step);
    const nextD = parseYmdLocal(due);
    if (!nextD) break;
    dueD = nextD;
  }

  return due;
}

export function periodicInspectionRuleSummary(v: Vehicle): string {
  const ascent = getVehicleAscentDate(v);
  if (!ascent) return 'הגדר תאריך עלייה לכביש בכרטיס הרכב לחישוב מרווחים.';
  const threeEnd = addYearsToDate(ascent, 3);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inFirstThree = today < threeEnd;
  return inFirstThree
    ? 'ב־3 שנים הראשונות מעלייה לכביש: ביקורת כל 6 חודשים; לאחר מכן כל 3 חודשים.'
    : 'לאחר 3 שנים מעלייה לכביש: ביקורת כל 3 חודשים.';
}
