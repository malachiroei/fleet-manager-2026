/**
 * Fleet AI Query Engine (Upgraded - Local Automation & Testing Engine)
 * ───────────────────────────────────────────────────────────────────────────
 * Parses Hebrew natural-language questions, queries Supabase directly,
 * and returns formatted Hebrew answers. Fully deterministic and client-side.
 */

import { supabase } from '@/integrations/supabase/client';
import type { AIChatContext } from '@/components/AIChatAssistant';
import {
  fetchComplianceAlerts,
  formatComplianceAlertForBot,
} from '@/lib/complianceAlertsEngine';
import { actionRunComprehensiveE2ETest, actionDeleteTestSimulationData } from '@/lib/fleetE2ESimulation';
import { isMissingSchemaObjectError, formatSupabaseError } from '@/lib/supabaseError';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmt(d: string | null | undefined): string {
  if (!d) return 'לא ידוע';
  return new Date(d).toLocaleDateString('he-IL');
}

function km(n: number | null | undefined): string {
  if (n == null) return 'לא ידוע';
  return `${n.toLocaleString('he-IL')} ק"מ`;
}

function statusLabel(s: string | null | undefined): string {
  if (s === 'valid')   return '✅ תקין';
  if (s === 'warning') return '⚠️ בהתראה';
  if (s === 'expired') return '❌ פג תוקף';
  return 'לא ידוע';
}

/** Extract a plate-number-like token (e.g. 123-45-678 or 1234567) */
function extractPlate(text: string): string | null {
  const m = text.match(/\d[\d\-]{5,9}\d/);
  return m ? m[0].replace(/-/g, '') : null;
}

/** Extract a driver name if "נהג X" or "של X" pattern present */
function extractName(text: string): string | null {
  const m = text.match(/(?:נהג|של|לנהג|בנהג|עבור)\s+([^\s?!,،؟]{2,}(?:\s+[^\s?!,،؟]{2,})?)/u);
  return m ? m[1].trim() : null;
}

/** Extract numbers for quick odometer updates from text */
function extractOdometerValue(text: string): number | null {
  const m = text.match(/(?:עדכן|קילומטראז|מד אמת|קמ|ל)\s+(\d{1,3}(?:,\d{3})*|\d{1,7})/);
  if (!m) return null;
  const numStr = m[1].replace(/,/g, '');
  return parseInt(numStr, 10);
}

// ─────────────────────────────────────────────
// Fleet Configuration
// ─────────────────────────────────────────────

const FLEET_CONFIG = {
  deductibleAmount: 2000, // ₪ — השתתפות עצמית בנזק
  companyName: 'Fleet Manager 2026',
  vehiclesPagePath: '/vehicles',
  driversPagePath: '/drivers',
  alertsPagePath: '/compliance',
} as const;

function formatFileLink(url: string | null | undefined, label: string): string {
  if (!url) return '(לא הועלה)';
  const isPdf = /\.pdf(\?|$)/i.test(url) || url.includes('application%2Fpdf');
  const icon  = isPdf ? '📄' : '🖼️';
  return `[${icon} ${label}](${url})`;
}

// ─────────────────────────────────────────────
// Structured bot responses & navigation shortcuts
// ─────────────────────────────────────────────

export interface FleetQueryAction {
  label: string;
  href: string;
}

export interface FleetQueryResult {
  text: string;
  navigateTo?: string;
  autoNavigate?: boolean;
  action?: FleetQueryAction;
}

/** Minimal chat turn for handover follow-up context */
export interface FleetChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface NavShortcutDef {
  patterns: RegExp[];
  path: string;
  message: string;
  buttonLabel: string;
}

