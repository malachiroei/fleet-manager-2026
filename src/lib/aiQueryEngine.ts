/**
 * Fleet AI Query Engine
 * ───────────────────────────────────────────────────────────────────────────
 * Parses Hebrew natural-language questions, queries Supabase directly,
 * and returns formatted Hebrew answers.
 *
 * No external AI API required — all logic runs client-side against Supabase.
 */

import { supabase } from '@/integrations/supabase/client';
import type { AIChatContext } from '@/components/AIChatAssistant';

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

// ─────────────────────────────────────────────
// Intent detection
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Procedure 04-05-001 Knowledge Base
// All 21 clauses embedded to enable offline citation
// ─────────────────────────────────────────────

const PROCEDURE_04_05_001 = [
  { id: 1,  keywords: ['בלבד','עבודה','שימוש','מוסמך'],  text: 'הרכב ישמש לצרכי עבודה בלבד, לנסיעות מוסמכות על-פי תפקיד המחזיק.' },
  { id: 2,  keywords: ['אלכוהול','סמים','תרופות','דייס'],  text: 'חל איסור מוחלט על נהיגה תחת השפעת אלכוהול, סמים או תרופות המשפיעות על הנהיגה.' },
  { id: 3,  keywords: ['עייפות','נום','עייפ'],  text: 'חל איסור על נהיגה במצב עייפות. הנהג חייב להפסיק לנסוע ולנוח.' },
  { id: 4,  keywords: ['חוקי תנועה','בטיחות','צייתת'],  text: 'הנהג חייב לציית לכל חוקי התנועה ולשמור על בטיחות הנסיעה בכל עת.' },
  { id: 5,  keywords: ['בדיקות','שמן','מים','צמיגים','תחזוקת','בדיקה'],  text: 'הנהג אחראי לבצע בדיקות שגרתיות: מפלס שמן, מים, לחץ צמיגים לפני נסיעה.' },
  { id: 6,  keywords: ['תאונה','דיווח','דיווח תאונה'],  text: 'כל תאונה — יש לדווח לממונה ולמחלקת הרכב באופן מידי, ללא דיחוי.' },
  { id: 7,  keywords: ['נזק','נזקים','דיווח נזק','רישום'],  text: 'כל נזק לרכב, יהיה קטן ככל שיהיה, יש לדווח ולתעד בטרם לקיחת הרכב.' },
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
  { id: 20, keywords: ['החזרה','מפתחות','אביזרים'],  text: 'החזרת הרכב תיעשה באותו מצב שכי החרגה הוחזר, כולל מפתחות, ניירות ואביזרים.' },
  { id: 21, keywords: ['הפרה','עונשין','אחריות','משמעת'],  text: 'הפרת נוהל זה תגרור נקיטת הליכים משמעתיים וגישת אחריות אישית לנזקים.' },
];

/** Find the most relevant clause(s) for a question */
function searchProcedure(query: string): Array<{ id: number; text: string }> {
  const t = query.toLowerCase();
  const scored = PROCEDURE_04_05_001.map(clause => {
    const score = clause.keywords.filter(k => t.includes(k)).length;
    return { ...clause, score };
  });
  const matches = scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score);
  return matches.length ? matches.slice(0, 3) : [];
}

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
  | 'procedure_query'
  | 'unknown';