/** Hebrew screen/action shortcuts — aligned with Dashboard quick actions & App routes */
const NAV_SHORTCUTS: NavShortcutDef[] = [
  {
    patterns: [
      /^עדכון\s*ק/,
      /^עדכון\s*קילומטראז/,
      /^עדכן\s*קילומטראז\s*$/,
      /^מסך\s*עדכון\s*ק/,
      /^עמוד\s*עדכון\s*ק/,
      /^ק["״']?מ\s*$/,
    ],
    path: '/vehicles/odometer',
    message: '📍 **עדכון קילומטראז׳** — מעביר אותך למסך עדכון מד-אמת לרכבי הצי.',
    buttonLabel: 'עבור לעדכון ק״מ',
  },
  {
    patterns: [
      /^דיווח\s*קילומטראז/,
      /^דיווח\s*ק["״']?מ/,
      /^רישום\s*קילומטראז/,
      /^report\s*mileage/i,
    ],
    path: '/report-mileage',
    message: '📝 **דיווח קילומטראז׳** — מעביר אותך למסך הדיווח.',
    buttonLabel: 'עבור לדיווח ק״מ',
  },
  {
    patterns: [
      /^עדכון\s*טיפול/,
      /^עמוד\s*עדכון\s*טיפול/,
      /^טיפול\s*רכב/,
    ],
    path: '/vehicles/service-update',
    message: '🔧 **עדכון טיפול** — מעביר אותך למסך עדכון טיפולי רכב.',
    buttonLabel: 'עבור לעדכון טיפול',
  },
  {
    patterns: [
      /^הוסף\s*רכב\s*$/,
      /^טופס\s*רכב\s*חדש/,
      /^עמוד\s*הוספת\s*רכב/,
    ],
    path: '/vehicles/add',
    message: '🚗 **הוספת רכב** — מעביר אותך לטופס הקמת רכב במערכת.',
    buttonLabel: 'עבור להוספת רכב',
  },
  {
    patterns: [
      /^הוסף\s*נהג\s*$/,
      /^טופס\s*נהג\s*חדש/,
      /^עמוד\s*הוספת\s*נהג/,
    ],
    path: '/drivers/add',
    message: '👤 **הוספת נהג** — מעביר אותך לטופס הקמת נהג במערכת.',
    buttonLabel: 'עבור להוספת נהג',
  },
  {
    patterns: [
      /^רשימת\s*רכבים/,
      /^עמוד\s*רכבים/,
      /^מסך\s*רכבים/,
      /^ניהול\s*רכבים/,
      /^כל\s*הרכבים\s*$/,
      /^רכבים\s*$/,
    ],
    path: '/vehicles',
    message: '🚗 **רשימת רכבים** — מעביר אותך לעמוד ניהול הרכבים.',
    buttonLabel: 'עבור לרשימת רכבים',
  },
  {
    patterns: [
      /^רשימת\s*נהגים/,
      /^עמוד\s*נהגים/,
      /^מסך\s*נהגים/,
      /^ניהול\s*נהגים/,
      /^נהגים\s*$/,
    ],
    path: '/drivers',
    message: '👤 **רשימת נהגים** — מעביר אותך לעמוד ניהול הנהגים.',
    buttonLabel: 'עבור לרשימת נהגים',
  },
  {
    patterns: [
      /^התראות\s*חריגה/,
      /^התראות\s*$/,
      /^חריגות\s*$/,
      /^מרכז\s*ציות\s*$/,
      /^עמוד\s*התראות/,
      /^תקינות\s*$/,
    ],
    path: '/compliance',
    message: '⚠️ **התראות חריגה** — מעביר אותך למרכז הציות והתראות.',
    buttonLabel: 'עבור להתראות חריגה',
  },
  {
    patterns: [
      /^מרכז\s*ציות\s*אדמין/,
      /^אדמין\s*ציות/,
      /^ניהול\s*ציות/,
    ],
    path: '/admin/compliance',
    message: '📋 **מרכז ציות (אדמין)** — מעביר אותך למסך ניהול הציות.',
    buttonLabel: 'עבור למרכז ציות',
  },
  {
    patterns: [
      /^דוחות\s*$/,
      /^הפקת\s*דוחות/,
      /^עמוד\s*דוחות/,
      /^מסך\s*דוחות/,
    ],
    path: '/reports',
    message: '📊 **הפקת דוחות** — מעביר אותך למסך הדוחות.',
    buttonLabel: 'עבור לדוחות',
  },
  {
    patterns: [
      /^דוח\s*חנייה/,
      /^דוחות\s*חנייה/,
      /^סריקת\s*דוחות/,
    ],
    path: '/reports/scan',
    message: '🅿️ **דוחות חנייה** — מעביר אותך למסך סריקת דוחות חנייה.',
    buttonLabel: 'עבור לדוחות חנייה',
  },
  {
    patterns: [
      /^מסירת\s*רכב/,
      /^מסירה\s*$/,
      /^העברת\s*רכב/,
      /^handover/i,
    ],
    path: '/handover/delivery',
    message: '🚚 **מסירת רכב** — מעביר אותך למסך מסירת רכב לנהג.',
    buttonLabel: 'עבור למסירת רכב',
  },
  {
    patterns: [
      /^החזרת\s*רכב/,
      /^החזרה\s*$/,
    ],
    path: '/handover/return',
    message: '↩️ **החזרת רכב** — מעביר אותך למסך החזרת רכב.',
    buttonLabel: 'עבור להחזרת רכב',
  },
  {
    patterns: [
      /^רכב\s*חלופי/,
      /^החלפת\s*רכב/,
      /^רכב\s*תחלופי/,
    ],
    path: '/handover/replacement',
    message: '🔄 **רכב חלופי** — מעביר אותך למסך רכב תחלופי.',
    buttonLabel: 'עבור לרכב חלופי',
  },
  {
    patterns: [
      /^ניהול\s*צוות/,
      /^צוות\s*$/,
      /^עמוד\s*צוות/,
      /^הזמנות\s*$/,
    ],
    path: '/team',
    message: '👥 **ניהול צוות** — מעביר אותך למסך ניהול הצוות.',
    buttonLabel: 'עבור לניהול צוות',
  },
  {
    patterns: [
      /^טפסים\s*$/,
      /^עמוד\s*טפסים/,
    ],
    path: '/forms',
    message: '📄 **טפסים** — מעביר אותך למסך הטפסים.',
    buttonLabel: 'עבור לטפסים',
  },
  {
    patterns: [
      /^דשבורד\s*$/,
      /^לוח\s*בקרה/,
      /^מסך\s*ראשי/,
      /^בית\s*$/,
      /^עמוד\s*ראשי/,
    ],
    path: '/',
    message: '🏠 **לוח הבקרה** — מעביר אותך לדשבורד הראשי.',
    buttonLabel: 'עבור לדשבורד',
  },
  {
    patterns: [
      /^הגדרות\s*$/,
      /^הגדרות\s*מנהל/,
      /^עמוד\s*הגדרות/,
    ],
    path: '/admin/settings',
    message: '⚙️ **הגדרות מנהל** — מעביר אותך למסך ההגדרות.',
    buttonLabel: 'עבור להגדרות',
  },
  {
    patterns: [
      /^תלונות\s*$/,
      /^נוהל\s*6/,
      /^procedure\s*6/i,
    ],
    path: '/procedure6-complaints',
    message: '📢 **תלונות נוהל 6** — מעביר אותך למסך התלונות.',
    buttonLabel: 'עבור לתלונות',
  },
  {
    patterns: [
      /^תחזוקה\s*$/,
      /^הוסף\s*תחזוקה/,
      /^רישום\s*תחזוקה/,
    ],
    path: '/maintenance/add',
    message: '🛠️ **תחזוקה** — מעביר אותך למסך רישום תחזוקה.',
    buttonLabel: 'עבור לתחזוקה',
  },
];

function normalizeNavInput(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

function matchNavigationShortcut(q: string): NavShortcutDef | null {
  const raw = q.trim();
  const t = normalizeNavInput(q);
  if (!t || t.length > 80) return null;

  for (const shortcut of NAV_SHORTCUTS) {
    if (shortcut.patterns.some((p) => p.test(t) || p.test(raw))) {
      return shortcut;
    }
  }
  return null;
}

function buildNavigationResult(shortcut: NavShortcutDef): FleetQueryResult {
  return {
    text: shortcut.message,
    navigateTo: shortcut.path,
    autoNavigate: true,
    action: { label: shortcut.buttonLabel, href: shortcut.path },
  };
}

function asText(text: string): FleetQueryResult {
  return { text };
}

// ─────────────────────────────────────────────
// Procedure 04-05-001 Knowledge Base
// ─────────────────────────────────────────────

const PROCEDURE_04_05_001 = [
  { id: 1,  keywords: ['בלבד','עבודה','שימוש','מוסמך'],  text: 'הרכב ישמש לצרכי עבודה בלבד, לנסיעות מוסמכות על-פי תפקיד המחזיק.' },
  { id: 2,  keywords: ['אלכוהול','סמים','תרופות','דייס'],  text: 'חל איסור מוחלט על נהיגה תחת השפעת אלכוהול, סמים או תרופות המשפיעות על הנהיגה.' },
  { id: 3,  keywords: ['עייפות','נום','עייפ'],  text: 'חל איסור על נהיגה במצב עייפות. הנהג חייב להפסיק לנסוע ולנוח.' },
  { id: 4,  keywords: ['חוקי תנועה','בטיחות','צייתת'],  text: 'הנהג חייב לציית לכל חוקי התנועה ולשמור על בטיחות הנסיעה בכל עת.' },
  { id: 5,  keywords: ['בדיקות','שמן','מים','צמיגים','תחזוקת','בדיקה'],  text: 'הנהג אחראי לבצע בדיקות שגרתיות: מפלס שמן, מים, לחץ צמיגים לפני נסיעה.' },
  { id: 6,  keywords: ['תאונה','דיווח','דיווח תאונה'],  text: 'כל תאונה — יש לדווח לממונה ולמחלקת הרכב באופן מידי, ללא דיחוי.' },
  { id: 7,  keywords: ['נזק','נזקים','דיווח נזק','רישום'],  text: `כל נזק לרכב, קטן ככל שיהיה, יש לדווח ולתעד בטרם לקיחת הרכב. השתתפות עצמית לנזק הינה ${FLEET_CONFIG.deductibleAmount} ₪.` },
  { id: 8,  keywords: ['עישון','אכילה','שתייה'],  text: 'חל איסור מוחלט על עישון, אכילה ושתייה ברכב המגורים/נוסעים.' },
  { id: 9,  keywords: ['נקיון','נקי','החזרה'],  text: 'הנהג מחויב להחזיר את הרכב נקי ומסודר, ולדאוג לניקיון שוטף.' },
  { id: 10, keywords: ['חנייה','דוח','דוחות חנייה'],  text: 'חניה תבוצע במקומות מורשים בלבד. דוחות חנייה בגין חנייה אסורה — על חשבון הנהג.' },
  { id: 11, keywords: ['כביש 6','אגרה','מנהרות','טול'],  text: 'עמלות כבישי אגרה (כביש 6, מנהרות וכד׳) — יחוייבו על חשבון הנהג, אלא אם הוסמך אחרת.' },
  { id: 12, keywords: ['אישי','שימוש פרטי','שעות'],  text: 'חל איסור להשתמש ברכב למטרות אישיות מחוץ לשעות ולמסגרת האישור שניתן.' },
  { id: 13, keywords: ['השכרה','הלוואה','צד שלישי'],  text: 'הנהג אינו רשאי להשכיר, להלווות או להעביר את הרכב לצד שלישי כלשהו.' },
  { id: 14, keywords: ['שינויים','שדרוג','תוספות'],  text: 'חל איסור מוחלט לבצע שינויים, תוספות או שדרוגים ברכב ללא אישור מחלקת הרכב.' },
  { id: 15, keywords: ['חול','גבולות','נסיעה לחול'],  text: 'נסיעה מחוץ לגבולות ישראל מחייבת אישור מפורש מראש ממנהל המחלקה.' },
  { id: 16, keywords: ['חפצי ערך','ציוד','גניבה'],  text: 'אין להשאיר חפצי ערך או ציוד ארגוני ברכב בעת חנייה. הסיכון — על הנהג.' },
  { id: 17, keywords: ['מד אמת','קילומטראז','עדכון'],  text: 'הנהג מחויב לעדכן קריאת מד-אמת בכל תחילת חודש ועם סיום נסיעה עסקית.' },
  { id: 18, keywords: ['ביטוח','רישיון','תוקף'],  text: 'הנהג אחראי לוודא שהביטוח והרישיונות בתוקף. נסיעה עם רישיון פג תוקף — אחריות הנהג.' },
  { id: 19, keywords: ['ביטוח פרטי','חיוב אישי','נזק','השתתפות עצמי'],  text: 'רכב חברה אינו מבוטח לשימוש פרטי מלא; נהיגה חריגה עלולה לגרור חיוב אישי בנזק.' },
  { id: 20, keywords: ['החזרה','מפתחות','אביזרים'],  text: 'החזרת הרכב תיעשה באותו מצב שבו התקבל, כולל מפתחות, ניירות ואביזרים.' },
  { id: 21, keywords: ['הפרה','עונשין','אחריות','משמעת'],  text: 'הפרת נוהל זה תגרור נקיטת הליכים משמעתיים וגישת אחריות אישית לנזקים.' },
];

function searchProcedure(query: string): Array<{ id: number; text: string }> {
  if (isHandoverReportQuery(query)) return [];
  const t = query.toLowerCase();
  const scored = PROCEDURE_04_05_001.map(clause => {
    const score = clause.keywords.filter(k => t.includes(k)).length;
    return { ...clause, score };
  });
  const matches = scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score);
  return matches.length ? matches.slice(0, 3) : [];
}

// ─────────────────────────────────────────────
// Enhanced Intent Detection Matrix
// ─────────────────────────────────────────────

type Intent =
  | 'vehicle_by_plate'
  | 'vehicle_driver'
  | 'vehicle_odometer'
  | 'vehicle_status'
  | 'vehicle_list'
  | 'vehicle_unassigned'
  | 'driver_by_name'
  | 'driver_license'
  | 'driver_documents'
  | 'documents_search'
  | 'stats_general'
  | 'fetch_vehicle_handovers'
  | 'create_replacement_vehicle_handover'
  | 'procedure_query'
  | 'quick_odometer_update'  // NEW: Quick action via chat
  | 'run_fleet_health_check' // Fleet health / compliance snapshot
  | 'run_comprehensive_e2e'  // Full live integration simulation
  | 'cleanup_simulation_data' // Purge persisted test entities on demand
  | 'unknown';

function extractSimulationRunToken(q: string): string | undefined {
  const m = q.match(/(?:אסימון|token|run)\s*[:=]?\s*(\d{10,})/i);
  if (m?.[1]) return m[1];
  const digits = q.match(/\b(\d{13,})\b/);
  return digits?.[1];
}

const TRANSFERS_SCREEN_ACTION: FleetQueryAction = {
  label: 'פתח מסך העברות',
  href: '/vehicles/transfers',
};

const REPLACEMENT_HANDOVER_ACTION: FleetQueryAction = {
  label: 'פתח מסך רכב חליפי',
  href: '/handover/replacement',
};

const HEBREW_MONTH_TO_NUMBER: Readonly<Record<string, number>> = {
  ינואר: 1, ינו: 1,
  פברואר: 2, פבר: 2,
  מרץ: 3, מר: 3,
  אפריל: 4, אפר: 4,
  מאי: 5,
  יוני: 6, יונ: 6,
  יולי: 7, יול: 7,
  אוגוסט: 8, אוג: 8,
  ספטמבר: 9, ספט: 9,
  אוקטובר: 10, אוק: 10,
  נובמבר: 11, נוב: 11,
  דצמבר: 12, דצמ: 12,
};

interface ParsedCalendarDate {
  day: number;
  month: number;
  year: number;
}

type HandoverDateFilter =
  | { mode: 'day'; fromIso: string; toIso: string; label: string }
  | { mode: 'since'; sinceIso: string; label: string };

function padHandoverDatePart(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHandoverDateLabel(d: ParsedCalendarDate): string {
  return `${padHandoverDatePart(d.day)}/${padHandoverDatePart(d.month)}/${d.year}`;
}

function resolveHebrewMonth(monthStr: string): number | null {
  const key = monthStr.replace(/["'׳"]/g, '').trim().toLowerCase();
  return HEBREW_MONTH_TO_NUMBER[key] ?? null;
}

function parseYearToken(y: string | undefined, defaultYear: number): number {
  if (!y) return defaultYear;
  const n = parseInt(y, 10);
  if (Number.isNaN(n)) return defaultYear;
  if (y.length === 2) return 2000 + n;
  return n;
}

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Detects D.M, DD/MM, DD.MM.YYYY, and Hebrew month phrases (e.g. ב-9 ליוני) */
function hasHandoverSpecificDatePattern(q: string): boolean {
  const t = normalizeHandoverQueryText(q);
  return (
    /\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/.test(t)
    || /\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?/.test(t)
    || /\d{1,2}\s+לחודש/i.test(t)
    || /\d{1,2}\s+(?:ל|ב)?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|ינו|פבר|אפר|יונ|יול|אוג|ספט|אוק|נוב|דצמ)/i.test(t)
    || /^(?:אתמול|היום|מחר|שלשום|מאתמול)$/i.test(t)
  );
}

/** Strip conversational prefixes from rolling handover date follow-ups */
function normalizeHandoverQueryText(q: string): string {
  return q
    .trim()
    .replace(/^ו+/, '')
    .replace(/^(?:מה|וגם)\s+לגבי\s+/i, '')
    .replace(/^(?:ועכשיו|אז)\s+/i, '')
    .trim();
}

/** Short date-only follow-up after a prior handover report (e.g. "וב 10/6", "ומה לגבי אתמול?") */
function isHandoverDateFollowUpQuery(q: string): boolean {
  const raw = q.trim();
  if (!raw || raw.length > 72) return false;

  const normalized = normalizeHandoverQueryText(raw);
  if (!normalized) return false;

  if (isAnchorRelativeHandoverFollowUp(normalized)) return true;
  if (/^(?:אתמול|היום|מחר|שלשום|מאתמול)\??$/i.test(normalized)) return true;
  if (/^(?:מה|וגם)\s+לגבי\s+(?:אתמול|היום|מחר|שלשום)/i.test(raw)) return true;
  if (/^ב[-\s]?\d{1,2}(?:[./\/]\d{1,2}|(?:\s+לחודש)?|\s+(?:ל|ב)?[א-ת])/iu.test(normalized)) return true;
  if (/^מ[-\s]?\d{1,2}[./\/]\d{1,2}/.test(normalized)) return true;

  return hasHandoverSpecificDatePattern(raw);
}

/** Shift relative to the last viewed report date (e.g. "יום לפני" after 09/06 → 08/06) */
function parseAnchorRelativeHandoverShift(q: string): number | null {
  const t = normalizeHandoverQueryText(q).toLowerCase();

  if (/יומיים\s*(?:קודם|לפני|אחורה)|שני\s*ימים\s*(?:קודם|לפני|אחורה)/.test(t)) return -2;
  if (/יום\s*(?:קודם|לפני|אחורה)|יום\s+לפני/.test(t)) return -1;
  if (/יומיים\s*(?:אחרי|קדימה|הבא)|שני\s*ימים\s*(?:אחרי|קדימה|הבא)/.test(t)) return 2;
  if (/יום\s*(?:אחרי|קדימה|הבא)|יום\s+אחרי|למחרת/.test(t)) return 1;

  return null;
}

function isAnchorRelativeHandoverFollowUp(q: string): boolean {
  return parseAnchorRelativeHandoverShift(q) != null;
}

function getLastHandoverReportAssistantMessage(history?: FleetChatTurn[]): string | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant' && isHandoverReportAssistantMessage(history[i].content)) {
      return history[i].content;
    }
  }
  return null;
}