function detectIntent(q: string): Intent {
  const t = q.toLowerCase();
  // Procedure / policy questions — must check before generic document checks
  if (/נוהל|04-05|04.05|הליך|חוק.*רכב|תנאי.*שימוש|השתתפות עצמית|נזק.*אשמ|אשמ.*נהג|קנס|דוח|אחריות.*נהג|חובות.*נהג|מותר|אסור|רשאי|כביש 6|אגרה|ביטוח פרטי|מחוץ לגבולות|חול|נסיעה.*אישי|שימוש אישי|ניקיון|מד.?אמת.*חודש|תאונה.*דיווח/.test(t)) return 'procedure_query';
  if (/מסמך|קובץ|pdf|רישיון.*נהג|תיק\s*נהג/.test(t)) return 'driver_documents';
  if (/חפש|מסמכים|כל\s*הקבצים/.test(t))              return 'documents_search';
  if (/כמה\s*קיל|מד.?(אמת|מרחק|קיל)|odo/.test(t))  return 'vehicle_odometer';
  if (/מי.*(נהג|אחראי|מחזיק).*רכב/.test(t))          return 'vehicle_driver';
  if (/סטטוס|מצב|תקין|תוקף.*רכב/.test(t))            return 'vehicle_status';
  if (/ללא\s*נהג|אין\s*נהג|לא\s*משויך|פנוי\b|פנויים|ללא\s*שיוך|חופשי|חופשיים|ריק.*רכב|רכב.*ריק|מי\s*חופשי|מי\s*פנוי/.test(t)) return 'vehicle_unassigned';
  if (/רשימ|כמה\s*רכב|כל\s*הרכב/.test(t))             return 'vehicle_list';
  if (/רכב.*\d{4,}|\d{4,}.*רכב|לוחית|לוח\s*רישוי/.test(t)) return 'vehicle_by_plate';
  if (/נהג|נהגת|שם.*נהג/.test(t) && !/רכב/.test(t)) return 'driver_by_name';
  if (/רישיון.*נהיגה|תוקף.*רישיון/.test(t))           return 'driver_license';
  if (/כמה|סה"כ|סטטיסטיק|כללי|מצב\s*הצי/.test(t))   return 'stats_general';
  return 'unknown';
}

// ─────────────────────────────────────────────
// Resolvers
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
  if (!plate) {
    return 'לא הצלחתי לזהות את מספר הרכב בשאלה. אנא ציין את לוחית הרישוי.';
  }

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

  const tillMaint =
    v.next_maintenance_km && v.current_odometer
      ? ` · עד טיפול הבא: ${km(v.next_maintenance_km - v.current_odometer)}`
      : '';

  return `📍 מד-אמת — ${v.manufacturer} ${v.model} (${v.plate_number}):
  קריאה נוכחית: **${km(v.current_odometer)}**
  עודכן לאחרונה: ${fmt(v.last_odometer_date)}${tillMaint}`;
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
  // Fetch ALL active vehicles and filter client-side to handle null, undefined,
  // empty string, or any falsy driver assignment — more reliable than .is(null).
  const { data, error } = await supabase
    .from('vehicles')
    .select('plate_number, manufacturer, model, year, status, assigned_driver_id, is_active')
    .order('manufacturer');

  if (error) return `שגיאה בשאילתה: ${error.message}`;

  const all = (data ?? []).filter(v => v.is_active !== false);
  const total = all.length;

  const unassigned = all.filter(
    v => !v.assigned_driver_id || String(v.assigned_driver_id).trim() === ''
  );

  if (!unassigned.length) {
    return `כרגע כל ${total > 0 ? total : ''} הרכבים מאוישים — לא נמצאו רכבים ללא נהג.`;
  }

  const list = unassigned
    .map((v, i) => `${i + 1}. **${v.manufacturer} ${v.model}** — ${v.plate_number}`)
    .join('\n');

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
  תוקף רישיון: ${fmt(d.license_expiry)} · מצב: ${statusLabel(d.status)}`
      .replace(/\n  \n/, '\n'),
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
    const frontLink = d.license_front_url ? `[צד א']( ${d.license_front_url})` : '(לא הועלה)';
    const backLink  = d.license_back_url  ? `[צד ב'](${d.license_back_url})`   : '(לא הועלה)';
    return `📄 רישיון **${d.full_name}**:
  מספר: ${d.license_number ?? 'לא ידוע'}
  תוקף: ${fmt(d.license_expiry)} · ${statusLabel(d.status)}
  תמונות: ${frontLink}  ${backLink}`;
  });
  return lines.join('\n\n');
}

async function resolveDriverDocuments(name: string | null, rawQ: string): Promise<string> {
  const search = name ?? rawQ.slice(0, 40);

  // find driver id first
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

  const list = docs.map((d, i) =>
    `${i + 1}. ${d.title ?? 'ללא שם'} (${fmt(d.created_at)})\n   🔗 ${d.file_url}`,
  ).join('\n');

  return `📁 מסמכים של **${driver.full_name}** (${docs.length}):\n${list}`;
}

async function resolveDocumentsSearch(rawQ: string): Promise<string> {
  const { data: docs } = await supabase
    .from('driver_documents')
    .select('title, file_url, created_at, driver_id')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!docs?.length) return 'לא נמצאו מסמכים בתיקי הנהגים.';

  // fetch driver names
  const ids = [...new Set(docs.map(d => d.driver_id).filter(Boolean))];
  const { data: driversData } = await supabase
    .from('drivers')
    .select('id, full_name')
    .in('id', ids);
  const nameMap: Record<string, string> = {};
  driversData?.forEach(d => { nameMap[d.id] = d.full_name; });

  const list = docs.map((d, i) =>
    `${i + 1}. **${d.title ?? 'ללא שם'}** — ${nameMap[d.driver_id] ?? 'נהג לא ידוע'} (${fmt(d.created_at)})\n   🔗 ${d.file_url}`,
  ).join('\n');

  return `📂 מסמכים אחרונים (${docs.length}):\n${list}\n\nלתיק מלא — עבור לדף הנהג הרלוונטי.`;
}

async function resolveGeneralStats(): Promise<string> {
  const [
    { count: vTotal },
    { count: vWarning },
    { count: dTotal },
    { count: dWarning },
    { count: docsTotal },
  ] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).in('status', ['warning', 'expired']),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).in('status', ['warning', 'expired']),
    supabase.from('driver_documents').select('id', { count: 'exact', head: true }),
  ]);

  return `📊 **סטטיסטיקות כלליות — Fleet Manager 2026**:
  🚗 רכבים פעילים: **${vTotal ?? '?'}** ${(vWarning ?? 0) > 0 ? `(⚠️ ${vWarning} דורשים טיפול)` : '(הכל תקין)'}
  👤 נהגים פעילים: **${dTotal ?? '?'}** ${(dWarning ?? 0) > 0 ? `(⚠️ ${dWarning} דורשים בדיקה)` : '(הכל תקין)'}
  📁 מסמכים שמורים: **${docsTotal ?? '?'}**`;
}

// ─────────────────────────────────────────────
// Procedure 04-05-001 resolver
// ─────────────────────────────────────────────

function resolveProcedureQuery(q: string): string {
  const matches = searchProcedure(q);

  if (!matches.length) {
    // Return a quick summary of key policy points
    return `נוהל **04-05-001 — שימוש ברכב חברה** כולל 21 סעיפים. נקודות מרכזיות:
• **סעיף 10** — דוחות חנייה אסורה על חשבון הנהג
• **סעיף 11** — כביש 6 / אגרות על חשבון הנהג
• **סעיף 19** — נזק בשימוש חריג / פרטי גורר חיוב אישי
• **סעיף 6** — כל תאונה חייבת דיווח מידי
• **סעיף 21** — הפרת נוהל גוררת אחריות אישית

שאל שאלה מפורטתת ואצטט את הסעיף הרלוונטי.`;
  }

  const cited = matches
    .map(c => `> סעיף **${c.id}** בנוהל 04-05-001:
> _“${c.text}”_`)
    .join('\n\n');

  return `לפי נוהל **04-05-001 — שימוש ברכב חברה**:\n\n${cited}`;
}

// ─────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────

export async function processFleetQuery(
  question: string,
  context?: AIChatContext,
): Promise<string> {
  const q      = question.trim();
  const intent = detectIntent(q);
  const plate  = extractPlate(q) ?? (context?.vehicleId ? undefined : extractPlate(context?.vehicleLabel ?? ''));
  const name   = extractName(q) ?? context?.driverName ?? null;

  try {
    switch (intent) {
      case 'vehicle_by_plate':  return await resolveVehicleByPlate(plate ?? q);
      case 'vehicle_driver':    return await resolveVehicleDriver(plate, q);
      case 'vehicle_odometer':  return await resolveVehicleOdometer(plate);
      case 'vehicle_status':    return await resolveVehicleStatus(plate);
      case 'vehicle_unassigned': return await resolveUnassignedVehicles();
      case 'vehicle_list':      return await resolveVehicleList();
      case 'driver_by_name':    return await resolveDriverByName(name, q);
      case 'driver_license':    return await resolveDriverLicense(name);
      case 'driver_documents':  return await resolveDriverDocuments(name, q);
      case 'documents_search':  return await resolveDocumentsSearch(q);
      case 'stats_general':     return await resolveGeneralStats();
      case 'procedure_query':   return resolveProcedureQuery(q);

      default: {
        // fallback: try to auto-detect if there's a plate number or name in the question
        if (extractPlate(q))            return await resolveVehicleByPlate(extractPlate(q)!);
        if (extractName(q))             return await resolveDriverByName(extractName(q), q);
        return `לא הצלחתי להבין את השאלה. ניתן לשאול למשל:
• "מי הנהג של רכב 123-45-678?"
• "כמה קילומטרים עבר רכב 987-65-432?"
• "פרטים על הנהג ישראל ישראלי"
• "מסמכים של נהג [שם]"
• "סטטוס רכב [לוחית]"
• "כמה רכבים יש בצי?"`;
      }
    }
  } catch (err) {
    console.error('[aiQueryEngine] error:', err);
    return `שגיאה בשליפת הנתונים. בדוק חיבור לרשת ונסה שנית.`;
  }
}