function extractHandoverReportDateFromAssistantMessage(content: string): ParsedCalendarDate | null {
  const dateMatch = content.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dateMatch) return null;

  const day = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const year = parseInt(dateMatch[3], 10);
  if (!isValidCalendarDate(day, month, year)) return null;

  return { day, month, year };
}

function getLastHandoverReportAnchorDate(history?: FleetChatTurn[]): ParsedCalendarDate | null {
  const message = getLastHandoverReportAssistantMessage(history);
  if (!message) return null;
  return extractHandoverReportDateFromAssistantMessage(message);
}

function shiftCalendarDate(date: ParsedCalendarDate, dayOffset: number): ParsedCalendarDate {
  const shifted = new Date(date.year, date.month - 1, date.day);
  shifted.setDate(shifted.getDate() + dayOffset);
  return {
    day: shifted.getDate(),
    month: shifted.getMonth() + 1,
    year: shifted.getFullYear(),
  };
}

function buildHandoverDayFilter(date: ParsedCalendarDate): HandoverDateFilter {
  const dateLabel = formatHandoverDateLabel(date);
  const { fromIso, toIso } = utcDayWindow(date.year, date.month, date.day);
  return { mode: 'day', fromIso, toIso, label: `לתאריך ${dateLabel}` };
}

function tryExtractAnchorRelativeDateFilter(q: string, history?: FleetChatTurn[]): HandoverDateFilter | null {
  const dayOffset = parseAnchorRelativeHandoverShift(q);
  if (dayOffset == null) return null;

  const anchor = getLastHandoverReportAnchorDate(history);
  if (!anchor) return null;

  return buildHandoverDayFilter(shiftCalendarDate(anchor, dayOffset));
}

function isHandoverReportAssistantMessage(content: string): boolean {
  return /דוח\s*העברות/i.test(content) && /📊|📋/.test(content);
}

function conversationHadRecentHandoverReport(history?: FleetChatTurn[]): boolean {
  if (!history?.length) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') {
      return isHandoverReportAssistantMessage(history[i].content);
    }
  }
  return false;
}

function parseSpecificCalendarDate(q: string, defaultYear = new Date().getFullYear()): ParsedCalendarDate | null {
  const text = normalizeHandoverQueryText(q);

  const monthOnlyMatch = text.match(/(?:ב[-\s]?)?(\d{1,2})\s+לחודש/i);
  if (monthOnlyMatch) {
    const day = parseInt(monthOnlyMatch[1], 10);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    if (isValidCalendarDate(day, month, year)) {
      return { day, month, year };
    }
  }

  const hebrewMatch = text.match(
    /(?:ב[-\s]?|לתאריך\s+)?(\d{1,2})\s+(?:ל|ב)?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|ינו|פבר|מר|אפר|יונ|יול|אוג|ספט|אוק|נוב|דצמ)/iu,
  );
  if (hebrewMatch) {
    const day = parseInt(hebrewMatch[1], 10);
    const month = resolveHebrewMonth(hebrewMatch[2]);
    if (month && isValidCalendarDate(day, month, defaultYear)) {
      return { day, month, year: defaultYear };
    }
  }

  const dotMatch = text.match(/(?:ב[-\s]?|מ[-\s]?|לתאריך\s+)?(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10);
    const year = parseYearToken(dotMatch[3], defaultYear);
    if (isValidCalendarDate(day, month, year)) {
      return { day, month, year };
    }
  }

  const slashMatch = text.match(/(?:מ[-\s]?|ב[-\s]?|לתאריך\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10);
    const year = parseYearToken(slashMatch[3], defaultYear);
    if (isValidCalendarDate(day, month, year)) {
      return { day, month, year };
    }
  }

  return null;
}

function isHandoverSinceDateQuery(q: string): boolean {
  const text = normalizeHandoverQueryText(q);
  return /\bמ[-\s]?\d|\bמאז\s+\d|\bהעברות\s+מ[-\s]?/i.test(text)
    && !/\bב[-\s]?\d|\bב\s+\d{1,2}[./]|\bב\s+\d{1,2}\s+(?:ל|ב)?[א-ת]/iu.test(text);
}

function utcDayWindow(year: number, month: number, day: number): { fromIso: string; toIso: string } {
  const from = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** Vehicle handover / transfer reports — must win over procedure_query (דוח → סעיף 10 חנייה) */
export function isHandoverReportQuery(q: string, conversationHistory?: FleetChatTurn[]): boolean {
  if (/דוח\s*העברות|פירוט\s*העברות|העברות\s*מהשבוע|העברות\s*בשבוע|העברות\s*רכב|דוח\s*מסירות|מסירות\s*והחזרות|היסטוריית\s*העברות|רשימת\s*העברות|תפיקי.*דוח.*העברות|תפיק.*דוח.*העברות|הפק.*דוח.*העברות|דוח.*העברות|העברות.*דוח|העברות.*מהשבוע|העברות.*האחרון/i.test(q)) {
    return true;
  }
  if (/היו\s+העברות|היו\s+מסירות|היו\s+החזרות/i.test(q) && hasHandoverSpecificDatePattern(q)) {
    return true;
  }
  if (/העברות|מסירות|החזרות|מסירה|החזרה/i.test(q) && hasHandoverSpecificDatePattern(q)) {
    return true;
  }
  if (isHandoverDateFollowUpQuery(q) && conversationHadRecentHandoverReport(conversationHistory)) {
    return true;
  }
  return false;
}

/** Resolves relative or calendar handover date filters */
function extractHandoverDateFilter(q: string, conversationHistory?: FleetChatTurn[]): HandoverDateFilter {
  const anchorRelative = tryExtractAnchorRelativeDateFilter(q, conversationHistory);
  if (anchorRelative) return anchorRelative;

  const text = normalizeHandoverQueryText(q);
  const specific = parseSpecificCalendarDate(q);
  if (specific) {
    const dateLabel = formatHandoverDateLabel(specific);
    if (isHandoverSinceDateQuery(q)) {
      const { fromIso } = utcDayWindow(specific.year, specific.month, specific.day);
      return { mode: 'since', sinceIso: fromIso, label: `מ-${dateLabel}` };
    }
    return buildHandoverDayFilter(specific);
  }

  const t = text.toLowerCase();
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  if (/מחר/.test(t)) {
    since.setDate(since.getDate() + 1);
    const { fromIso, toIso } = utcDayWindow(since.getFullYear(), since.getMonth() + 1, since.getDate());
    return { mode: 'day', fromIso, toIso, label: 'מחר' };
  }
  if (/שלשום/.test(t)) {
    since.setDate(since.getDate() - 2);
    const { fromIso, toIso } = utcDayWindow(since.getFullYear(), since.getMonth() + 1, since.getDate());
    return { mode: 'day', fromIso, toIso, label: 'שלשום' };
  }
  if (/אתמול|מאתמול/.test(t)) {
    since.setDate(since.getDate() - 1);
    const { fromIso, toIso } = utcDayWindow(since.getFullYear(), since.getMonth() + 1, since.getDate());
    return { mode: 'day', fromIso, toIso, label: 'אתמול' };
  }
  if (/היום|מהיום/.test(t)) {
    const { fromIso, toIso } = utcDayWindow(since.getFullYear(), since.getMonth() + 1, since.getDate());
    return { mode: 'day', fromIso, toIso, label: 'היום' };
  }
  if (/חודש\s*אחרון|30\s*יום|שלושים\s*יום/.test(t)) {
    since.setDate(since.getDate() - 30);
    return { mode: 'since', sinceIso: since.toISOString(), label: '30 ימים אחרונים' };
  }
  if (/מהשבוע\s*האחרון|בשבוע\s*האחרון|שבוע\s*אחרון|7\s*ימים|שבעה\s*יום|השבוע\s*האחרון/.test(t)) {
    since.setDate(since.getDate() - 7);
    return { mode: 'since', sinceIso: since.toISOString(), label: '7 ימים אחרונים' };
  }
  if (/שבועיים|14\s*יום|שתי\s*שבועות/.test(t)) {
    since.setDate(since.getDate() - 14);
    return { mode: 'since', sinceIso: since.toISOString(), label: '14 ימים אחרונים' };
  }

  since.setDate(since.getDate() - 7);
  return { mode: 'since', sinceIso: since.toISOString(), label: '7 ימים אחרונים' };
}

function handoverTypeLabel(type: string | null | undefined): string {
  if (type === 'delivery') return '🚚 מסירה';
  if (type === 'return') return '↩️ החזרה';
  return type ?? '—';
}

function describeHandoverPeriodFromQuery(q: string, conversationHistory?: FleetChatTurn[]): string {
  return extractHandoverDateFilter(q, conversationHistory).label;
}

function formatHandoverReportTitle(periodLabel: string): string {
  if (periodLabel.startsWith('לתאריך')) {
    return `📊 **דוח העברות ${periodLabel}**:`;
  }
  if (periodLabel.startsWith('מ-')) {
    return `📊 **דוח העברות (${periodLabel})**:`;
  }
  return `📊 **דוח העברות** (${periodLabel}):`;
}

function formatHandoverTableTitle(periodLabel: string): string {
  if (periodLabel.startsWith('לתאריך')) {
    return `📋 **דוח העברות ${periodLabel}**`;
  }
  return `📋 **דוח העברות רכב** (${periodLabel})`;
}

function detectIntent(q: string, conversationHistory?: FleetChatTurn[]): Intent {
  const t = q.toLowerCase();

  // 1. High-priority Automation & Testing Commands
  if (/נא למחוק נתוני בדיקה|הסר נתוני בדיקה|מחק נתוני בדיקה|מחק בדיקה|נקה נתוני סימולציה|נקה בדיקת מערכת/i.test(q)) {
    return 'cleanup_simulation_data';
  }
  if (/בדיקה מקיפה|סימולציה מלאה|תריץ סימולציה מלאה|בדיקת\s*e2e|e2e\s*מלא/i.test(t)) {
    return 'run_comprehensive_e2e';
  }
  if (/צק אפ|צ׳ק אפ|תקינות|בדיק.*צי|תריץ בדיקה/.test(t)) return 'run_fleet_health_check';
  // Data-entry odometer update (plate + numeric value) — not a navigation shortcut
  if (/(עדכן|רשום|עדכון)/.test(t) && /(קמ|קילומטראז|מד.?אמת)/.test(t) && extractOdometerValue(q) != null) {
    return 'quick_odometer_update';
  }

  // Replacement vehicle delivery — must run before generic handover report queries
  if (isReplacementHandoverCommand(q)) return 'create_replacement_vehicle_handover';

  // Vehicle handover / transfer data reports (before procedure_query — avoids דוח→חנייה)
  if (isHandoverReportQuery(q, conversationHistory)) return 'fetch_vehicle_handovers';

  // 2. Standard Informational Intents
  if (/נוהל|04-05|04.05|הליך|חוק.*רכב|תנאי.*שימוש|השתתפות עצמית|נזק.*אשמ|אשמ.*נהג|קנס|אחריות.*נהג|חובות.*נהג|מותר|אסור|רשאי|כביש 6|אגרה|ביטוח פרטי|מחוץ לגבולות|חול|נסיעה.*אישי|שימוש אישי|ניקיון|מד.?אמת.*חודש|תאונה.*דיווח/.test(t)
    || (/(^|\s)דוח($|\s)/.test(t) && !/העברות|מסירה|החזרה/.test(t))) {
    return 'procedure_query';
  }
  if (/מסמך|קובץ|pdf|רישיון.*נהג|תיק\s*נהג/.test(t)) return 'driver_documents';
  if (/חפש|מסמכים|כל\s*הקבצים/.test(t)) return 'documents_search';
  if (/כמה\s*קיל|מד.?(אמת|מרחק|קיל)|odo/.test(t)) return 'vehicle_odometer';
  if (/מי.*(נהג|אחראי|מחזיק).*רכב/.test(t)) return 'vehicle_driver';
  if (/סטטוס|מצב|תקין|תוקף.*רכב/.test(t)) return 'vehicle_status';
  if (/ללא\s*נהג|אין\s*נהג|לא\s*משויך|פנוי\b|פנויים|ללא\s*שיוך|חופשי|חופשיים|ריק.*רכב|רכב.*ריק|מי\s*חופשי|מי\s*פנוי/.test(t)) return 'vehicle_unassigned';
  if (/רשימ|כמה\s*רכב|כל\s*הרכב/.test(t)) return 'vehicle_list';
  // Procedure 6 complaint stats (before generic "כמה")
  if (/תלונ|נוהל\s*6/.test(t) && /כמה|שבוע|פתוח|התקבל|סטטיסטיק|מצב/.test(t)) return 'stats_general';
  if (/כמה|סה"כ|סטטיסטיק|כללי|מצב\s*הצי/.test(t)) return 'stats_general';
  if (/רכב.*\d{4,}|\d{4,}.*רכב|לוחית|לוח\s*רישוי/.test(t)) return 'vehicle_by_plate';
  if (/נהג|נהגת|שם.*נהג/.test(t) && !/רכב/.test(t)) return 'driver_by_name';
  if (/רישיון.*נהיגה|תוקף.*רישיון/.test(t)) return 'driver_license';

  return 'unknown';
}

// ─────────────────────────────────────────────
// Resolvers & Automation Actions
// ─────────────────────────────────────────────

async function resolveVehicleByPlate(plate: string): Promise<string> {
  const { data } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, year, current_odometer, status, test_expiry, insurance_expiry, assigned_driver_id')
    .ilike('plate_number', `%${plate}%`)
    .limit(3);

  if (!data?.length) return `לא מצאתי רכב עם לוחית "${plate}". נסה לבדוק את המספר שוב.`;

  const lines = await Promise.all(data.map(async (v) => {
    let driverName = '';
    if (v.assigned_driver_id) {
      const { data: d } = await supabase.from('drivers').select('full_name').eq('id', v.assigned_driver_id).single();
      if (d) driverName = ` · נהג: ${d.full_name}`;
    }
    return `🚗 **${v.manufacturer} ${v.model} ${v.year}** (${v.plate_number})
  מצב: ${statusLabel(v.status)} · מד-אמת: ${km(v.current_odometer)}
  טסט: ${fmt(v.test_expiry)} · ביטוח: ${fmt(v.insurance_expiry)}${driverName}`;
  }));

  return lines.join('\n\n');
}

async function resolveVehicleDriver(plate: string | null, rawQ: string): Promise<string> {
  if (!plate) return 'לא הצלחתי לזהות את מספר הרכב בשאלה. אנא ציין את לוחית הרישוי.';

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, assigned_driver_id')
    .ilike('plate_number', `%${plate}%`)
    .limit(1);

  const v = vehicles?.[0];
  if (!v) return `לא מצאתי רכב עם לוחית "${plate}".`;
  if (!v.assigned_driver_id) return `לרכב ${v.manufacturer} ${v.model} (${v.plate_number}) אין נהג משויך כרגע.`;

  const { data: driver } = await supabase
    .from('drivers')
    .select('full_name, phone, department, job_title, license_expiry')
    .eq('id', v.assigned_driver_id)
    .single();

  if (!driver) return `הרכב משויך לנהג אך לא נמצאו פרטיו.`;

  return `👤 נהג הרכב ${v.manufacturer} ${v.model} (${v.plate_number}):
  שם: **${driver.full_name}**
  ${driver.phone ? `טלפון: ${driver.phone}` : ''}
  ${driver.department ? `מחלקה: ${driver.department}` : ''}
  ${driver.job_title ? `תפקיד: ${driver.job_title}` : ''}
  תוקף רישיון: ${fmt(driver.license_expiry)}`.replace(/\n  \n/g, '\n');
}

async function resolveVehicleOdometer(plate: string | null): Promise<string> {
  if (!plate) return 'לא הצלחתי לזהות את מספר הרכב. אנא ציין את לוחית הרישוי.';

  const { data } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, current_odometer, last_odometer_date, next_maintenance_km')
    .ilike('plate_number', `%${plate}%`)
    .limit(1);

  const v = data?.[0];
  if (!v) return `לא מצאתי רכב עם לוחית "${plate}".`;

  let tillMaint = '';
  if (v.next_maintenance_km && v.current_odometer) {
    const diff = v.next_maintenance_km - v.current_odometer;
    tillMaint = diff > 0 
      ? ` · עד טיפול הבא: ${km(diff)}` 
      : ` · ⚠️ עבר את זמן הטיפול ב-${km(Math.abs(diff))}!`;
  }

  return `📍 מד-אמת — ${v.manufacturer} ${v.model} (${v.plate_number}):
  קריאה נוכחית: **${km(v.current_odometer)}**
  עודכן לאחרונה: ${fmt(v.last_odometer_date)}${tillMaint}`;
}

async function actionQuickOdometerUpdate(plate: string | null, value: number | null): Promise<string> {
  if (!plate) return 'כדי לעדכן מד אמת, עליי לדעת מהו מספר הרכב (לוחית רישוי).';
  if (value == null || isNaN(value)) return 'לא הצלחתי להבין מהו ערך הקילומטראז\' החדש שברצונך לעדכן.';

  // Find vehicle first
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, plate_number, manufacturer, model, current_odometer')
    .ilike('plate_number', `%${plate}%`)
    .single();

  if (!vehicle) return `הרכב עם לוחית הרישוי ${plate} לא נמצא במערכת.`;
  if (vehicle.current_odometer && value < vehicle.current_odometer) {
    return `⚠️ שגיאה: הקילומטראז' שהזנת (${km(value)}) נמוך מהקיים במערכת (${km(vehicle.current_odometer)}).`;
  }

  // Perform execution update
  const { error } = await supabase
    .from('vehicles')
    .update({ 
      current_odometer: value, 
      last_odometer_date: new Date().toISOString().split('T')[0] 
    } as any)
    .eq('id', vehicle.id);

  if (error) return `נכשלה פעולת העדכון בבסיס הנתונים: ${error.message}`;

  return `✨ **הפעולה בוצעה בהצלחה!** ומד האמת של ${vehicle.manufacturer} ${vehicle.model} (${vehicle.plate_number}) עודכן ל-**${km(value)}**.`;
}

async function resolveVehicleStatus(plate: string | null): Promise<string> {
  if (!plate) return 'אנא ציין לוחית רישוי כדי לבדוק מצב רכב ספציפי.';

  const { data } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, status, test_expiry, insurance_expiry, mandatory_end_date')
    .ilike('plate_number', `%${plate}%`)
    .limit(1);

  const v = data?.[0];
  if (!v) return `לא מצאתי רכב עם לוחית "${plate}".`;

  return `📋 מצב רכב ${v.manufacturer} ${v.model} (${v.plate_number}):
  סטטוס כולל: ${statusLabel(v.status)}
  טסט: ${fmt(v.test_expiry)}
  ביטוח: ${fmt(v.insurance_expiry)}
  ${v.mandatory_end_date ? `חובה: ${fmt(v.mandatory_end_date)}` : ''}`.trimEnd();
}

async function resolveUnassignedVehicles(): Promise<string> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, year, status, assigned_driver_id, is_active')
    .order('manufacturer');

  if (error) return `שגיאה בשאילתה: ${error.message}`;

  const all = (data ?? []).filter(v => v.is_active !== false);
  const total = all.length;
  const unassigned = all.filter(v => !v.assigned_driver_id || String(v.assigned_driver_id).trim() === '');

  if (!unassigned.length) {
    return `כרגע כל ${total > 0 ? total : ''} הרכבים מאוישים — לא נמצאו רכבים ללא נהג.`;
  }

  const list = unassigned.map((v, i) => `${i + 1}. **${v.manufacturer} ${v.model}** — ${v.plate_number}`).join('\n');
  return `נמצאו **${unassigned.length}** רכבים ללא נהג משויך (מתוך ${total} פעילים):\n${list}`;
}

async function resolveVehicleList(): Promise<string> {
  const { data } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, status, is_active')
    .eq('is_active', true)
    .order('manufacturer')
    .limit(10);

  if (!data?.length) return 'לא נמצאו רכבים פעילים.';

  const { count } = await supabase.from('vehicles').select('id', { count: 'exact', head: true });
  const list = data.map(v => `• ${v.manufacturer} ${v.model} (${v.plate_number}) ${statusLabel(v.status)}`).join('\n');
  const suffix = (count ?? 0) > 10 ? `\n\n...ועוד ${(count ?? 0) - 10} רכבים. לרשימה המלאה עבור לעמוד הרכבים.` : '';
  return `🚗 רכבים פעילים (${count ?? data.length}):\n${list}${suffix}`;
}

async function resolveHealthCheckOrgId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  return profile?.org_id?.trim() || null;
}

async function resolveActiveUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Detect natural-language replacement vehicle delivery commands */
export function isReplacementHandoverCommand(q: string): boolean {
  const hasReplacement = /כרכב\s*חליפי|רכב\s*חליפי|רכב\s*חלופי|רכב\s*תחלופי|מסירת\s*רכב\s*חליפי/i.test(q);
  const hasAction = /(?:תעדכני?|תרשמי?|רשמי?|דווחי?|עדכני?|נרשם|נרשמה|קיבל|נמסר|מסר)/i.test(q);
  return hasReplacement && hasAction;
}

function extractDriverNameFromReplacementCommand(q: string): string | null {
  const patterns = [
    /(?:תעדכני?|תרשמי?|רשמי?|דווחי?|עדכני?)\s+ש([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s+קיבל/iu,
    /([א-ת]{2,}\s+[א-ת]{2,})\s+קיבל(?:\s+היום)?\s+(?:כ)?רכב\s*חליפי/iu,
    /(?:ל|את)\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s+(?:קיבל|נמסר)\s+(?:היום\s+)?(?:כ)?רכב\s*חליפי/iu,
    /(?:ש|הנהג\s+)([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s+(?:קיבל|נמסר|מסר)/iu,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return extractName(q);
}

function extractVehicleLabelFromReplacementCommand(q: string): string | null {
  const patterns = [
    /(?:כ)?רכב\s*חליפי\s+את\s+(?:ה)?([א-תa-zA-Z][א-תa-zA-Z0-9\-]*)/iu,
    /את\s+(?:ה)?([א-תa-zA-Z][א-תa-zA-Z0-9\-]+)\s*$/iu,
    /את\s+(?:ה)?([א-תa-zA-Z][א-תa-zA-Z0-9\-]+)/iu,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

function replacementVehicleSearchTerms(label: string): string[] {
  const terms = [label.trim()];
  if (/אאוטלנדר|אאוטלנד/i.test(label)) terms.push('outlander');
  if (/קורולה/i.test(label)) terms.push('corolla');
  if (/ג׳יפ|ג'יפ|jeep/i.test(label)) terms.push('jeep');
  return [...new Set(terms.filter(Boolean))];
}

async function findDriversForOrgByName(orgId: string, name: string) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('full_name', `%${name}%`)
    .limit(5);

  if (error) throw error;
  return data ?? [];
}

async function findVehiclesForOrgByLabel(orgId: string, label: string) {
  const terms = replacementVehicleSearchTerms(label);

  for (const term of terms) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, manufacturer, model, plate_number, current_odometer')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .or(`model.ilike.%${term}%,manufacturer.ilike.%${term}%`)
      .limit(5);

    if (error) throw error;
    if (data?.length) return data;
  }

  return [];
}

async function actionCreateReplacementVehicleHandover(q: string): Promise<FleetQueryResult> {
  const orgId = await resolveHealthCheckOrgId();
  if (!orgId) {
    return {
      text: 'לא ניתן לרשום מסירת רכב חליפי — לא זוהה ארגון פעיל בחשבון.',
      action: REPLACEMENT_HANDOVER_ACTION,
    };
  }

  const userId = await resolveActiveUserId();
  if (!userId) {
    return {
      text: 'לא ניתן לרשום מסירת רכב חליפי — יש להתחבר מחדש למערכת.',
      action: REPLACEMENT_HANDOVER_ACTION,
    };
  }

  const driverName = extractDriverNameFromReplacementCommand(q);
  const vehicleLabel = extractVehicleLabelFromReplacementCommand(q);

  if (!driverName) {
    return {
      text: 'לא הצלחתי לזהות את שם הנהג בפקודה. נסה למשל: "תעדכני שרועי מלאכי קיבל היום כרכב חליפי את האאוטלנדר".',
      action: REPLACEMENT_HANDOVER_ACTION,
    };
  }

  if (!vehicleLabel) {
    return {
      text: `זיהיתי את הנהג **${driverName}**, אך לא את הרכב. ציין את דגם הרכב, למשל: "...כרכב חליפי את האאוטלנדר".`,
      action: REPLACEMENT_HANDOVER_ACTION,
    };
  }

  try {
    const drivers = await findDriversForOrgByName(orgId, driverName);
    if (!drivers.length) {
      return {
        text: `לא מצאתי נהג פעיל בשם **${driverName}** בארגון שלך.`,
        action: REPLACEMENT_HANDOVER_ACTION,
      };
    }
    if (drivers.length > 1) {
      const options = drivers.map((d) => `• ${d.full_name}`).join('\n');
      return {
        text: `נמצאו מספר נהגים תואמים ל-"${driverName}". אנא פרט שם מלא:\n${options}`,
        action: REPLACEMENT_HANDOVER_ACTION,
      };
    }

    const vehicles = await findVehiclesForOrgByLabel(orgId, vehicleLabel);
    if (!vehicles.length) {
      return {
        text: `לא מצאתי רכב פעיל התואם ל-**${vehicleLabel}** בארגון שלך.`,
        action: REPLACEMENT_HANDOVER_ACTION,
      };
    }
    if (vehicles.length > 1) {
      const options = vehicles.map((v) => `• ${v.manufacturer} ${v.model} (${v.plate_number})`).join('\n');
      return {
        text: `נמצאו מספר רכבים תואמים ל-"${vehicleLabel}". אנא ציין לוחית רישוי:\n${options}`,
        action: REPLACEMENT_HANDOVER_ACTION,
      };
    }

    const driver = drivers[0];
    const vehicle = vehicles[0];
    const handoverDate = /היום|מהיום/.test(q) ? new Date() : new Date();
    const odometer = vehicle.current_odometer ?? 0;

    const { error } = await supabase.rpc('create_vehicle_handover', {
      p_org_id: orgId,
      p_vehicle_id: vehicle.id,
      p_driver_id: driver.id,
      p_handover_type: 'delivery',
      p_assignment_mode: 'replacement',
      p_handover_date: handoverDate.toISOString(),
      p_odometer_reading: odometer,
      p_fuel_level: '4',
      p_photo_front_url: null,
      p_photo_back_url: null,
      p_photo_right_url: null,
      p_photo_left_url: null,
      p_signature_url: null,
      p_notes: 'מסירת רכב חליפי — נרשם דרך Fleet AI',
      p_created_by: userId,
    });

    if (error) {
      console.error('[aiQueryEngine] replacement handover RPC failed:', error);
      return {
        text: `לא ניתן לרשום מסירת רכב חליפי: ${formatSupabaseError(error)}`,
        action: REPLACEMENT_HANDOVER_ACTION,
      };
    }

    const vehicleLabelFull = `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim();
    const dateLabel = handoverDate.toLocaleDateString('he-IL');

    return {
      text: `✅ **מסירת רכב חליפי נרשמה בהצלחה!**

ביום **${dateLabel}** נרשם ש**${driver.full_name}** קיבל כרכב חליפי:
🚗 **${vehicleLabelFull}** (${vehicle.plate_number})

הרשומה נשמרה כ**מסירת רכב חליפי** ותשתקף בכרטיס **רכב חליפי** בלוח הבקרה.`,
      action: REPLACEMENT_HANDOVER_ACTION,
    };
  } catch (err) {
    console.error('[aiQueryEngine] replacement handover unexpected error:', err);
    return {
      text: `שגיאה ברישום מסירת רכב חליפי: ${formatSupabaseError(err)}`,
      action: REPLACEMENT_HANDOVER_ACTION,
    };
  }
}

async function actionRunFleetHealthCheck(): Promise<string> {
  const orgId = await resolveHealthCheckOrgId();
  if (!orgId) {
    return 'לא ניתן להריץ בדיקת תקינות — לא זוהה ארגון פעיל בחשבון. התחבר מחדש או פנה למנהל המערכת.';
  }

  const alerts = await fetchComplianceAlerts({ effectiveOrgId: orgId });
  /** תואם Dashboard.tsx — כרטיס «התראות חריגה» סופר רק expired */
  const expiredAlerts = alerts.filter((a) => a.status === 'expired');
  const issueCount = expiredAlerts.length;

  const [{ count: vehicleCount }, { count: driverCount }] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
  ]);

  if (issueCount === 0) {
    return `✨ **בדיקת תקינות הצי הושלמה בהצלחה!**\nלא נמצאו התראות חריגה (פג תוקף) ב-${vehicleCount ?? 0} רכבים ו-${driverCount ?? 0} נהגים פעילים — תואם לכרטיס **התראות חריגה** בדשבורד (0).`;
  }

  const issues = expiredAlerts.map(formatComplianceAlertForBot);

  return `🩺 **דוח צ'ק-אפ אוטומטי לצי (${FLEET_CONFIG.companyName}):**\nנמצאו **${issueCount}** התראות חריגה (פג תוקף) — תואם לכרטיס **התראות חריגה** בדשבורד:\n\n${issues.map(line => `• ${line}`).join('\n')}\n\nלמידע מפורט וטיפול בליקויים, מומלץ לעבור למסך התראות חריגה במערכת.`;
}

async function resolveDriverByName(name: string | null, rawQ: string): Promise<string> {
  const search = name ?? rawQ.replace(/^.*?(שם|נהג|של|עבור)\s*/u, '').slice(0, 30);
  if (!search) return 'אנא ציין שם נהג לחיפוש.';

  const { data } = await supabase
    .from('drivers')
    .select('full_name, phone, email, department, job_title, license_expiry, status, is_active')
    .ilike('full_name', `%${search}%`)
    .eq('is_active', true)
    .limit(5);

  if (!data?.length) return `לא מצאתי נהג בשם "${search}". נסה חיפוש חלקי (שם פרטי בלבד או משפחה בלבד).`;

  const lines = data.map(d =>
    `👤 **${d.full_name}**
  ${d.phone ? `טלפון: ${d.phone}` : ''} ${d.email ? `| מייל: ${d.email}` : ''}
  ${d.department ? `מחלקה: ${d.department}` : ''} ${d.job_title ? `| תפקיד: ${d.job_title}` : ''}
  תוקף רישיון: ${fmt(d.license_expiry)} · מצב: ${statusLabel(d.status)}`.replace(/\n  \n/, '\n')
  );

  return lines.join('\n\n');
}

async function resolveDriverLicense(name: string | null): Promise<string> {
  if (!name) return 'אנא ציין שם נהג לבדיקת הרישיון.';

  const { data } = await supabase
    .from('drivers')
    .select('full_name, license_number, license_expiry, license_front_url, license_back_url, status')
    .ilike('full_name', `%${name}%`)
    .limit(3);

  if (!data?.length) return `לא מצאתי נהג בשם "${name}".`;

  const lines = data.map(d => {
    const frontLink = formatFileLink(d.license_front_url, 'צד קדמי');
    const backLink  = formatFileLink(d.license_back_url,  'צד אחורי');
    return `📄 רישיון **${d.full_name}**:
  מספר: ${d.license_number ?? 'לא ידוע'}
  תוקף: ${fmt(d.license_expiry)} · ${statusLabel(d.status)}
  תמונות: ${frontLink}  ${backLink}`;
  });
  return lines.join('\n\n');
}

async function resolveDriverDocuments(name: string | null, rawQ: string): Promise<string> {
  const search = name ?? rawQ.slice(0, 40);

  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name')
    .ilike('full_name', `%${search}%`)
    .limit(1);

  const driver = drivers?.[0];
  if (!driver) return `לא מצאתי נהג שתואם "${search}". אנא ציין שם מדויק יותר.`;

  const { data: docs } = await supabase
    .from('driver_documents')
    .select('title, file_url, created_at')
    .eq('driver_id', driver.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!docs?.length) return `לא נמצאו מסמכים עבור ${driver.full_name}.`;

  const list = docs.map((d, i) => {
    const link = formatFileLink(d.file_url, d.title ?? 'פתח מסמך');
    return `${i + 1}. **${d.title ?? 'ללא שם'}** (${fmt(d.created_at)}) — ${link}`;
  }).join('\n');

  return `📁 מסמכים של **${driver.full_name}** (${docs.length}):\n${list}`;
}

async function resolveDocumentsSearch(rawQ: string): Promise<string> {
  const { data: docs } = await supabase
    .from('driver_documents')
    .select('title, file_url, created_at, driver_id')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!docs?.length) return 'לא נמצאו מסמכים בתיקי הנהגים.';

  const ids = [...new Set(docs.map(d => d.driver_id).filter(Boolean))];
  const { data: driversData } = await supabase
    .from('drivers')
    .select('id, full_name')
    .in('id', ids);
  
  const nameMap: Record<string, string> = {};
  driversData?.forEach(d => { nameMap[d.id] = d.full_name; });

  const list = docs.map((d, i) => {
    const link = formatFileLink(d.file_url, 'פתח מסמך');
    return `${i + 1}. **${d.title ?? 'ללא שם'}** — ${nameMap[d.driver_id] ?? 'נהג לא ידוע'} (${fmt(d.created_at)}) — ${link}`;
  }).join('\n');

  return `📂 מסמכים אחרונים (${docs.length}):\n${list}\n\nלתיק מלא — [עבור לדף הנהגים](${FLEET_CONFIG.driversPagePath}).`;
}

async function resolveGeneralStats(): Promise<string> {
  const orgId = await resolveHealthCheckOrgId();
  if (!orgId) {
    return 'לא הצלחתי לזהות את הארגון הפעיל — התחבר מחדש ונסה שוב.';
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const openStatuses = ['open', 'pending', 'in_progress'] as const;

  const [
    { count: vTotal },
    { count: vWarning },
    { count: dTotal },
    { count: dWarning },
    { count: docsTotal },
    { count: complaintsOpen },
    { count: complaintsWeek },
  ] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['warning', 'expired']),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['warning', 'expired']),
    supabase.from('driver_documents').select('id', { count: 'exact', head: true }),
    supabase
      .from('procedure6_complaints')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', [...openStatuses]),
    supabase
      .from('procedure6_complaints')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', weekAgoIso),
  ]);

  const weekN = complaintsWeek ?? 0;
  const openN = complaintsOpen ?? 0;

  return `📊 **סטטיסטיקות כלליות — Fleet Manager 2026**:
🚗 רכבים פעילים: **${vTotal ?? '?'}** ${(vWarning ?? 0) > 0 ? `(⚠️ ${vWarning} דורשים טיפול)` : '(הכל תקין)'}
👤 נהגים פעילים: **${dTotal ?? '?'}** ${(dWarning ?? 0) > 0 ? `(⚠️ ${dWarning} דורשים בדיקה)` : '(הכל תקין)'}
📁 מסמכים שמורים: **${docsTotal ?? '?'}**
📢 תלונות נוהל 6 השבוע: **${weekN}** (**${openN}** פתוחות בטיפול)`;
}

type HandoverReportRow = {
  id: string;
  handover_type: string;
  handover_date: string;
  odometer_reading: number | null;
  driver: { full_name: string | null } | null;
  vehicle: { manufacturer: string | null; model: string | null; plate_number: string | null } | null;
};

const HANDOVER_REPORT_SELECT =
  'id, handover_type, handover_date, odometer_reading, driver:drivers(full_name), vehicle:vehicles(manufacturer, model, plate_number)';

async function fetchHandoverRowsForOrg(
  orgId: string,
  filter: HandoverDateFilter,
): Promise<{ rows: HandoverReportRow[]; error: unknown | null }> {
  const baseQuery = () => {
    let query = supabase
      .from('vehicle_handovers')
      .select(HANDOVER_REPORT_SELECT)
      .order('handover_date', { ascending: false })
      .limit(50);

    if (filter.mode === 'day') {
      query = query.gte('handover_date', filter.fromIso).lte('handover_date', filter.toIso);
    } else {
      query = query.gte('handover_date', filter.sinceIso);
    }
    return query;
  };

  let { data, error } = await baseQuery().eq('org_id', orgId);

  if (error && isMissingSchemaObjectError(error)) {
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id')
      .eq('org_id', orgId);

    if (vehiclesError) {
      return { rows: [], error: vehiclesError };
    }

    const vehicleIds = (vehicles ?? []).map((v) => v.id).filter(Boolean);
    if (!vehicleIds.length) {
      return { rows: [], error: null };
    }

    ({ data, error } = await baseQuery().in('vehicle_id', vehicleIds));
  }

  if (error) {
    return { rows: [], error };
  }

  return { rows: (data ?? []) as HandoverReportRow[], error: null };
}

function buildEmptyHandoverReportResult(periodLabel: string): FleetQueryResult {
  const title = formatHandoverReportTitle(periodLabel);
  const dayHint = periodLabel.startsWith('לתאריך') ? ' בתאריך זה' : '';
  const weekHint = periodLabel.includes('7') ? ' בשבוע האחרון' : '';
  const emptyHint = dayHint || weekHint;
  return {
    text: `${title} לא נמצאו תנועות או העברות רכב${emptyHint}. הצי יציב!

לצפייה במסך ההעברות לחץ על הכפתור למטה.`,
    action: TRANSFERS_SCREEN_ACTION,
  };
}

function buildHandoverReportTableResult(rows: HandoverReportRow[], periodLabel: string): FleetQueryResult {
  const deliveryCount = rows.filter((r) => r.handover_type === 'delivery').length;
  const returnCount = rows.filter((r) => r.handover_type === 'return').length;

  const tableHeader = '| תאריך | שעה | סוג | רכב | נהג | ק״מ |\n| --- | --- | --- | --- | --- | ---: |';

  const tableRows = rows.map((row) => {
    const dt = new Date(row.handover_date);
    const dateCol = dt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeCol = dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const vehicle = row.vehicle
      ? `${row.vehicle.manufacturer ?? ''} ${row.vehicle.model ?? ''} (${row.vehicle.plate_number ?? '—'})`.trim()
      : '—';
    const driver = row.driver?.full_name ?? 'ללא נהג';
    const kmVal = row.odometer_reading != null ? row.odometer_reading.toLocaleString('he-IL') : '—';
    return `| ${dateCol} | ${timeCol} | ${handoverTypeLabel(row.handover_type)} | ${vehicle} | ${driver} | ${kmVal} |`;
  });

  return {
    text: `${formatHandoverTableTitle(periodLabel)}

**סה״כ:** ${rows.length} העברות · ${deliveryCount} מסירות · ${returnCount} החזרות

${tableHeader}
${tableRows.join('\n')}

_מוצגות עד 50 העברות אחרונות בתקופה. לפירוט מלא במערכת:_`,
    action: TRANSFERS_SCREEN_ACTION,
  };
}

async function resolveVehicleHandoversReport(
  q: string,
  conversationHistory?: FleetChatTurn[],
): Promise<FleetQueryResult> {
  const dateFilter = extractHandoverDateFilter(q, conversationHistory);
  const periodLabel = dateFilter.label;

  try {
    const orgId = await resolveHealthCheckOrgId();
    if (!orgId) {
      return {
        text: 'לא ניתן להפיק דוח העברות — לא זוהה ארגון פעיל בחשבון.',
        action: TRANSFERS_SCREEN_ACTION,
      };
    }

    const { rows, error } = await fetchHandoverRowsForOrg(orgId, dateFilter);

    if (error) {
      console.error('[aiQueryEngine] handover report query failed:', error);
      return {
        text: `${formatHandoverReportTitle(periodLabel)} לא ניתן לשלוף נתונים כרגע. ניתן לצפות בהעברות במסך הייעודי.`,
        action: TRANSFERS_SCREEN_ACTION,
      };
    }

    if (!rows.length) {
      return buildEmptyHandoverReportResult(periodLabel);
    }

    return buildHandoverReportTableResult(rows, periodLabel);
  } catch (err) {
    console.error('[aiQueryEngine] handover report unexpected error:', err);
    return {
      text: `${formatHandoverReportTitle(periodLabel)} לא נמצאו תנועות או העברות רכב. הצי יציב!

לצפייה במסך ההעברות לחץ על הכפתור למטה.`,
      action: TRANSFERS_SCREEN_ACTION,
    };
  }
}

function resolveProcedureQuery(q: string): string {
  const matches = searchProcedure(q);

  if (!matches.length) {
    return `נוהל **04-05-001 — שימוש ברכב חברה** כולל 21 סעיפים. נקודות מרכזיות:
• **סעיף 10** — דוחות חנייה אסורה על חשבון הנהג
• **סעיף 11** — כביש 6 / אגרות על חשבון הנהג
• **סעיף 19** — השתתפות עצמית בנזק משימוש חריג היא עד ${FLEET_CONFIG.deductibleAmount} ₪.
• **סעיף 6** — כל תאונה חייבת דיווח מידי
• **סעיף 21** — הפרת נוהל גוררת אחריות אישית

שאל שאלה מפורטת ואצטט את הסעיף הרלוונטי.`;
  }

  const cited = matches
    .map(c => `> סעיף **${c.id}** בנוהל 04-05-001:
> _“${c.text}”_`)
    .join('\n\n');

  return `לפי נוהל **04-05-001 — שימוש ברכב חברה**:\n\n${cited}`;
}

export async function processHandoverReportQuery(
  q: string,
  conversationHistory?: FleetChatTurn[],
): Promise<FleetQueryResult> {
  return resolveVehicleHandoversReport(q, conversationHistory);
}

// ─────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────

export async function processFleetQuery(
  question: string,
  context?: AIChatContext,
  conversationHistory?: FleetChatTurn[],
): Promise<FleetQueryResult> {
  const q = question.trim();

  // Replacement vehicle delivery — before read-only handover reports
  if (isReplacementHandoverCommand(q)) {
    return actionCreateReplacementVehicleHandover(q);
  }

  // Highest priority: data reports for vehicle handovers (never nav shortcut / unknown fallback)
  if (isHandoverReportQuery(q, conversationHistory)) {
    return resolveVehicleHandoversReport(q, conversationHistory);
  }

  const nav    = matchNavigationShortcut(q);
  if (nav) return buildNavigationResult(nav);

  const intent = detectIntent(q, conversationHistory);
  
  // Dynamic screen contextual tracking
  const plate  = extractPlate(q) ?? (context?.vehicleId ? extractPlate(context.vehicleLabel ?? '') ?? context.vehicleId : undefined);
  const name   = extractName(q) ?? context?.driverName ?? null;

  try {
    switch (intent) {
      case 'run_comprehensive_e2e': return asText(await actionRunComprehensiveE2ETest());
      case 'cleanup_simulation_data': {
        const runToken = extractSimulationRunToken(q);
        return asText(await actionDeleteTestSimulationData(runToken));
      }
      case 'run_fleet_health_check': return asText(await actionRunFleetHealthCheck());
      case 'quick_odometer_update': {
        const value = extractOdometerValue(q);
        return asText(await actionQuickOdometerUpdate(plate ?? '', value));
      }
      case 'vehicle_by_plate':   return asText(await resolveVehicleByPlate(plate ?? q));
      case 'vehicle_driver':    return asText(await resolveVehicleDriver(plate, q));
      case 'vehicle_odometer':  return asText(await resolveVehicleOdometer(plate));
      case 'vehicle_status':    return asText(await resolveVehicleStatus(plate));
      case 'vehicle_unassigned': return asText(await resolveUnassignedVehicles());
      case 'vehicle_list':      return asText(await resolveVehicleList());
      case 'driver_by_name':    return asText(await resolveDriverByName(name, q));
      case 'driver_license':    return asText(await resolveDriverLicense(name));
      case 'driver_documents':  return asText(await resolveDriverDocuments(name, q));
      case 'documents_search':  return asText(await resolveDocumentsSearch(q));
      case 'stats_general':     return asText(await resolveGeneralStats());
      case 'fetch_vehicle_handovers': return await resolveVehicleHandoversReport(q, conversationHistory);
      case 'create_replacement_vehicle_handover': return await actionCreateReplacementVehicleHandover(q);
      case 'procedure_query':   return asText(resolveProcedureQuery(q));

      default: {
        // Fallback: navigation retry for partial phrases, then entity lookup
        const navFallback = matchNavigationShortcut(q);
        if (navFallback) return buildNavigationResult(navFallback);

        if (extractPlate(q))            return asText(await resolveVehicleByPlate(extractPlate(q)!));
        if (extractName(q))             return asText(await resolveDriverByName(extractName(q), q));
        return asText(`לא הצלחתי להבין את השאלה. ניתן לבקש למשל:
• "עדכון ק״מ" או "דיווח קילומטראז׳" (מעבר מהיר למסך)
• "תריץ בדיקת תקינות לצי" (צ'ק אפ מקיף 🩺)
• "התראות חריגה" / "רשימת רכבים" / "ניהול צוות"
• "עדכן קילומטראז' לרכב 123-45-678 ל-145000"
• "מי הנהג של רכב 123-45-678?"
• "כמה נהגים יש בצי?"
• "כמה תלונות התקבלו השבוע?"`);
      }
    }
  } catch (err) {
    console.error('[aiQueryEngine] error:', err);
    return asText('שגיאה בשליפת הנתונים. בדוק חיבור לרשת ונסה שנית.');
  }
}
