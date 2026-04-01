import React, { useState, useRef, useCallback, useEffect, useMemo, RefObject } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  useVehicleSpecDirty,
  DIRTY_SOURCE_HANDOVER_WIZARD,
} from '@/contexts/VehicleSpecDirtyContext';
import { useVehicles } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import type { Driver } from '@/types/fleet';
import { useCreateHandover, sendHandoverNotificationEmail, generateReceptionPDF, generateProcedurePDF, generateHealthDeclarationPDF, generateGenericFormPDF } from '@/hooks/useHandovers';
import { parsePolicyClauses, parseHealthItems, useOrgSettings } from '@/hooks/useOrgSettings';
import { useOrgDocuments } from '@/hooks/useOrgDocuments';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { buildFormsAutoFillContext } from '@/lib/formsAutofill';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import VehicleDamage3DSelector from '@/components/VehicleDamage3DSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { HANDOVER_ACCESSORY_CEILINGS, formatCeilingPrice } from '@/lib/accessoryCeilings';
import { cloneEmptyDamageReport, hasAnyDamage, summarizeDamageReport, type VehicleDamageReport } from '@/lib/vehicleDamage';
// Badge no longer needed — replaced with plain span
import { toast } from 'sonner';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Car,
  FileText,
  Plus,
  Heart,
  Camera,
  Loader2,
  Shield,
  AlertTriangle,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface AccessoryItem {
  id: string;
  name: string;
  maxPrice: string;
  checked: boolean;
  notes: string;
  missing?: boolean;
}

interface HealthDeclaration {
  id: string;
  text: string;
  checked: boolean;
}

interface ProcedureClause {
  id: number;
  text: string;
}

interface WizardState {
  // Step 1 – Vehicle Reception
  accessories: AccessoryItem[];
  sig1DataUrl: string | null;
  // Step 2 – Procedure
  procedureRead: boolean;
  sig2DataUrl: string | null;
  // Step 3 – Health
  healthItems: HealthDeclaration[];
  sig3DataUrl: string | null;
  // Step 4 – License
  licenseNumber: string;
  licenseExpiry: string;
  licenseClass: string;
  licenseFront: File | null;
  licenseBack: File | null;
}

interface ReceptionManualFields {
  idNumber: string;
  employeeNumber: string;
  phone: string;
  address: string;
  ignitionCode: string;
}

type ReceptionFieldErrors = Partial<Record<keyof ReceptionManualFields, string>>;

interface VehicleHandoverWizardLocationState {
  vehicleId?: string;
  driverId?: string;
  reportUrl?: string;
}

const EMPTY_WIZARD_LOCATION_STATE: VehicleHandoverWizardLocationState = Object.freeze({});

const idNumberRegex = /^\d{9}$/;
const phoneRegex = /^0\d{8,9}$/;
const ignitionCodeRegex = /^\d{4,6}$/;

function orgDocSchemaStringField(schema: unknown, key: string): string {
  if (!schema || typeof schema !== 'object') return '';
  const raw = (schema as Record<string, unknown>)[key];
  if (raw === undefined || raw === null) return '';
  return typeof raw === 'string' ? raw : String(raw);
}

function orgDocTemplateBody(schema: unknown, description?: string | null): string {
  const fromSchema = orgDocSchemaStringField(schema, 'template_content');
  return fromSchema || String(description ?? '');
}

function extractCommitmentSection(text?: string): string[] {
  if (!text?.trim()) {
    return [
      'הנני מתחייב להשתמש ברכב אך ורק לשם מילוי תפקידי ולנהוג לפי חוקי התעבורה והנחיות החברה.',
      'ידוע לי כי אחריותי המלאה חלה על שימוש תקין ברכב ועל החזרתו בשלמות.',
    ];
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('______'));

  const startIdx = lines.findIndex((line) => line.includes('התחייבות והצהרת הנהג'));
  if (startIdx === -1) {
    return lines.filter((line) => !line.includes('פרטי הנהג והרכב') && !line.includes('טבלת אישור אביזרים'));
  }

  const sliced = lines.slice(startIdx + 1);
  const endIdx = sliced.findIndex(
    (line) =>
      line.includes('טבלת אישור אביזרים') ||
      line.startsWith('2.') ||
      line.includes('שדות מילוי') ||
      line.includes('חתימה דיגיטלית'),
  );
  const section = endIdx >= 0 ? sliced.slice(0, endIdx) : sliced;

  return section.filter(
    (line) => !line.includes('פרטי הנהג והרכב') && !line.includes('טבלת אישור אביזרים') && !line.startsWith('['),
  );
}

function extractSectionLines(text: string, sectionTitleIncludes: string, stopMarkers: string[]): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const start = lines.findIndex((line) => line.includes(sectionTitleIncludes));
  if (start < 0) return [];
  const section = lines.slice(start + 1);
  const stopIndex = section.findIndex((line) => stopMarkers.some((marker) => line.includes(marker)));
  return (stopIndex >= 0 ? section.slice(0, stopIndex) : section).filter(Boolean);
}

function parseAccessoriesFromTemplate(text?: string): AccessoryItem[] {
  if (!text?.trim()) return [];
  const sectionLines = extractSectionLines(text, 'טבלת אישור אביזרים', ['שדות מילוי', 'חתימה', 'חתימת']);
  if (sectionLines.length === 0) return [];

  const parsed: AccessoryItem[] = [];
  sectionLines.forEach((line, index) => {
    const candidate = line
      .replace(/^\[[^\]]*]\s*/, '')
      .replace(/^[-•]\s*/, '')
      .replace(/^\d+[).-]\s*/, '')
      .trim();
    if (!candidate) return;
    if (
      candidate.includes('נא לסמן') ||
      candidate.includes('תקרות אביזרים') ||
      candidate.includes('במקרה של חוסר')
    ) {
      return;
    }

    const hasCurrency = /(₪|ש["״]?ח|nis)/i.test(candidate);
    const hasPriceInParens = /\([^)]*\d[^)]*\)/.test(candidate);
    const hasCeilingPattern = /תקרה[:：]?\s*\d/.test(candidate);
    const hasChecklistMarker = line.includes('[');
    const isLikelyAccessory = hasChecklistMarker || hasPriceInParens || hasCurrency || hasCeilingPattern;
    if (!isLikelyAccessory) return;

    const match = candidate.match(/^(.*?)(?:\s*\(([^)]*)\))?$/);
    if (!match) return;
    const name = (match[1] ?? '').trim().replace(/\s*-\s*תקרה[:：]?.*$/i, '').trim();
    if (!name) return;
    const priceRaw = (match[2] ?? '').trim();
    const ceilingMatch = candidate.match(/תקרה[:：]?\s*([\d,.\s]+(?:₪|ש["״]?ח)?)/i);
    const maxPrice = (priceRaw || ceilingMatch?.[1] || 'ללא הגבלה').trim();

    parsed.push({
      id: `template_accessory_${index}`,
      name,
      maxPrice,
      checked: false,
      notes: '',
      missing: false,
    });
  });
  return parsed;
}

function parseProcedureClausesFromTemplateFallback(text?: string): ProcedureClause[] {
  if (!text?.trim()) return [];
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.includes('נוהל שימוש') &&
        !line.includes('שדות מילוי') &&
        !line.includes('חתימה') &&
        !line.startsWith('['),
    );
  const clauses = lines
    .map((line, index) => ({
      id: index + 1,
      text: line.replace(/^\d+[).-]?\s*/, '').trim(),
    }))
    .filter((item) => item.text.length > 0);
  return clauses;
}

function parseHealthItemsFromTemplateFallback(text?: string): HealthDeclaration[] {
  if (!text?.trim()) return [];
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.includes('הצהרת בריאות') &&
        !line.includes('שדות מילוי') &&
        !line.includes('חתימה') &&
        !line.includes('הערות') &&
        !line.startsWith('['),
    );
  return lines
    .map((textLine, index) => ({
      id: `health_fallback_${index + 1}`,
      text: textLine.replace(/^\d+[).-]?\s*/, '').trim(),
      checked: false,
    }))
    .filter((item) => item.text.length > 0);
}

function joinHebrewList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ו${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

function parseOdometerReading(rawValue: string): number {
  const digitsOnly = rawValue.replace(/[^\d]/g, '');
  if (!digitsOnly) return 0;
  return Number.parseInt(digitsOnly, 10) || 0;
}

function parseFuelLevel(rawValue: string): number {
  const match = rawValue.match(/\d+/);
  if (!match) return 0;
  const value = Number.parseInt(match[0], 10);
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(8, value));
}

function buildUnifiedDamageSummary(damageReport: VehicleDamageReport, damageNotes: string): string {
  const markerSummary = hasAnyDamage(damageReport) ? summarizeDamageReport(damageReport) : '';
  const noteSummary = damageNotes.trim();
  if (markerSummary && noteSummary) return `${markerSummary} | ${noteSummary}`;
  if (markerSummary) return markerSummary;
  if (noteSummary) return noteSummary;
  return 'ללא נזקים';
}

// ─────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────
const INITIAL_ACCESSORIES: AccessoryItem[] = HANDOVER_ACCESSORY_CEILINGS.map((item) => ({
  id: item.id,
  name: item.name,
  maxPrice: formatCeilingPrice(item.maxPriceNis),
  checked: false,
  notes: '',
}));

const PROCEDURE_CLAUSES: ProcedureClause[] = [
  { id: 1,  text: 'הרכב ישמש לצרכי עבודה בלבד, לנסיעות מוסמכות על-פי תפקיד המחזיק.' },
  { id: 2,  text: 'חל איסור מוחלט על נהיגה תחת השפעת אלכוהול, סמים או תרופות המשפיעות על הנהיגה.' },
  { id: 3,  text: 'חל איסור על נהיגה במצב עייפות. הנהג חייב להפסיק לנסוע ולנוח.' },
  { id: 4,  text: 'הנהג חייב לציית לכל חוקי התנועה ולשמור על בטיחות הנסיעה בכל עת.' },
  { id: 5,  text: 'הנהג אחראי לבצע בדיקות שגרתיות: מפלס שמן, מים, לחץ צמיגים לפני נסיעה.' },
  { id: 6,  text: 'כל תאונה — יש לדווח לממונה ולמחלקת הרכב באופן מיידי, ללא דיחוי.' },
  { id: 7,  text: 'כל נזק לרכב, יהיה קטן ככל שיהיה, יש לדווח ולתעד בטרם לקיחת הרכב.' },
  { id: 8,  text: 'חל איסור מוחלט על עישון, אכילה ושתייה ברכב המגורים/נוסעים.' },
  { id: 9,  text: 'הנהג מחויב להחזיר את הרכב נקי ומסודר, ולדאוג לניקיון שוטף.' },
  { id: 10, text: 'חניה תבוצע במקומות מורשים בלבד. דוחות חניה בגין חניה אסורה — על חשבון הנהג.' },
  { id: 11, text: 'עמלות כבישי אגרה (כביש 6, מנהרות וכד׳) — יחויבו על חשבון הנהג, אלא אם הוסמך אחרת.' },
  { id: 12, text: 'חל איסור להשתמש ברכב למטרות אישיות מחוץ לשעות ולמסגרת האישור שניתן.' },
  { id: 13, text: 'הנהג אינו רשאי להשכיר, להלוות או להעביר את הרכב לצד שלישי כלשהו.' },
  { id: 14, text: 'חל איסור מוחלט לבצע שינויים, תוספות או שדרוגים ברכב ללא אישור מחלקת הרכב.' },
  { id: 15, text: 'נסיעה מחוץ לגבולות ישראל מחייבת אישור מפורש מראש ממנהל המחלקה.' },
  { id: 16, text: 'אין להשאיר חפצי ערך או ציוד ארגוני ברכב בעת חנייה. הסיכון — על הנהג.' },
  { id: 17, text: 'הנהג מחויב לעדכן קריאת מד-אמת בכל תחילת חודש ועם סיום נסיעה עסקית.' },
  { id: 18, text: 'הנהג אחראי לוודא שהביטוח והרישיונות בתוקף. נסיעה עם רישיון פג תוקף — אחריות הנהג.' },
  { id: 19, text: 'רכב חברה אינו מבוטח לשימוש פרטי מלא; נהיגה חריגה עלולה לגרור חיוב אישי בנזק.' },
  { id: 20, text: 'החזרת הרכב תיעשה באותו מצב קכי החרגה הוחזר, כולל מפתחות, ניירות ואביזרים.' },
  { id: 21, text: 'הפרת נוהל זה תגרור נקיטת הליכים משמעתיים וגישת אחריות אישית לנזקים.' },
];

const INITIAL_HEALTH: HealthDeclaration[] = [
  { id: 'nervous',  text: 'אינני סובל/ת ממחלת עצבים, אפילפסיה או מחלה העלולה לגרום לאובדן הכרה בזמן נהיגה.', checked: false },
  { id: 'vision',   text: 'כושר הראייה שלי תקין (עם תיקון אופטי אם נדרש) ואני מחזיק/ה משקפי ראייה/עדשות בעת הצורך.', checked: false },
  { id: 'hearing',  text: 'כושר השמיעה שלי תקין ואינני סובל/ת מלקות שמיעה משמעותית.', checked: false },
  { id: 'meds',     text: 'אינני נוטל/ת תרופות הגורמות לנמנום, ירידת ריכוז או פגיעה בכושר הנהיגה.', checked: false },
  { id: 'fitness',  text: 'מצב בריאותי הכללי מאפשר נהיגה בטוחה, ואני כשיר/ה פיזית לנהוג ברכב זה.', checked: false },
  { id: 'general',  text: 'אני מצהיר/ה כי כל הפרטים לעיל נכונים ומדויקים, ואני מודע/ת לאחריותי בנהיגה.', checked: false },
];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function OfficialDocHeader({ title, subtitle, date, vehicleLabel, driverName }: {
  title: string; subtitle?: string; date: string; vehicleLabel?: string; driverName?: string;
}) {
  return (
    <div className="border-b-2 border-slate-300 pb-4 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right text-sm text-slate-500 space-y-0.5">
          <div className="font-medium">תאריך: {date}</div>
          {vehicleLabel && <div>רכב: <span className="font-semibold text-slate-700">{vehicleLabel}</span></div>}
          {driverName  && <div>נהג: <span className="font-semibold text-slate-700">{driverName}</span></div>}
        </div>
      </div>
    </div>
  );
}

function SignatureBlock({ sigRef, label, onSign, signatureKey }: {
  sigRef: RefObject<SignaturePadRef>;
  label: string;
  onSign: (has: boolean) => void;
  signatureKey?: string;
}) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">{label}</p>
      <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-white">
        <SignaturePad key={signatureKey} ref={sigRef} onSign={onSign} />
      </div>
      <p className="text-xs text-slate-400 mt-1 text-center">חתום/י באצבע או בעכבר בתוך המסגרת</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 1 — Vehicle Reception
// ─────────────────────────────────────────────
function Step1({
  accessories,
  setAccessories,
  sigRef,
  onSign,
  vehicleLabel,
  driverName,
  date,
  deliveryDateTime,
  declarationText,
  manualFields,
  fieldErrors,
  onManualFieldChange,
  canSign,
  containerRef,
}: {
  accessories: AccessoryItem[];
  setAccessories: (a: AccessoryItem[]) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
  deliveryDateTime: string;
  declarationText?: string;
  manualFields: ReceptionManualFields;
  fieldErrors: ReceptionFieldErrors;
  onManualFieldChange: (field: keyof ReceptionManualFields, value: string) => void;
  canSign: boolean;
  containerRef?: RefObject<HTMLDivElement>;
}) {
  const toggle = (id: string) =>
    setAccessories(accessories.map(a => a.id === id ? { ...a, checked: !a.checked } : a));

  const setNotes = (id: string, notes: string) =>
    setAccessories(accessories.map(a => a.id === id ? { ...a, notes } : a));

  const markMissing = (id: string) => {
    setAccessories(accessories.map(item => item.id === id ? { ...item, missing: !item.missing, checked: item.missing ? false : item.checked } : item));
  };

  const showAccessoriesWarning = accessories.some(item => !item.checked && !item.missing);

  // נחשב תקין אם האביזר מסומן ב-✓ או ✗
  const allChecked = accessories.every(a => a.checked || a.missing);
  const toggleAll  = () =>
    setAccessories(accessories.map(a => ({ ...a, checked: !allChecked && !a.missing })));
  const commitmentLines = extractCommitmentSection(declarationText);
  const requiredAsterisk = <span className="text-red-600">*</span>;

  return (
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader
        title="טופס קבלת רכב"
        subtitle="יש לסמן ✓ על כל פריט המצוי ברכב ולחתום בתחתית הטופס"
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-bold text-slate-800 mb-2">1. התחייבות והצהרת הנהג</h3>
        <div className="space-y-1">
          {commitmentLines.map((line) => (
            <p key={line.slice(0, 32)} className="text-sm text-slate-700 leading-6">
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* Accessories table */}
      <h3 className="text-sm font-bold text-slate-800 mb-2">2. טבלת אישור אביזרים</h3>
      <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2.5 font-semibold text-slate-700 w-9 text-center">✓</th>
              <th className="px-3 py-2.5 font-semibold text-slate-700 w-9 text-center">✗</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700">פריט</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700 w-24">תקרה</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700 w-40">הערות</th>
            </tr>
          </thead>
          <tbody>
            {accessories.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    checked={item.checked && !item.missing}
                    onCheckedChange={() => setAccessories(accessories.map(a => a.id === item.id ? { ...a, checked: true, missing: false } : a))}
                    className="border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    checked={item.missing}
                    onCheckedChange={() => setAccessories(accessories.map(a => a.id === item.id ? { ...a, missing: true, checked: false } : a))}
                    className="border-slate-400 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                  />
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">{item.name}</td>
                <td className="px-3 py-2 text-slate-500 tabular-nums text-xs">{item.maxPrice}</td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={item.notes}
                    onChange={(e) => setNotes(item.id, e.target.value)}
                    placeholder="הערה..."
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                    style={{ background: '#ffffff', color: '#334155' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* כפתור הוספת טפסים הוסר כאן - נשאר רק הכפתור הראשי הדרגביל */}
      {/* פס צהוב אחרי הטבלה בלבד */}
      {showAccessoriesWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800 text-center mt-2">
          יש לסמן את כל האביזרים בטבלה (✓ או ✗) לפני המשך
        </div>
      )}

      {/* Quick-select button */}
      {/* Quick-select button and yellow row after table */}
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={toggleAll}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            allChecked
              ? 'bg-emerald-100 border-emerald-400 text-emerald-700 hover:bg-emerald-200'
              : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700'
          }`}
        >
          {allChecked ? '✔ הכל סומן כתקין' : '✔ סמן הכל כתקין'}
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
        <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />
        פריטים שסומנו כנמסרו — אחריות החזרתם בשלמות חלה על הנהג. אובדן או נזק יחויב לפי מחיר התקרה.
      </div>

      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-4 pb-24 space-y-3">
        <h3 className="text-sm font-bold text-slate-800">3. שדות מילוי נדרשים</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="receipt-full-name">שם מלא</Label>
            <Input id="receipt-full-name" value={driverName} readOnly className="bg-slate-100" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-id-number">מספר תעודת זהות {requiredAsterisk}</Label>
            <Input
              id="receipt-id-number"
              value={manualFields.idNumber}
              onChange={(e) => onManualFieldChange('idNumber', e.target.value)}
              placeholder="9 ספרות"
              inputMode="numeric"
              className={fieldErrors.idNumber ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {fieldErrors.idNumber && <p className="text-xs text-red-600">{fieldErrors.idNumber}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-employee-number">מספר עובד {requiredAsterisk}</Label>
            <Input
              id="receipt-employee-number"
              value={manualFields.employeeNumber}
              onChange={(e) => onManualFieldChange('employeeNumber', e.target.value)}
              placeholder="מספר עובד"
              className={fieldErrors.employeeNumber ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {fieldErrors.employeeNumber && <p className="text-xs text-red-600">{fieldErrors.employeeNumber}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-phone">טלפון נייד {requiredAsterisk}</Label>
            <Input
              id="receipt-phone"
              value={manualFields.phone}
              onChange={(e) => onManualFieldChange('phone', e.target.value)}
              placeholder="05X..."
              inputMode="tel"
              className={fieldErrors.phone ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {fieldErrors.phone && <p className="text-xs text-red-600">{fieldErrors.phone}</p>}
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="receipt-address">כתובת העובד (עיר ורחוב) {requiredAsterisk}</Label>
            <Input
              id="receipt-address"
              value={manualFields.address}
              onChange={(e) => onManualFieldChange('address', e.target.value)}
              placeholder="עיר ורחוב"
              className={fieldErrors.address ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {fieldErrors.address && <p className="text-xs text-red-600">{fieldErrors.address}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-ignition-code">קוד קודנית {requiredAsterisk}</Label>
            <Input
              id="receipt-ignition-code"
              value={manualFields.ignitionCode}
              onChange={(e) => onManualFieldChange('ignitionCode', e.target.value)}
              placeholder="4-6 ספרות"
              inputMode="numeric"
              className={fieldErrors.ignitionCode ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {fieldErrors.ignitionCode && <p className="text-xs text-red-600">{fieldErrors.ignitionCode}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-delivery-time">תאריך ושעת מסירה</Label>
            <Input id="receipt-delivery-time" value={deliveryDateTime} readOnly className="bg-slate-100" />
          </div>
        </div>
      </div>

      {canSign && (
        <SignatureBlock
          sigRef={sigRef}
          label="4. חתימת הנהג — אישור קבלת הרכב והאביזרים:"
          onSign={onSign}
          signatureKey="reception-signature"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 2 — Usage Procedure
// ─────────────────────────────────────────────
function Step2({
  procedureRead, setProcedureRead, sigRef, onSign, vehicleLabel, driverName, date, containerRef, clauses, formTitle,
}: {
  procedureRead: boolean;
  setProcedureRead: (v: boolean) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
  containerRef?: RefObject<HTMLDivElement>;
  clauses: Array<{ id: number; text: string }>;
  formTitle?: string;
}) {
  return (
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader
        title={formTitle?.trim() || 'נוהל שימוש ברכב חברה'}
        subtitle="יש לקרוא את הטופס ולאשר קריאה וחתימה בתחתית"
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <div className="space-y-1 mb-6">
        {clauses.map(clause => (
          <div key={clause.id} className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
            <span className="text-xs font-bold text-slate-400 mt-0.5 w-6 shrink-0 text-left">{clause.id}.</span>
            <p className="text-sm text-slate-700 leading-relaxed">{clause.text}</p>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4 flex gap-2">
        <Shield className="h-4 w-4 mt-0.5 shrink-0" />
        <span>באישור זה אני מאשר/ת כי קראתי והבנתי את הטופס ואני מתחייב/ת לפעול לפיו.</span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <Checkbox
          id="proc-read"
          checked={procedureRead}
          onCheckedChange={(v) => setProcedureRead(!!v)}
          className="border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
        />
        <label htmlFor="proc-read" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
          קראתי והבנתי את הטופס
        </label>
      </div>

      <SignatureBlock sigRef={sigRef} label="חתימת הנהג:" onSign={onSign} signatureKey="procedure-signature" />
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 3 — Health Declaration
// ─────────────────────────────────────────────
function Step3({
  healthItems, setHealthItems, notes, setNotes, sigRef, onSign, vehicleLabel, driverName, date, containerRef, formTitle,
}: {
  healthItems: HealthDeclaration[];
  setHealthItems: (h: HealthDeclaration[]) => void;
  notes: string;
  setNotes: (v: string) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
  containerRef?: RefObject<HTMLDivElement>;
  formTitle?: string;
}) {
  const toggle = (id: string) =>
    setHealthItems(healthItems.map(h => h.id === id ? { ...h, checked: !h.checked } : h));

  const allChecked = healthItems.every(h => h.checked);
  const toggleAll  = () =>
    setHealthItems(healthItems.map(h => ({ ...h, checked: !allChecked })));

  return (
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader
        title={formTitle?.trim() || 'הצהרת בריאות לנהג'}
        subtitle="יש לסמן ✓ על כל סעיף ולחתום. ידוע כי מסירת פרטים כוזבים מהווה עבירה."
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <p className="text-sm text-slate-600 mb-3">
        אני הח"מ מצהיר/ה כי מצב בריאותי מאפשר נהיגה בטוחה, וכי הפרטים הבאים נכונים:
      </p>

      <div className="space-y-3 mb-6">
        {healthItems.map((item, i) => (
          <div
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none ${
              item.checked
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {item.checked
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                : <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
              }
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              <span className="font-bold text-slate-400 ml-1">{i + 1}.</span> {item.text}
            </p>
          </div>
        ))}
      </div>

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={toggleAll}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            allChecked
              ? 'bg-emerald-100 border-emerald-400 text-emerald-700 hover:bg-emerald-200'
              : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700'
          }`}
        >
          {allChecked ? '✔ כל הסעיפים אושרו' : 'אני מצהיר כי כל הסעיפים תקינים'}
        </button>
      </div>

      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 mb-4">
        <Heart className="inline h-3.5 w-3.5 ml-1" />
        הצהרת בריאות זו הינה תנאי סף לקבלת רכב חברה. מסירת פרטים כוזבים תגרור הפסקת הטיפול בהפרת רישיון.
      </div>

      {/* Additional notes */}
      <div className="mb-4">
        <Label className="text-slate-700 text-sm font-semibold block mb-1">הערות נוספות</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערות רפואיות, מגבלות נהיגה, או כל מידע רלוונטי אחר..."
          rows={3}
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-400 resize-none"
        />
      </div>

      <SignatureBlock
        sigRef={sigRef}
        label="חתימת הנהג — הצהרת בריאות:"
        onSign={onSign}
        signatureKey="health-signature"
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 4 — License Capture
// ─────────────────────────────────────────────
function Step4({
  licenseNumber, setLicenseNumber,
  licenseExpiry, setLicenseExpiry,
  licenseClass, setLicenseClass,
  odometerReading, setOdometerReading,
  fuelLevel, setFuelLevel,
  damageNotes, setDamageNotes,
  damageReport, setDamageReport,
  licenseFront, setLicenseFront,
  licenseBack, setLicenseBack,
  skipLicenseStep,
  driverName, date,
}: {
  licenseNumber: string; setLicenseNumber: (v: string) => void;
  licenseExpiry: string; setLicenseExpiry: (v: string) => void;
  licenseClass: string; setLicenseClass: (v: string) => void;
  odometerReading: string; setOdometerReading: (v: string) => void;
  fuelLevel: string; setFuelLevel: (v: string) => void;
  damageNotes: string; setDamageNotes: (v: string) => void;
  damageReport: VehicleDamageReport; setDamageReport: (v: VehicleDamageReport) => void;
  licenseFront: File | null; setLicenseFront: (f: File | null) => void;
  licenseBack: File | null; setLicenseBack: (f: File | null) => void;
  skipLicenseStep: boolean;
  driverName: string; date: string;
}) {
  const makePrev = (file: File | null) => file ? URL.createObjectURL(file) : null;

  return (
    <div className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader
        title="צילום רישיון נהיגה"
        subtitle="יש לצלם את שני צדי הרישיון ולמלא את הפרטים"
        date={date}
        driverName={driverName}
      />

      {/* Photo upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {([
          { label: 'צד א׳ — תמונה ופרטים', side: 'front', file: licenseFront, setFile: setLicenseFront },
          { label: 'צד ב׳ — דרגות ותוקף',  side: 'back',  file: licenseBack,  setFile: setLicenseBack },
        ] as const).map(({ label, side, file, setFile }) => (
          <label key={side} className="cursor-pointer">
            <div className={`relative border-2 border-dashed rounded-xl overflow-hidden aspect-[1.6] flex flex-col items-center justify-center transition-colors ${
              file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
            }`}>
              {file ? (
                <img
                  src={makePrev(file)!}
                  alt={label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  <Camera className="h-8 w-8 text-slate-400 mb-2" />
                  <span className="text-xs text-slate-500 font-medium px-2 text-center">{label}</span>
                </>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-center text-slate-500 mt-1">{label}</p>
          </label>
        ))}
      </div>

      {/* Fields — dark panel for legibility */}
      <div className="bg-slate-900 rounded-xl p-4">
        {skipLicenseStep && (
          <div className="mb-3 rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100">
            שלב צילום הרישיון סומן כדילוג.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-slate-300 text-sm font-semibold">מספר רישיון</Label>
            <Input
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="00000000"
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold placeholder:text-slate-400 focus:border-cyan-400"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm font-semibold">תוקף רישיון</Label>
            <Input
              type="date"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold focus:border-cyan-400"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm font-semibold">דרגת רישיון</Label>
            <Input
              value={licenseClass}
              onChange={(e) => setLicenseClass(e.target.value)}
              placeholder="B, C1..."
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold placeholder:text-slate-400 focus:border-cyan-400"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <Label className="text-slate-300 text-sm font-semibold">קילומטראז' נוכחי</Label>
            <Input
              value={odometerReading}
              onChange={(e) => setOdometerReading(e.target.value)}
              placeholder="לדוגמה: 125430"
              inputMode="numeric"
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold placeholder:text-slate-400 focus:border-cyan-400"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm font-semibold">רמת דלק (0-8)</Label>
            <Input
              value={fuelLevel}
              onChange={(e) => setFuelLevel(e.target.value)}
              placeholder="0-8"
              inputMode="numeric"
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold placeholder:text-slate-400 focus:border-cyan-400"
            />
          </div>
          <div className="md:col-span-1">
            <Label className="text-slate-300 text-sm font-semibold">נזקים קיימים</Label>
            <Input
              value={damageNotes}
              onChange={(e) => setDamageNotes(e.target.value)}
              placeholder="ללא / פירוט קצר"
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold placeholder:text-slate-400 focus:border-cyan-400"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-[#0b1729] p-3">
        <VehicleDamage3DSelector value={damageReport} onChange={setDamageReport} />
      </div>

      <p className="text-xs text-slate-400 mt-4 text-center">
        התמונות ישמרו מוצפנות ב-Storage המאובטח של המערכת ויצורפו לתיק הנהג.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Progress Bar
// ─────────────────────────────────────────────
type WizardStepKind = 'reception' | 'procedure' | 'health' | 'license' | 'generic';

type DeliveryFormDoc = {
  id: string;
  title: string;
  template_name?: string | null;
  file_url?: string | null;
  approved?: boolean;
  description?: string | null;
  json_schema?: unknown;
};

type PracticalTestUiState = {
  checks: Record<string, 'pass' | 'fail' | ''>;
  date: string;
  time: string;
  examinerName: string;
  result: 'pass' | 'fail' | '';
};

type TrafficLiabilityUiState = {
  firstName: string;
  lastName: string;
  idNumber: string;
  fullAddress: string;
  mobile: string;
};

type UpgradeUiState = {
  vehicleNameToUpgrade: string;
  netUpgradeAmount: string;
  fullName: string;
};

type ReturnFormUiState = {
  returnDate: string;
  returnTime: string;
  odometer: string;
  fuel: string;
  damages: string;
  missingAccessories: string;
};

type WizardStep = {
  icon: typeof Car;
  label: string;
  kind: WizardStepKind;
  docId?: string;
};

const BASE_STEPS: WizardStep[] = [
  { icon: Car, label: 'טופס קבלת רכב', kind: 'reception' },
];

// Keep STEPS alias for backward compat
const STEPS = BASE_STEPS;

function ProgressBar({ current, steps = STEPS }: { current: number; steps?: typeof STEPS }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const done    = i < current;
          const active  = i === current;
          // Prefer label as key if unique, fallback to index only if necessary
          const key = step.label || i;
          return (
            <div key={key} className="flex items-center flex-1">
              <div className={`flex flex-col items-center flex-1 ${i === steps.length - 1 ? '' : ''}`}>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all ${
                  done   ? 'bg-cyan-500 border-cyan-500 text-white' :
                  active ? 'bg-[#020617] border-cyan-400 text-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.5)]' :
                           'bg-white/5 border-white/20 text-white/30'
                }`}>
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={`text-xs mt-1 font-medium whitespace-nowrap ${
                  done ? 'text-cyan-400' : active ? 'text-white' : 'text-white/30'
                }`}>{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 mt-[-14px] transition-all rounded-full ${done ? 'bg-cyan-500' : 'bg-white/10'}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded-full transition-all duration-500"
          style={{ width: `${((current) / (steps.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

type RenderStepContentProps = {
  stepIdx: number;
  wizardSteps: WizardStep[];
  availableDeliveryForms: DeliveryFormDoc[];
  accessories: AccessoryItem[];
  setAccessories: (value: AccessoryItem[]) => void;
  sig1Ref: RefObject<SignaturePadRef>;
  setSig1OK: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  today: string;
  deliveryDateTime: string;
  receptionDeclarationText: string;
  manualFields: ReceptionManualFields;
  step1FieldErrors: ReceptionFieldErrors;
  onManualFieldChange: (field: keyof ReceptionManualFields, value: string) => void;
  canSignReception: boolean;
  healthItems: HealthDeclaration[];
  setHealthItems: (value: HealthDeclaration[]) => void;
  healthNotes: string;
  setHealthNotes: (value: string) => void;
  sig3Ref: RefObject<SignaturePadRef>;
  setSig3OK: (has: boolean) => void;
  procedureRead: boolean;
  setProcedureRead: (value: boolean) => void;
  sig2Ref: RefObject<SignaturePadRef>;
  setSig2OK: (has: boolean) => void;
  activeClauses: ProcedureClause[];
  licenseNumber: string;
  setLicenseNumber: (value: string) => void;
  licenseExpiry: string;
  setLicenseExpiry: (value: string) => void;
  licenseClass: string;
  setLicenseClass: (value: string) => void;
  odometerReading: string;
  setOdometerReading: (value: string) => void;
  fuelLevel: string;
  setFuelLevel: (value: string) => void;
  damageNotes: string;
  setDamageNotes: (value: string) => void;
  damageReport: VehicleDamageReport;
  setDamageReport: (value: VehicleDamageReport) => void;
  licenseFront: File | null;
  setLicenseFront: (value: File | null) => void;
  licenseBack: File | null;
  setLicenseBack: (value: File | null) => void;
  skipLicenseStep: boolean;
  genericFormApprovals: Record<string, boolean>;
  setGenericFormApprovals: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  genericFormNotes: Record<string, string>;
  setGenericFormNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  genericSigRef: RefObject<SignaturePadRef>;
  genericSigOkByDocId: Record<string, boolean>;
  setGenericSigOkByDocId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  practicalTestUiByDocId: Record<string, PracticalTestUiState>;
  setPracticalTestUiByDocId: React.Dispatch<React.SetStateAction<Record<string, PracticalTestUiState>>>;
  trafficLiabilityUiByDocId: Record<string, TrafficLiabilityUiState>;
  setTrafficLiabilityUiByDocId: React.Dispatch<React.SetStateAction<Record<string, TrafficLiabilityUiState>>>;
  upgradeUiByDocId: Record<string, UpgradeUiState>;
  setUpgradeUiByDocId: React.Dispatch<React.SetStateAction<Record<string, UpgradeUiState>>>;
  returnFormUiByDocId: Record<string, ReturnFormUiState>;
  setReturnFormUiByDocId: React.Dispatch<React.SetStateAction<Record<string, ReturnFormUiState>>>;
};

function renderStepContent({
  stepIdx,
  wizardSteps,
  availableDeliveryForms,
  accessories,
  setAccessories,
  sig1Ref,
  setSig1OK,
  vehicleLabel,
  driverName,
  today,
  deliveryDateTime,
  receptionDeclarationText,
  manualFields,
  step1FieldErrors,
  onManualFieldChange,
  canSignReception,
  healthItems,
  setHealthItems,
  healthNotes,
  setHealthNotes,
  sig3Ref,
  setSig3OK,
  procedureRead,
  setProcedureRead,
  sig2Ref,
  setSig2OK,
  activeClauses,
  licenseNumber,
  setLicenseNumber,
  licenseExpiry,
  setLicenseExpiry,
  licenseClass,
  setLicenseClass,
  odometerReading,
  setOdometerReading,
  fuelLevel,
  setFuelLevel,
  damageNotes,
  setDamageNotes,
  damageReport,
  setDamageReport,
  licenseFront,
  setLicenseFront,
  licenseBack,
  setLicenseBack,
  skipLicenseStep,
  genericFormApprovals,
  setGenericFormApprovals,
  genericFormNotes,
  setGenericFormNotes,
  genericSigRef,
  genericSigOkByDocId,
  setGenericSigOkByDocId,
  practicalTestUiByDocId,
  setPracticalTestUiByDocId,
  trafficLiabilityUiByDocId,
  setTrafficLiabilityUiByDocId,
  upgradeUiByDocId,
  setUpgradeUiByDocId,
  returnFormUiByDocId,
  setReturnFormUiByDocId,
}: RenderStepContentProps) {
  const currentStep = wizardSteps[stepIdx];
  if (!currentStep) return null;

  if (currentStep.kind === 'reception') {
    return (
      <Step1
        accessories={accessories}
        setAccessories={setAccessories}
        sigRef={sig1Ref}
        onSign={setSig1OK}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
        date={today}
        deliveryDateTime={deliveryDateTime}
        declarationText={receptionDeclarationText}
        manualFields={manualFields}
        fieldErrors={step1FieldErrors}
        onManualFieldChange={onManualFieldChange}
        canSign={canSignReception}
      />
    );
  }

  const doc = currentStep.docId
    ? availableDeliveryForms.find((f) => f.id === currentStep.docId)
    : undefined;
  if (!doc) return null;

  if (currentStep.kind === 'health') {
    return (
      <Step3
        healthItems={healthItems}
        setHealthItems={setHealthItems}
        notes={healthNotes}
        setNotes={setHealthNotes}
        sigRef={sig3Ref}
        onSign={setSig3OK}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
        date={today}
        formTitle={doc.title}
      />
    );
  }

  if (currentStep.kind === 'procedure') {
    return (
      <Step2
        procedureRead={procedureRead}
        setProcedureRead={setProcedureRead}
        sigRef={sig2Ref}
        onSign={setSig2OK}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
        date={today}
        clauses={activeClauses}
        formTitle={doc.title}
      />
    );
  }

  if (currentStep.kind === 'license') {
    return (
      <Step4
        licenseNumber={licenseNumber}
        setLicenseNumber={setLicenseNumber}
        licenseExpiry={licenseExpiry}
        setLicenseExpiry={setLicenseExpiry}
        licenseClass={licenseClass}
        setLicenseClass={setLicenseClass}
        odometerReading={odometerReading}
        setOdometerReading={setOdometerReading}
        fuelLevel={fuelLevel}
        setFuelLevel={setFuelLevel}
        damageNotes={damageNotes}
        setDamageNotes={setDamageNotes}
        damageReport={damageReport}
        setDamageReport={setDamageReport}
        licenseFront={licenseFront}
        setLicenseFront={setLicenseFront}
        licenseBack={licenseBack}
        setLicenseBack={setLicenseBack}
        skipLicenseStep={skipLicenseStep}
        driverName={driverName}
        date={today}
      />
    );
  }

  const builtinTemplateKey = orgDocSchemaStringField(doc.json_schema, 'builtin_template_key');
  const docTitle = safeDocTitle(doc);
  const isPracticalDrivingTestForm =
    builtinTemplateKey === 'system-practical-driving-test' || docTitle.includes('מבחן מעשי בנהיגה');
  const isTrafficLiabilityForm =
    builtinTemplateKey === 'system-traffic-liability-annex' ||
    (docTitle.includes('אחריות אישית') && docTitle.includes('עבירות תנועה'));
  const isUpgradeForm =
    builtinTemplateKey === 'system-upgrade-request' || docTitle.includes('שדרוג');
  const isReturnForm =
    builtinTemplateKey === 'system-return-form' || docTitle.includes('החזרת רכב');
  const isReplacementUsageForm =
    builtinTemplateKey === 'system-replacement-usage' || docTitle.includes('שימוש ברכב חלופי');
  const now = new Date();
  const defaultDateIso = now.toISOString().slice(0, 10);
  const defaultTimeIso = now.toTimeString().slice(0, 5);
  const practicalRows = [
    'שליטה בהגה',
    'עצירה',
    'נסיעה לאחור',
    'שליטה כללית ברכב',
    'איתות',
    'מיקום בנתיבי הכביש',
    'מיקום בצמתים',
    'פניות',
    'ציות לתמרורים ורמזורים',
    'הסתכלות',
    'מהירות',
    'קצב נסיעה',
    'שמירת רווח מלפנים ומהצדדים',
  ];
  const practicalState = practicalTestUiByDocId[doc.id] ?? {
    checks: Object.fromEntries(practicalRows.map((row) => [row, ''])) as Record<string, 'pass' | 'fail' | ''>,
    date: defaultDateIso,
    time: defaultTimeIso,
    examinerName: '',
    result: '',
  };
  const trafficState = trafficLiabilityUiByDocId[doc.id] ?? {
    firstName: '',
    lastName: '',
    idNumber: '',
    fullAddress: '',
    mobile: '',
  };
  const upgradeState = upgradeUiByDocId[doc.id] ?? {
    vehicleNameToUpgrade: '',
    netUpgradeAmount: '',
    fullName: '',
  };
  const returnState = returnFormUiByDocId[doc.id] ?? {
    returnDate: defaultDateIso,
    returnTime: defaultTimeIso,
    odometer: '',
    fuel: '',
    damages: '',
    missingAccessories: '',
  };

  return (
    <div className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader title={doc.title} date={today} vehicleLabel={vehicleLabel} driverName={driverName} />
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        {isPracticalDrivingTestForm ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              מרכיבי המבחן: עבור כל פריט יש לסמן &quot;עבר&quot; או &quot;לא עבר&quot;.
            </p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-[520px] w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-center w-20">
                      <div className="flex flex-col items-center gap-1">
                        <span>עבר</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            setPracticalTestUiByDocId((prev) => ({
                              ...prev,
                              [doc.id]: {
                                ...practicalState,
                                checks: Object.fromEntries(practicalRows.map((row) => [row, 'pass'])) as Record<string, 'pass' | 'fail' | ''>,
                              },
                            }))
                          }
                        >
                          סמן הכל
                        </Button>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-center w-20">לא עבר</th>
                    <th className="px-3 py-2 text-right">פריט בדיקה</th>
                  </tr>
                </thead>
                <tbody>
                  {practicalRows.map((row, idx) => (
                    <tr key={`${doc.id}-${row}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="radio"
                          name={`practical-${doc.id}-${row}`}
                          checked={practicalState.checks[row] === 'pass'}
                          onChange={() =>
                            setPracticalTestUiByDocId((prev) => ({
                              ...prev,
                              [doc.id]: {
                                ...practicalState,
                                checks: { ...practicalState.checks, [row]: 'pass' },
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="radio"
                          name={`practical-${doc.id}-${row}`}
                          checked={practicalState.checks[row] === 'fail'}
                          onChange={() =>
                            setPracticalTestUiByDocId((prev) => ({
                              ...prev,
                              [doc.id]: {
                                ...practicalState,
                                checks: { ...practicalState.checks, [row]: 'fail' },
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{row}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-500">
              סעיפים: {practicalRows.map((row) => row).join(' | ')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-700 text-sm font-semibold">תאריך</Label>
                <Input
                  type="date"
                  value={practicalState.date || defaultDateIso}
                  onChange={(e) =>
                    setPracticalTestUiByDocId((prev) => ({
                      ...prev,
                      [doc.id]: { ...practicalState, date: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-slate-700 text-sm font-semibold">שעה</Label>
                <Input
                  type="time"
                  value={practicalState.time || defaultTimeIso}
                  onChange={(e) =>
                    setPracticalTestUiByDocId((prev) => ({
                      ...prev,
                      [doc.id]: { ...practicalState, time: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-slate-700 text-sm font-semibold">שם הבוחן</Label>
                <Input
                  value={practicalState.examinerName}
                  onChange={(e) =>
                    setPracticalTestUiByDocId((prev) => ({
                      ...prev,
                      [doc.id]: { ...practicalState, examinerName: e.target.value },
                    }))
                  }
                  placeholder="שם מלא"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-slate-700 text-sm font-semibold">תוצאת מבחן</Label>
                <div className="mt-1 flex items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`practical-result-${doc.id}`}
                      checked={practicalState.result === 'pass'}
                      onChange={() =>
                        setPracticalTestUiByDocId((prev) => ({
                          ...prev,
                          [doc.id]: { ...practicalState, result: 'pass' },
                        }))
                      }
                    />
                    עבר
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`practical-result-${doc.id}`}
                      checked={practicalState.result === 'fail'}
                      onChange={() =>
                        setPracticalTestUiByDocId((prev) => ({
                          ...prev,
                          [doc.id]: { ...practicalState, result: 'fail' },
                        }))
                      }
                    />
                    לא עבר
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : isTrafficLiabilityForm ? (
          <div className="space-y-4">
            <div className="space-y-2 text-sm text-slate-700 leading-6">
              {orgDocTemplateBody(doc.json_schema, doc.description)
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, idx) => (
                  <p key={`${doc.id}-${idx}`}>{line}</p>
                ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 pt-3">
              <div>
                <Label>שם</Label>
                <Input value={trafficState.firstName} onChange={(e) => setTrafficLiabilityUiByDocId((prev) => ({ ...prev, [doc.id]: { ...trafficState, firstName: e.target.value } }))} />
              </div>
              <div>
                <Label>שם משפחה</Label>
                <Input value={trafficState.lastName} onChange={(e) => setTrafficLiabilityUiByDocId((prev) => ({ ...prev, [doc.id]: { ...trafficState, lastName: e.target.value } }))} />
              </div>
              <div>
                <Label>מספר ת.ז</Label>
                <Input value={trafficState.idNumber} onChange={(e) => setTrafficLiabilityUiByDocId((prev) => ({ ...prev, [doc.id]: { ...trafficState, idNumber: e.target.value } }))} />
              </div>
              <div>
                <Label>נייד</Label>
                <Input value={trafficState.mobile} onChange={(e) => setTrafficLiabilityUiByDocId((prev) => ({ ...prev, [doc.id]: { ...trafficState, mobile: e.target.value } }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>כתובת מלאה</Label>
                <Input value={trafficState.fullAddress} onChange={(e) => setTrafficLiabilityUiByDocId((prev) => ({ ...prev, [doc.id]: { ...trafficState, fullAddress: e.target.value } }))} />
              </div>
            </div>
          </div>
        ) : isUpgradeForm ? (
          <div className="space-y-4">
            <div className="space-y-2 text-sm text-slate-700 leading-6">
              {orgDocTemplateBody(doc.json_schema, doc.description)
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, idx) => (
                  <p key={`${doc.id}-${idx}`}>{line}</p>
                ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 pt-3">
              <div>
                <Label>שם הרכב לשדרוג</Label>
                <Input value={upgradeState.vehicleNameToUpgrade} onChange={(e) => setUpgradeUiByDocId((prev) => ({ ...prev, [doc.id]: { ...upgradeState, vehicleNameToUpgrade: e.target.value } }))} />
              </div>
              <div>
                <Label>סכום שדרוג (נטו)</Label>
                <Input value={upgradeState.netUpgradeAmount} onChange={(e) => setUpgradeUiByDocId((prev) => ({ ...prev, [doc.id]: { ...upgradeState, netUpgradeAmount: e.target.value } }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>שם מלא</Label>
                <Input value={upgradeState.fullName} onChange={(e) => setUpgradeUiByDocId((prev) => ({ ...prev, [doc.id]: { ...upgradeState, fullName: e.target.value } }))} />
              </div>
            </div>
          </div>
        ) : isReturnForm ? (
          <div className="space-y-4">
            <div className="space-y-2 text-sm text-slate-700 leading-6">
              {orgDocTemplateBody(doc.json_schema, doc.description)
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, idx) => (
                  <p key={`${doc.id}-${idx}`}>{line}</p>
                ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 pt-3">
              <div>
                <Label>תאריך החזרה</Label>
                <Input type="date" value={returnState.returnDate || defaultDateIso} onChange={(e) => setReturnFormUiByDocId((prev) => ({ ...prev, [doc.id]: { ...returnState, returnDate: e.target.value } }))} />
              </div>
              <div>
                <Label>שעת החזרה</Label>
                <Input type="time" value={returnState.returnTime || defaultTimeIso} onChange={(e) => setReturnFormUiByDocId((prev) => ({ ...prev, [doc.id]: { ...returnState, returnTime: e.target.value } }))} />
              </div>
              <div>
                <Label>ק"מ בהחזרה</Label>
                <Input value={returnState.odometer} onChange={(e) => setReturnFormUiByDocId((prev) => ({ ...prev, [doc.id]: { ...returnState, odometer: e.target.value } }))} />
              </div>
              <div>
                <Label>רמת דלק בהחזרה</Label>
                <Input value={returnState.fuel} onChange={(e) => setReturnFormUiByDocId((prev) => ({ ...prev, [doc.id]: { ...returnState, fuel: e.target.value } }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>סימון נזקים</Label>
                <Input value={returnState.damages} onChange={(e) => setReturnFormUiByDocId((prev) => ({ ...prev, [doc.id]: { ...returnState, damages: e.target.value } }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>חוסר באביזרים</Label>
                <Input value={returnState.missingAccessories} onChange={(e) => setReturnFormUiByDocId((prev) => ({ ...prev, [doc.id]: { ...returnState, missingAccessories: e.target.value } }))} />
              </div>
            </div>
          </div>
        ) : isReplacementUsageForm ? (
          <div className="space-y-2 text-sm text-slate-700 leading-6">
            {orgDocTemplateBody(doc.json_schema, doc.description)
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, idx) => (
                <p key={`${doc.id}-${idx}`}>{line}</p>
              ))}
          </div>
        ) : (
          <div className="space-y-2 text-sm text-slate-700 leading-6">
            {orgDocTemplateBody(doc.json_schema, doc.description)
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, idx) => (
                <p key={`${doc.id}-${idx}`}>{line}</p>
              ))}
          </div>
        )}
      </div>
      <div className="mt-4">
        <Label className="text-slate-700 text-sm font-semibold block mb-1">הערות לטופס</Label>
        <Textarea
          value={genericFormNotes[doc.id] ?? ''}
          onChange={(e) =>
            setGenericFormNotes((prev) => ({ ...prev, [doc.id]: e.target.value }))
          }
          placeholder="הערות נוספות לטופס זה..."
          rows={3}
          className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-400 resize-none"
        />
      </div>
      <div className="mt-4">
        <SignatureBlock
          sigRef={genericSigRef}
          label="חתימת הנהג:"
          signatureKey={`generic-signature-${doc.id}`}
          onSign={(has) => setGenericSigOkByDocId((prev) => ({ ...prev, [doc.id]: has }))}
        />
        {genericSigOkByDocId[doc.id] && (
          <p className="mt-2 text-xs text-emerald-600">החתימה נשמרה לטופס זה.</p>
        )}
      </div>
    </div>
  );
}

/** DB may return null title for bad rows — never call .includes on raw doc.title */
function safeDocTitle(doc: { title?: string | null }): string {
  return String(doc?.title ?? '');
}

function getStepKindForDoc(doc: DeliveryFormDoc): WizardStepKind {
  const builtinKey = orgDocSchemaStringField(doc.json_schema, 'builtin_template_key').trim();
  const title = safeDocTitle(doc);
  if (doc.template_name === 'health' || builtinKey === 'system-health-statement') return 'health';
  if (doc.template_name === 'procedure' || builtinKey === 'system-vehicle-policy') return 'procedure';
  if (doc.template_name === 'license' || title.includes('רישיון')) return 'license';
  return 'generic';
}

// ─────────────────────────────────────────────
// Main Wizard
// ─────────────────────────────────────────────
export default function VehicleHandoverWizard() {
  const navigate = useNavigate();
  const { setDirty } = useVehicleSpecDirty();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: vehicles } = useVehicles();
  const { data: drivers  } = useDrivers();
  const { user, activeOrgId, profile } = useAuth();
  const handoverSettingsOrgId = activeOrgId ?? profile?.org_id ?? null;
  const { data: orgUiSettings } = useOrgSettings(handoverSettingsOrgId);
  const { data: orgDocuments } = useOrgDocuments();

  const routerState = useMemo((): VehicleHandoverWizardLocationState => {
    const s = location.state;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      return s as VehicleHandoverWizardLocationState;
    }
    return EMPTY_WIZARD_LOCATION_STATE;
  }, [location.state]);
  const stateVehicleId = routerState.vehicleId?.trim() ?? '';
  const stateDriverId = routerState.driverId?.trim() ?? '';
  const stateReportUrl = routerState.reportUrl?.trim() ?? '';
  const queryVehicleId = searchParams.get('vehicleId')?.trim() ?? '';
  const queryDriverId = searchParams.get('driverId')?.trim() ?? '';
  const queryReportUrl = decodeURIComponent(searchParams.get('reportUrl') ?? '').trim();

  const vehicleId  = stateVehicleId || queryVehicleId;
  const driverId   = stateDriverId || queryDriverId;
  const handoverTypeParam = searchParams.get('handoverType') ?? searchParams.get('type') ?? 'delivery';
  const handoverType = handoverTypeParam === 'return' ? 'return' : 'delivery';
  const selectedFormsParam = searchParams.get('selectedForms') ?? '';
  const reportUrl  = stateReportUrl || queryReportUrl;
  const handoverId = decodeURIComponent(searchParams.get('handoverId') ?? '');
  const odometerFromQuery = searchParams.get('odometer')?.trim() ?? '';
  const fuelLevelFromQuery = searchParams.get('fuelLevel')?.trim() ?? '';
  const damageNotesFromQuery = searchParams.get('damageNotes')?.trim() ?? '';

  useEffect(() => {
    const hasLegacyQueryValues = Boolean(queryVehicleId || queryDriverId || queryReportUrl);
    if (!hasLegacyQueryValues) return;

    const nextSearch = new URLSearchParams(searchParams);
    nextSearch.delete('vehicleId');
    nextSearch.delete('driverId');
    nextSearch.delete('reportUrl');

    const nextSearchString = nextSearch.toString();
    const nextState: VehicleHandoverWizardLocationState = {
      ...routerState,
      vehicleId: stateVehicleId || queryVehicleId,
      driverId: stateDriverId || queryDriverId,
      reportUrl: stateReportUrl || queryReportUrl,
    };

    navigate(
      {
        pathname: location.pathname,
        search: nextSearchString ? `?${nextSearchString}` : '',
      },
      { replace: true, state: nextState },
    );
  }, [
    location.pathname,
    navigate,
    queryDriverId,
    queryReportUrl,
    queryVehicleId,
    routerState,
    searchParams,
    stateDriverId,
    stateReportUrl,
    stateVehicleId,
  ]);

  // חסימת ניווט מתפריט בזמן אשף — סיידבר יציג התראה עד יציאה או סיום
  useEffect(() => {
    setDirty(DIRTY_SOURCE_HANDOVER_WIZARD, true);
    return () => setDirty(DIRTY_SOURCE_HANDOVER_WIZARD, false);
  }, [setDirty]);

  const vehicle = vehicles?.find(v => v.id === vehicleId);
  const driver  = drivers?.find(d => d.id === driverId);
  const driverExt: Pick<Driver, 'employee_number' | 'address'> = {
    employee_number: driver?.employee_number ?? null,
    address: driver?.address ?? null,
  };

  const vehicleLabel = vehicle
    ? `${vehicle.manufacturer} ${vehicle.model} (${vehicle.plate_number})`
    : vehicleId;
  const autoFillContext = buildFormsAutoFillContext({ user, driver, vehicle });
  const driverName = autoFillContext.employee_name || driverId;
  const today = new Date().toLocaleDateString('he-IL');
  const deliveryDateTime = new Date().toLocaleString('he-IL');

  const [manualFields, setManualFields] = useState<ReceptionManualFields>({
    idNumber: '',
    employeeNumber: '',
    phone: '',
    address: '',
    ignitionCode: '',
  });

  // Step state
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [skipLicenseStep, setSkipLicenseStep] = useState(false);

  // Sig refs
  const sig1Ref = useRef<SignaturePadRef>(null);
  const sig2Ref = useRef<SignaturePadRef>(null);
  const sig3Ref = useRef<SignaturePadRef>(null);
  const genericSigRef = useRef<SignaturePadRef>(null);



  // Wizard state
  const [accessories, setAccessories] = useState<AccessoryItem[]>(INITIAL_ACCESSORIES);
  const [sig1OK, setSig1OK] = useState(false);

  // Captured signature dataUrls — stored when user advances past each step
  // (SignaturePad components unmount on step change, refs go null)
  const [sig1DataUrl, setSig1DataUrl] = useState<string | null>(null);
  const [sig2DataUrl, setSig2DataUrl] = useState<string | null>(null);
  const [sig3DataUrl, setSig3DataUrl] = useState<string | null>(null);

  const [procedureRead, setProcedureRead] = useState(false);
  const [sig2OK, setSig2OK] = useState(false);

  const [healthItems, setHealthItems] = useState<HealthDeclaration[]>(INITIAL_HEALTH);
  const [healthNotes, setHealthNotes] = useState('');
  const [sig3OK, setSig3OK] = useState(false);
  const [genericFormApprovals, setGenericFormApprovals] = useState<Record<string, boolean>>({});
  const [genericFormNotes, setGenericFormNotes] = useState<Record<string, string>>({});
  const [genericSigOkByDocId, setGenericSigOkByDocId] = useState<Record<string, boolean>>({});
  const [genericSigDataUrlByDocId, setGenericSigDataUrlByDocId] = useState<Record<string, string>>({});
  const [practicalTestUiByDocId, setPracticalTestUiByDocId] = useState<Record<string, PracticalTestUiState>>({});
  const [trafficLiabilityUiByDocId, setTrafficLiabilityUiByDocId] = useState<Record<string, TrafficLiabilityUiState>>({});
  const [upgradeUiByDocId, setUpgradeUiByDocId] = useState<Record<string, UpgradeUiState>>({});
  const [returnFormUiByDocId, setReturnFormUiByDocId] = useState<Record<string, ReturnFormUiState>>({});
  const [selectedDeliveryFormIds, setSelectedDeliveryFormIds] = useState<string[]>([]);
  const [formsPickerOpen, setFormsPickerOpen] = useState(false);

  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [licenseClass,  setLicenseClass]  = useState('B');
  const [odometerReading, setOdometerReading] = useState(odometerFromQuery);
  const [fuelLevel, setFuelLevel] = useState(fuelLevelFromQuery);
  const [damageNotes, setDamageNotes] = useState(damageNotesFromQuery);
  const [damageReport, setDamageReport] = useState<VehicleDamageReport>(cloneEmptyDamageReport());
  const [licenseFront,  setLicenseFront]  = useState<File | null>(null);
  const [licenseBack,   setLicenseBack]   = useState<File | null>(null);
  const [recentlyToggledFormId, setRecentlyToggledFormId] = useState<string | null>(null);
  const [recentlyToggledAdded, setRecentlyToggledAdded] = useState(false);

  // All active forms (for backward compatibility)
  const availableDeliveryForms = useMemo(
    () => (orgDocuments ?? []).filter((doc) => doc.is_active),
    [orgDocuments],
  );


  // All forms except 'טופס קבלת רכב' for the picker
  const formsPickerForms = useMemo(
    () => availableDeliveryForms.filter((doc) => safeDocTitle(doc) !== 'טופס קבלת רכב'),
    [availableDeliveryForms],
  );
  const selectedFormsInitializedRef = useRef(false);

  useEffect(() => {
    // Set selectedDeliveryFormIds only if there is a query param, otherwise start empty
    if (availableDeliveryForms.length === 0) return;

    const fromQuery = selectedFormsParam
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const allowed = new Set(availableDeliveryForms.map((doc) => doc.id));
    if (!selectedFormsInitializedRef.current) {
      // Always start empty unless there is a query param
      let effective: string[] = [];
      if (fromQuery.length > 0) {
        effective = fromQuery.filter((id) => allowed.has(id));
      }
      setSelectedDeliveryFormIds(effective);
      selectedFormsInitializedRef.current = true;
      return;
    }

    setSelectedDeliveryFormIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [availableDeliveryForms, selectedFormsParam]);

  useEffect(() => {
    setManualFields({
      idNumber: driver?.id_number ?? '',
      employeeNumber: String(driverExt.employee_number ?? ''),
      phone: driver?.phone ?? '',
      address: String(driverExt.address ?? ''),
      ignitionCode: vehicle?.ignition_code ?? '',
    });
  }, [driver?.id, driver?.id_number, driver?.phone, driverExt.employee_number, driverExt.address, vehicle?.id, vehicle?.ignition_code]);

  useEffect(() => {
    setLicenseExpiry((prev) => prev || (driver?.license_expiry ?? ''));
  }, [driver?.id, driver?.license_expiry]);

  const selectedDeliveryForms = useMemo(() => {
    const selectedSet = new Set(selectedDeliveryFormIds);
    return availableDeliveryForms.filter((doc) => selectedSet.has(doc.id));
  }, [availableDeliveryForms, selectedDeliveryFormIds]);

  const receptionFormDoc = useMemo(() => {
    const inSelection = selectedDeliveryForms.find((doc) => safeDocTitle(doc).includes('טופס קבלת רכב'));
    if (inSelection) return inSelection;
    return (
      availableDeliveryForms.find((doc) => safeDocTitle(doc).includes('טופס קבלת רכב')) ?? null
    );
  }, [selectedDeliveryForms, availableDeliveryForms]);

  const receptionDeclarationText = orgDocTemplateBody(
    receptionFormDoc?.json_schema,
    receptionFormDoc?.description,
  ).trim();

  const procedureFormDoc = useMemo(
    () =>
      availableDeliveryForms.find(
        (doc) => doc.template_name === 'procedure' || safeDocTitle(doc).includes('נוהל'),
      ) ?? null,
    [availableDeliveryForms],
  );
  const healthFormDoc = useMemo(
    () =>
      availableDeliveryForms.find(
        (doc) => doc.template_name === 'health' || safeDocTitle(doc).includes('בריאות'),
      ) ?? null,
    [availableDeliveryForms],
  );

  const docProcedureText = useMemo(
    () => orgDocTemplateBody(procedureFormDoc?.json_schema, procedureFormDoc?.description).trim(),
    [procedureFormDoc],
  );
  const docHealthText = useMemo(
    () => orgDocTemplateBody(healthFormDoc?.json_schema, healthFormDoc?.description).trim(),
    [healthFormDoc],
  );
  const orgPolicyText = useMemo(
    () => String(orgUiSettings?.vehicle_policy_text ?? '').trim(),
    [orgUiSettings?.vehicle_policy_text],
  );
  const orgHealthText = useMemo(
    () => String(orgUiSettings?.health_statement_text ?? '').trim(),
    [orgUiSettings?.health_statement_text],
  );

  const procedureTemplateText = useMemo(
    () => docProcedureText || orgPolicyText,
    [docProcedureText, orgPolicyText],
  );
  const healthTemplateText = useMemo(
    () => docHealthText || orgHealthText,
    [docHealthText, orgHealthText],
  );

  const showOrgSettingsEmptyTextsWarning = useMemo(() => {
    const rowExists = Boolean(orgUiSettings?.id);
    return rowExists && !orgPolicyText && !orgHealthText;
  }, [orgUiSettings?.id, orgPolicyText, orgHealthText]);

  const parsedClauses = useMemo(() => parsePolicyClauses(procedureTemplateText), [procedureTemplateText]);
  const fallbackProcedureClauses = useMemo(
    () => parseProcedureClausesFromTemplateFallback(procedureTemplateText),
    [procedureTemplateText],
  );
  const activeClauses = parsedClauses.length > 0
    ? parsedClauses
    : fallbackProcedureClauses.length > 0
      ? fallbackProcedureClauses
      : PROCEDURE_CLAUSES;
  const parsedHealthItems = useMemo(() => parseHealthItems(healthTemplateText), [healthTemplateText]);
  const fallbackHealthItems = useMemo(
    () => parseHealthItemsFromTemplateFallback(healthTemplateText),
    [healthTemplateText],
  );
  const activeHealthItems = parsedHealthItems.length > 0
    ? parsedHealthItems
    : fallbackHealthItems.length > 0
      ? fallbackHealthItems
      : INITIAL_HEALTH;

  useEffect(() => {
    if (activeHealthItems.length === 0) return;
    setHealthItems((prev) => {
      const hasUserProgress = prev.some((item) => item.checked);
      if (hasUserProgress) return prev;
      return activeHealthItems;
    });
  }, [activeHealthItems]);

  useEffect(() => {
    const parsedAccessories = parseAccessoriesFromTemplate(receptionDeclarationText);
    if (parsedAccessories.length === 0) return;
    setAccessories((prev) => {
      const hasUserProgress = prev.some((item) => item.checked || item.missing || item.notes.trim().length > 0);
      if (hasUserProgress) return prev;
      return parsedAccessories;
    });
  }, [receptionDeclarationText]);

  const requiredStep1FieldsMissing = useMemo(() => {
    const missing: Array<{ key: keyof ReceptionManualFields; label: string }> = [];
    if (!manualFields.idNumber.trim()) missing.push({ key: 'idNumber', label: 'מספר תעודת זהות' });
    if (!manualFields.employeeNumber.trim()) missing.push({ key: 'employeeNumber', label: 'מספר עובד' });
    if (!manualFields.address.trim()) missing.push({ key: 'address', label: 'כתובת' });
    if (!manualFields.phone.trim()) missing.push({ key: 'phone', label: 'טלפון' });
    if (!manualFields.ignitionCode.trim()) missing.push({ key: 'ignitionCode', label: 'קוד קודנית' });
    return missing;
  }, [manualFields.address, manualFields.employeeNumber, manualFields.idNumber, manualFields.ignitionCode, manualFields.phone]);

  const requiredStep1FieldsInvalid = useMemo(() => {
    const invalid: string[] = [];
    if (manualFields.idNumber.trim() && !idNumberRegex.test(manualFields.idNumber.trim())) invalid.push('מספר ת"ז בן 9 ספרות');
    if (manualFields.phone.trim() && !phoneRegex.test(manualFields.phone.trim())) invalid.push('טלפון תקין');
    if (manualFields.ignitionCode.trim() && !ignitionCodeRegex.test(manualFields.ignitionCode.trim())) {
      invalid.push('קוד קודנית בן 4-6 ספרות');
    }
    return invalid;
  }, [manualFields.idNumber, manualFields.ignitionCode, manualFields.phone]);

  const step1FieldErrors = useMemo<ReceptionFieldErrors>(() => {
    const errors: ReceptionFieldErrors = {};
    const idNumber = manualFields.idNumber.trim();
    const employeeNumber = manualFields.employeeNumber.trim();
    const phone = manualFields.phone.trim();
    const address = manualFields.address.trim();
    const ignitionCode = manualFields.ignitionCode.trim();

    if (!idNumber) {
      errors.idNumber = 'נא למלא מספר תעודת זהות';
    } else if (!idNumberRegex.test(idNumber)) {
      errors.idNumber = 'מספר תעודת זהות חייב להכיל 9 ספרות';
    }

    if (!employeeNumber) {
      errors.employeeNumber = 'נא למלא מספר עובד';
    }

    if (!phone) {
      errors.phone = 'נא למלא מספר טלפון נייד';
    } else if (!phoneRegex.test(phone)) {
      errors.phone = 'מספר טלפון לא תקין (יש להזין 05X...)';
    }

    if (!address) {
      errors.address = 'נא למלא כתובת מלאה (עיר ורחוב)';
    } else if (address.length < 5) {
      errors.address = 'כתובת חייבת להכיל לפחות 5 תווים';
    }

    if (!ignitionCode) {
      errors.ignitionCode = 'נא למלא קוד קודנית';
    } else if (!ignitionCodeRegex.test(ignitionCode)) {
      errors.ignitionCode = 'קוד קודנית חייב להכיל 4-6 ספרות';
    }

    return errors;
  }, [manualFields.address, manualFields.employeeNumber, manualFields.idNumber, manualFields.ignitionCode, manualFields.phone]);

  const firstStep1ProblemLabel = useMemo(() => {
    const orderedFields: Array<{ key: keyof ReceptionManualFields; label: string }> = [
      { key: 'idNumber', label: 'מספר תעודת זהות' },
      { key: 'employeeNumber', label: 'מספר עובד' },
      { key: 'phone', label: 'טלפון נייד' },
      { key: 'address', label: 'כתובת העובד' },
      { key: 'ignitionCode', label: 'קוד קודנית' },
    ];
    const firstFieldWithError = orderedFields.find((field) => Boolean(step1FieldErrors[field.key]));
    if (firstFieldWithError) return firstFieldWithError.label;
    const accessoriesComplete = accessories.every((item) => item.checked || item.missing);
    if (!accessoriesComplete) return 'טבלת האביזרים';
    if (!sig1OK) return 'חתימת הנהג';
    return null;
  }, [accessories, sig1OK, step1FieldErrors]);

  const manualFieldsValid = useMemo(() => {
    const requiredFields: Array<keyof ReceptionManualFields> = ['idNumber', 'employeeNumber', 'phone', 'address', 'ignitionCode'];
    for (const field of requiredFields) {
      const value = (manualFields[field] ?? '').trim();
      if (!value) return false;
      if (field === 'idNumber' && !idNumberRegex.test(value)) return false;
      if (field === 'phone' && !phoneRegex.test(value)) return false;
      if (field === 'address' && value.length < 5) return false;
      if (field === 'ignitionCode' && !ignitionCodeRegex.test(value)) return false;
    }
    return true;
  }, [manualFields]);

  // Allow both checked (✓) and missing (✗) as valid selections
  const allAccessoriesChecked = useMemo(() => accessories.every((a) => a.checked || a.missing), [accessories]);
  const canSignReception = manualFieldsValid && allAccessoriesChecked;
  // Count missing required fields: accessories and manual fields
  const step1MissingRequiredCount = requiredStep1FieldsMissing.length + accessories.filter(a => !a.checked && !a.missing).length;

  useEffect(() => {
    if (!canSignReception && sig1OK) {
      setSig1OK(false);
    }
  }, [canSignReception, sig1OK]);

  const wizardSteps = useMemo<WizardStep[]>(() => {
    const steps: WizardStep[] = [...BASE_STEPS];
    const dynamicSteps = selectedDeliveryFormIds
      .map((id) => availableDeliveryForms.find((f) => f.id === id && safeDocTitle(f) !== 'טופס קבלת רכב'))
      .filter(Boolean)
      .map((doc) => ({
        icon: FileText,
        label: (doc as DeliveryFormDoc).title,
        kind: getStepKindForDoc(doc as DeliveryFormDoc),
        docId: (doc as DeliveryFormDoc).id,
      }));
    return [...steps, ...dynamicSteps];
  }, [selectedDeliveryFormIds, availableDeliveryForms]);

  const currentStepDef = wizardSteps[step];

  const canAdvance = useMemo(() => {
    if (!currentStepDef) return false;

    if (currentStepDef.kind === 'reception') {
      return sig1OK && allAccessoriesChecked && manualFieldsValid;
    }
    if (currentStepDef.kind === 'procedure') {
      return sig2OK && procedureRead;
    }
    if (currentStepDef.kind === 'health') {
      return sig3OK && healthItems.every((h) => h.checked);
    }
    if (currentStepDef.kind === 'license') {
      return true;
    }
    if (currentStepDef.kind === 'generic' && currentStepDef.docId) {
      return !!genericSigOkByDocId[currentStepDef.docId];
    }
    return false;
  }, [
    allAccessoriesChecked,
    currentStepDef,
    genericSigOkByDocId,
    healthItems,
    manualFieldsValid,
    procedureRead,
    sig1OK,
    sig2OK,
    sig3OK,
  ]);

  const hasLicenseStep = useMemo(() => wizardSteps.some((wizardStep) => wizardStep.kind === 'license'), [wizardSteps]);
  const hasProcedureStep = useMemo(() => wizardSteps.some((wizardStep) => wizardStep.kind === 'procedure'), [wizardSteps]);
  const hasHealthStep = useMemo(() => wizardSteps.some((wizardStep) => wizardStep.kind === 'health'), [wizardSteps]);

  // ── Upload helper — always targets the public vehicle-documents bucket ──
  const uploadFileToStorage = async (file: File, path: string): Promise<string | null> => {
    try {
      const { error } = await supabase.storage
        .from('vehicle-documents')
        .upload(path, file, { upsert: true });
      if (error) {
        console.error(`[Wizard] storage upload failed for "${path}":`, error.message);
        return null;
      }
      const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
      console.log(`[Wizard] uploaded OK → ${path}`);
      return data.publicUrl;
    } catch (e) {
      console.error(`[Wizard] storage upload exception for "${path}":`, e);
      return null;
    }
  };

  // ── Upload a Blob directly to vehicle-documents (used for generated PDFs) ──
  const uploadBlobToStorage = async (blob: Blob, path: string): Promise<string | null> => {
    try {
      const { error } = await supabase.storage
        .from('vehicle-documents')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (error) {
        console.error(`[Wizard] PDF upload failed for "${path}":`, error.message);
        return null;
      }
      const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
      console.log(`[Wizard] PDF uploaded OK → ${path}`);
      return data.publicUrl;
    } catch (e) {
      console.error(`[Wizard] PDF upload exception for "${path}":`, e);
      return null;
    }
  };

  // ── Final submit ──
  const handleFinish = async () => {
    setSubmitting(true);
    const effectiveSig1DataUrl = sig1DataUrl ?? sig1Ref.current?.getDataUrl() ?? null;
    const effectiveSig2DataUrl = sig2DataUrl ?? sig2Ref.current?.getDataUrl() ?? null;
    const effectiveSig3DataUrl = sig3DataUrl ?? sig3Ref.current?.getDataUrl() ?? null;
    const effectiveGenericSigDataUrlByDocId = { ...genericSigDataUrlByDocId };
    if (currentStepDef?.kind === 'generic' && currentStepDef.docId) {
      const latestCurrentGenericSig = genericSigRef.current?.getDataUrl() ?? null;
      if (latestCurrentGenericSig) {
        effectiveGenericSigDataUrlByDocId[currentStepDef.docId] = latestCurrentGenericSig;
      }
    }

    // ── Step 1: Generate PDFs (each failure is isolated) ──────────────────────
    console.log('[Wizard] handleFinish start', { vehicleId, driverId, handoverId, reportUrl });
    // Unique storage path at submit time (not render)
    // eslint-disable-next-line react-hooks/purity -- event handler: folder name must be unique per completion
    const ts = Date.now();
    const folder = `documents/${vehicleId || 'unknown'}/${ts}`;

    const deliveryPdfBase = {
      vehicleLabel,
      driverName,
      date: today,
    };
    const [pdf1Blob, pdf2Blob, pdf3Blob] = await Promise.all([
      generateReceptionPDF({
        ...deliveryPdfBase,
        accessories,
        signatureDataUrl: effectiveSig1DataUrl,
        declarationText: extractCommitmentSection(receptionDeclarationText).join('\n'),
        manualFields,
      })
        .catch((e) => { console.error('[Wizard] PDF1 failed:', e); return null; }),
      hasProcedureStep
        ? generateProcedurePDF({
            ...deliveryPdfBase,
            formTitle: procedureFormDoc?.title,
            clauses: activeClauses,
            approvedRead: procedureRead,
            signatureDataUrl: effectiveSig2DataUrl,
          })
            .catch((e) => { console.error('[Wizard] PDF2 failed:', e); return null; })
        : Promise.resolve(null),
      hasHealthStep
        ? generateHealthDeclarationPDF({ ...deliveryPdfBase, healthItems, notes: healthNotes, signatureDataUrl: effectiveSig3DataUrl })
            .catch((e) => { console.error('[Wizard] PDF3 failed:', e); return null; })
        : Promise.resolve(null),
    ]);
    console.log('[Wizard] PDF blobs:', { pdf1: !!pdf1Blob, pdf2: !!pdf2Blob, pdf3: !!pdf3Blob });

    // ── Step 2: Upload all files (each failure is isolated) ───────────────────
    const [sig1Url, sig2Url, sig3Url, frontUrl, backUrl] = await Promise.all([
      pdf1Blob ? uploadBlobToStorage(pdf1Blob, `${folder}/reception_${ts}.pdf`)  : Promise.resolve(null),
      pdf2Blob ? uploadBlobToStorage(pdf2Blob, `${folder}/procedure_${ts}.pdf`)  : Promise.resolve(null),
      pdf3Blob ? uploadBlobToStorage(pdf3Blob, `${folder}/health_${ts}.pdf`)     : Promise.resolve(null),
      hasLicenseStep && !skipLicenseStep && licenseFront ? uploadFileToStorage(licenseFront, `${folder}/license_front_${ts}.jpg`) : Promise.resolve(null),
      hasLicenseStep && !skipLicenseStep && licenseBack  ? uploadFileToStorage(licenseBack,  `${folder}/license_back_${ts}.jpg`)  : Promise.resolve(null),
    ]);
    console.log('[Wizard] Upload URLs:', { sig1Url, sig2Url, sig3Url, frontUrl, backUrl });

    const genericSelectedDocs = selectedDeliveryFormIds
      .map((id) => availableDeliveryForms.find((form) => form.id === id))
      .filter((doc): doc is DeliveryFormDoc => Boolean(doc && getStepKindForDoc(doc as DeliveryFormDoc) === 'generic'));

    const genericGeneratedUrlByDocId = new Map<string, string>();
    if (genericSelectedDocs.length > 0) {
      const genericResults = await Promise.all(
        genericSelectedDocs.map(async (doc) => {
          const templateText = orgDocTemplateBody(doc.json_schema, doc.description).trim();
          if (!templateText) return { docId: doc.id, url: null as string | null };
          const practicalUi = practicalTestUiByDocId[doc.id];
          const trafficUi = trafficLiabilityUiByDocId[doc.id];
          const upgradeUi = upgradeUiByDocId[doc.id];
          const returnUi = returnFormUiByDocId[doc.id];
          const genericBlob = await generateGenericFormPDF({
            title: doc.title,
            builtinTemplateKey: orgDocSchemaStringField(doc.json_schema, 'builtin_template_key'),
            vehicleLabel,
            driverName,
            date: today,
            templateText,
            notes: genericFormNotes[doc.id] ?? '',
            signatureDataUrl: effectiveGenericSigDataUrlByDocId[doc.id] ?? null,
            returnDateTime: deliveryDateTime,
            fuelLevel: parseFuelLevel(fuelLevel),
            damageReport,
            missingAccessories: accessories.filter((item) => item.missing).map((item) => item.name),
            practicalTestUi: practicalUi,
            trafficLiabilityUi: trafficUi,
            upgradeUi,
            returnFormUi: returnUi,
            receptionFields: {
              idNumber: manualFields.idNumber.trim(),
              employeeNumber: manualFields.employeeNumber.trim(),
              phone: manualFields.phone.trim(),
              address: manualFields.address.trim(),
              ignitionCode: manualFields.ignitionCode.trim(),
            },
          }).catch((e) => {
            console.error(`[Wizard] generic PDF generation failed for "${doc.title}":`, e);
            return null;
          });
          if (!genericBlob) return { docId: doc.id, url: null as string | null };
          const url = await uploadBlobToStorage(genericBlob, `${folder}/generic_${doc.id}_${ts}.pdf`);
          return { docId: doc.id, url };
        }),
      );
      genericResults.forEach(({ docId, url }) => {
        if (url) genericGeneratedUrlByDocId.set(docId, url);
      });
    }

    // ── Step 3: Build attachment list from selected forms only ──────────────────
    const selectedForms = [...selectedDeliveryFormIds];
    const selectedFormsSet = new Set(selectedForms);
    const selectedFormCandidates = selectedForms
      .filter((id) => id !== receptionFormDoc?.id)
      .map((id) => {
        const doc = availableDeliveryForms.find((form) => form.id === id);
        if (!doc) return null;
        const kind = getStepKindForDoc(doc as DeliveryFormDoc);
        if (kind === 'procedure') {
          return { id, filename: `${doc.title}.pdf`, url: sig2Url ?? (doc.file_url as string | null) };
        }
        if (kind === 'health') {
          return { id, filename: `${doc.title}.pdf`, url: sig3Url ?? (doc.file_url as string | null) };
        }
        if (kind === 'license') {
          return { id, filename: `${doc.title}.jpg`, url: frontUrl ?? backUrl ?? (doc.file_url as string | null) };
        }
        return { id, filename: `${doc.title}.pdf`, url: genericGeneratedUrlByDocId.get(id) ?? (doc.file_url as string | null) };
      })
      .filter(Boolean) as Array<{ id: string; filename: string; url: string | null }>;

    const allAttachments: { filename: string; url: string }[] = [];
    if (sig1Url) {
      allAttachments.push({
        filename: `${receptionFormDoc?.title || 'טופס קבלת רכב'}.pdf`,
        url: sig1Url,
      });
    }
    selectedFormCandidates.forEach((candidate) => {
      if (!selectedFormsSet.has(candidate.id) || !candidate.url) return;
      allAttachments.push({ filename: candidate.filename, url: candidate.url });
    });

    const expectedAttachments = selectedForms.length;
    const hasReceptionAttachment = allAttachments.some((file) => file.filename.includes('טופס קבלת רכב'));
    console.log('[Wizard] reception attachment check', { hasReceptionAttachment, selectedForms, attachmentNames: allAttachments.map((file) => file.filename) });
    const failedCount = expectedAttachments - allAttachments.length;
    console.log(`[Wizard] ${allAttachments.length} attachments ready, ${failedCount} failed`);

    // ── Step 4: Send email — ALWAYS, regardless of upload failures ────────────
    try {
      const assignmentMode = (searchParams.get('mode') === 'replacement' ? 'replacement' : 'permanent') as 'replacement' | 'permanent';
      const latestOdometerReading = parseOdometerReading(odometerReading);
      const latestFuelLevel = parseFuelLevel(fuelLevel);
      const missingAccessories = accessories.filter((item) => item.missing).map((item) => item.name);
      const accessoriesSummary = missingAccessories.length > 0
        ? `חסרים: ${missingAccessories.join(', ')}`
        : 'ללא חוסרים';
      const wizardState = {
        data: {
          odometerReading: latestOdometerReading,
          fuelLevel: latestFuelLevel,
          damageSummary: buildUnifiedDamageSummary(damageReport, damageNotes),
          vehicleLabel,
          driverName,
          receptionForm: {
            idNumber: manualFields.idNumber.trim(),
            employeeNumber: manualFields.employeeNumber.trim(),
            phone: manualFields.phone.trim(),
            address: manualFields.address.trim(),
            ignitionCode: manualFields.ignitionCode.trim(),
            accessoriesSummary,
          },
        },
      };
      const latestNotes = [healthNotes.trim()].filter(Boolean).join(' | ') || null;
      await sendHandoverNotificationEmail({
        handoverId,
        vehicleId,
        handoverType,
        assignmentMode,
        vehicleLabel: wizardState.data.vehicleLabel,
        driverLabel: wizardState.data.driverName,
        odometerReading: Number.isNaN(wizardState.data.odometerReading) ? 0 : wizardState.data.odometerReading,
        fuelLevel: Number.isNaN(wizardState.data.fuelLevel) ? 0 : wizardState.data.fuelLevel,
        notes:           latestNotes,
        damageSummary: wizardState.data.damageSummary,
        receptionFormData: wizardState.data.receptionForm,
        reportUrl,
        additionalAttachments: allAttachments,
      });
      console.log('[Wizard] Email sent OK');
      toast.success(
        failedCount > 0
          ? `המייל נשלח עם ${allAttachments.length} מתוך ${expectedAttachments} קבצים`
          : 'כל המסמכים נחתמו ונשלח מייל בהצלחה!',
      );
    } catch (emailErr) {
      const message = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error('[Wizard] Email failed:', message);
      if (emailErr instanceof Error && emailErr.stack) {
        console.error('[Wizard] Email stack:', emailErr.stack);
      }
      toast.success('המסמכים נשמרו. שליחת המייל נכשלה.');
    }

    // ── Step 5: Persist to DB (failures here do NOT block navigation) ─────────
    try {
      const docsToInsert = [
        sig1Url  && { driver_id: driverId, file_url: sig1Url,  title: `אישור קבלת רכב | ${vehicleLabel}` },
        sig2Url  && { driver_id: driverId, file_url: sig2Url,  title: `התחייבות נוהל שימוש ברכב | ${vehicleLabel}` },
        sig3Url  && { driver_id: driverId, file_url: sig3Url,  title: `הצהרת בריאות חתומה | ${vehicleLabel}` },
        hasLicenseStep && frontUrl && { driver_id: driverId, file_url: frontUrl, title: `רישיון נהיגה (קדמי) | מס׳: ${licenseNumber}` },
        hasLicenseStep && backUrl  && { driver_id: driverId, file_url: backUrl,  title: `רישיון נהיגה (אחורי) | תוקף: ${licenseExpiry}` },
      ].filter(Boolean);

      if (docsToInsert.length > 0) {
        const { error: insertErr } = await supabase.from('driver_documents').insert(docsToInsert as never);
        if (insertErr) console.error('[Wizard] driver_documents insert error:', insertErr.message);
      }

      if (driverId) {
        const { error: updateErr } = await supabase.from('drivers').update({
          id_number:         manualFields.idNumber.trim() || undefined,
          employee_number:   manualFields.employeeNumber.trim() || undefined,
          phone:             manualFields.phone.trim() || undefined,
          address:           manualFields.address.trim() || undefined,
          license_number:    hasLicenseStep ? (licenseNumber || undefined) : undefined,
          license_expiry:    hasLicenseStep ? (licenseExpiry || undefined) : undefined,
          license_front_url: hasLicenseStep ? (frontUrl || undefined) : undefined,
          license_back_url:  hasLicenseStep ? (backUrl || undefined) : undefined,
        }).eq('id', driverId);
        if (updateErr) console.error('[Wizard] drivers update error:', updateErr.message);
      }

      if (vehicleId && !(vehicle?.ignition_code ?? '').trim() && manualFields.ignitionCode.trim()) {
        const { error: vehicleUpdateErr } = await supabase
          .from('vehicles')
          .update({ ignition_code: manualFields.ignitionCode.trim() })
          .eq('id', vehicleId);
        if (vehicleUpdateErr) console.error('[Wizard] vehicles update error:', vehicleUpdateErr.message);
      }
    } catch (dbErr) {
      console.error('[Wizard] DB persist error (non-blocking):', dbErr);
    }

    setSubmitting(false);
    setDirty(DIRTY_SOURCE_HANDOVER_WIZARD, false);
    navigate(vehicleId ? `/vehicles/${vehicleId}` : '/vehicles');
  };

  // ── Memoized input handler for manual fields ──
  const onManualFieldChange = useCallback((field: keyof ReceptionManualFields, value: string) => {
    setManualFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[#0d1b2e]/95 backdrop-blur-sm border-b border-white/10">
        <div className="container py-3 flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white"
            title="חזרה"
            aria-label="חזרה"
            onClick={() => {
              setDirty(DIRTY_SOURCE_HANDOVER_WIZARD, false);
              const fallback = vehicleId ? `/vehicles/${vehicleId}` : '/vehicles';
              if (typeof window !== 'undefined' && window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(fallback);
              }
            }}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg leading-tight">{handoverType === 'return' ? 'אשף החזרת רכב' : 'אשף מסירת רכב'}</h1>
            <p className="text-xs text-cyan-400/70">{vehicleLabel}</p>
          </div>
          <div className="mr-auto">
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-cyan-500/20 text-cyan-300 border-cyan-400/30">
              שלב {step + 1} מתוך {wizardSteps.length}
            </span>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-32 max-w-3xl mx-auto">
        <ProgressBar current={step} steps={wizardSteps} />

        {showOrgSettingsEmptyTextsWarning && (
          <div
            className="mb-4 flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
            role="alert"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
            <p className="leading-snug">
              קיימת רשומת הגדרות ארגון, אך טקסט נוהל הרכב והצהרת הבריאות ריקים. האשף נפתח עם תוכן ברירת מחדל.
              מומלץ למלא את הטקסטים ב&quot;הגדרות ארגון&quot; או לסנכרן מסמכי מערכת ממרכז הטפסים.
            </p>
          </div>
        )}

        {/* כפתור הוספת טפסים כ-FAB draggable */}
        <div
          style={{ position: 'fixed', bottom: 100, left: 40, zIndex: 1000, cursor: 'grab' }}
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('text/plain', '');
            e.currentTarget.style.opacity = '0.5';
          }}
          onDragEnd={e => {
            const x = e.clientX;
            const y = e.clientY;
            e.currentTarget.style.left = x + 'px';
            e.currentTarget.style.top = y + 'px';
            e.currentTarget.style.opacity = '1';
          }}
        >
          <Button
            type="button"
            onClick={() => setFormsPickerOpen((prev) => !prev)}
            variant="outline"
            size="sm"
            className="bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
          >
            <Plus className="w-4 h-4 mr-1" /> הוספת טפסים
          </Button>
        </div>

        {formsPickerOpen && (
          <div className="fixed inset-x-4 bottom-24 z-40 max-h-[58vh] overflow-y-auto rounded-2xl border border-cyan-300/30 bg-[#08182d]/95 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)] sm:left-auto sm:right-6 sm:w-[520px]" dir="rtl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-100">טפסים למסירה זו</h3>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFormsPickerOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="mb-3 text-xs text-cyan-200/70">ניתן להוסיף/להסיר גם תוך כדי המסירה.</p>

            <div className="space-y-2">
              {formsPickerForms.length === 0 ? (
                <p className="text-xs text-cyan-100/70">לא נמצאו טפסים פעילים במרכז הטפסים.</p>
              ) : (
                formsPickerForms.map((doc) => {
                  const selected = selectedDeliveryFormIds.includes(doc.id);
                  const wasJustToggled = recentlyToggledFormId === doc.id;
                  return (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selected
                          ? 'border-emerald-400/60 bg-emerald-500/15'
                          : 'border-cyan-400/15 bg-[#061325]/70'
                      } ${wasJustToggled ? 'ring-1 ring-emerald-400/80' : ''}`}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setSelectedDeliveryFormIds((current) => {
                            // Push new form if not already present, preserve order
                            if (isChecked && !current.includes(doc.id)) return [...current, doc.id];
                            if (!isChecked) return current.filter((id) => id !== doc.id);
                            return current;
                          });
                          setRecentlyToggledFormId(doc.id);
                          setRecentlyToggledAdded(isChecked);
                          setTimeout(() => setRecentlyToggledFormId((prev) => (prev === doc.id ? null : prev)), 900);
                        }}
                      />
                      <span className={selected ? 'text-emerald-100' : 'text-cyan-50'}>{doc.title}</span>
                      {wasJustToggled && (
                        <span className={`text-xs font-semibold ${recentlyToggledAdded ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {recentlyToggledAdded ? 'נוסף' : 'הוסר'}
                        </span>
                      )}
                      {doc.file_url && (
                        <button
                          type="button"
                          className="mr-auto text-xs text-cyan-300 hover:text-cyan-200"
                          onClick={() => window.open(doc.file_url as string, '_blank', 'noopener,noreferrer')}
                        >
                          פתיחה
                        </button>
                      )}
                    </label>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex justify-end border-t border-cyan-400/15 pt-3">
              <Button type="button" className="bg-emerald-500 hover:bg-emerald-400 text-[#020617] font-semibold" onClick={() => setFormsPickerOpen(false)}>
                אישור
              </Button>
            </div>
          </div>
        )}

        {renderStepContent({
          stepIdx: step,
          wizardSteps,
          availableDeliveryForms: availableDeliveryForms as DeliveryFormDoc[],
          accessories,
          setAccessories,
          sig1Ref,
          setSig1OK,
          vehicleLabel,
          driverName,
          today,
          deliveryDateTime,
          receptionDeclarationText,
          manualFields,
          step1FieldErrors,
          onManualFieldChange,
          canSignReception,
          healthItems,
          setHealthItems,
          healthNotes,
          setHealthNotes,
          sig3Ref,
          setSig3OK,
          procedureRead,
          setProcedureRead,
          sig2Ref,
          setSig2OK,
          activeClauses,
          licenseNumber,
          setLicenseNumber,
          licenseExpiry,
          setLicenseExpiry,
          licenseClass,
          setLicenseClass,
          odometerReading,
          setOdometerReading,
          fuelLevel,
          setFuelLevel,
          damageNotes,
          setDamageNotes,
          damageReport,
          setDamageReport,
          licenseFront,
          setLicenseFront,
          licenseBack,
          setLicenseBack,
          skipLicenseStep,
          genericFormApprovals,
          setGenericFormApprovals,
          genericFormNotes,
          setGenericFormNotes,
          genericSigRef,
          genericSigOkByDocId,
          setGenericSigOkByDocId,
          practicalTestUiByDocId,
          setPracticalTestUiByDocId,
          trafficLiabilityUiByDocId,
          setTrafficLiabilityUiByDocId,
          upgradeUiByDocId,
          setUpgradeUiByDocId,
          returnFormUiByDocId,
          setReturnFormUiByDocId,
        })}
      </main>

      {/* Floating navigation controls (outside form card) */}
      <div className="fixed bottom-6 left-0 right-0 z-30 pointer-events-none">
        <div className="container max-w-5xl mx-auto relative min-h-[64px]">
          {step > 0 && (
            <div className="absolute right-4 bottom-0 pointer-events-auto">
              <Button
                variant="ghost"
                className="gap-2 text-white/70 hover:text-white"
                onClick={() => setStep(s => s - 1)}
                disabled={submitting}
              >
                <ArrowRight className="h-4 w-4" />
                הקודם
              </Button>
            </div>
          )}

          {!canAdvance && (
            <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-6 whitespace-nowrap text-xs text-amber-400/90">
              {currentStepDef?.kind === 'reception' && (firstStep1ProblemLabel
                ? `שדה בעייתי: ${firstStep1ProblemLabel}`
                : 'נדרשת חתימה להמשך')}
              {currentStepDef?.kind === 'procedure' && (!procedureRead ? 'סמן קראתי והבנתי להמשך' : 'נדרשת חתימה להמשך')}
              {currentStepDef?.kind === 'health' && (!healthItems.every(h => h.checked) ? 'סמן את כל סעיפי הבריאות' : 'נדרשת חתימה להמשך')}
              {currentStepDef?.kind === 'license' && (
                skipLicenseStep
                  ? 'שלב צילום הרישיון סומן כדילוג'
                  : (!odometerReading ? "חסר קילומטראז'" :
                    !fuelLevel ? 'חסרה רמת דלק' :
                    'חסר תוקף רישיון')
              )}
              {currentStepDef?.kind === 'generic' && 'יש לחתום לפני המשך'}
            </p>
          )}

          {step < wizardSteps.length - 1 ? (
            <div className="absolute left-4 bottom-0 pointer-events-auto">
              <Button
                onClick={async () => {
                  // Step-specific validation toasts before advancing
                  if (step === 0) {
                    if (requiredStep1FieldsMissing.length > 0) {
                      const labels = requiredStep1FieldsMissing.map((item) => item.label);
                      toast.error(`נא למלא ${joinHebrewList(labels)}`);
                      return;
                    }
                    if (!allAccessoriesChecked) {
                      toast.error('יש לסמן את כל האביזרים בטבלת הקבלה לפני המשך');
                      return;
                    }
                    if (requiredStep1FieldsInvalid.length > 0) {
                      toast.error(`נא להזין ${joinHebrewList(requiredStep1FieldsInvalid)}`);
                      return;
                    }
                    if (!manualFieldsValid) {
                      toast.error('יש להשלים מספר תעודת זהות, מספר עובד, כתובת, טלפון תקין וקוד קודנית תקין לפני המשך');
                      return;
                    }
                  }
                  if (currentStepDef?.kind === 'procedure' && !procedureRead) {
                    toast.error('יש לאשר את קריאת הסעיפים בטרם המעבר');
                    return;
                  }
                  if (currentStepDef?.kind === 'procedure' && !sig2OK) {
                    toast.error('נדרשת חתימה בטופס זה לפני המשך');
                    return;
                  }
                  if (currentStepDef?.kind === 'health' && !healthItems.every((h) => h.checked)) {
                    toast.error('עליך לאשר את כל סעיפי הבריאות כדי להמשיך');
                    return;
                  }
                  if (currentStepDef?.kind === 'generic' && currentStepDef.docId && !genericSigOkByDocId[currentStepDef.docId]) {
                    toast.error('נדרשת חתימה בטופס זה לפני המשך');
                    return;
                  }
                  if (!canAdvance) return;
                  // Capture raw signature dataUrl from ref before the step unmounts
                  if (currentStepDef?.kind === 'reception') setSig1DataUrl(sig1Ref.current?.getDataUrl() ?? null);
                  if (currentStepDef?.kind === 'procedure') setSig2DataUrl(sig2Ref.current?.getDataUrl() ?? null);
                  if (currentStepDef?.kind === 'health') setSig3DataUrl(sig3Ref.current?.getDataUrl() ?? null);
                  if (currentStepDef?.kind === 'generic' && currentStepDef.docId) {
                    const genericSig = genericSigRef.current?.getDataUrl() ?? null;
                    if (genericSig) {
                      setGenericSigDataUrlByDocId((prev) => ({ ...prev, [currentStepDef.docId as string]: genericSig }));
                    }
                  }
                  setStep(s => s + 1);
                }}
                disabled={submitting || !canAdvance}
                className="gap-2 bg-cyan-500 hover:bg-cyan-400 text-[#020617] font-bold px-6"
              >
                {step === 0 && step1MissingRequiredCount > 0
                  ? `חסרים ${step1MissingRequiredCount} שדות למילוי`
                  : 'הבא'}
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 pointer-events-auto flex items-center justify-center gap-3">
              {currentStepDef?.kind === 'license' && (
                <Button
                  variant="outline"
                  disabled={submitting}
                  onClick={() => {
                    setSkipLicenseStep(true);
                    toast.info('שלב צילום הרישיון סומן כדילוג. ניתן לסיים ללא העלאת תמונות.');
                  }}
                  className="gap-2 border-amber-300 text-amber-200 hover:text-amber-100"
                >
                  דלג על שלב זה
                </Button>
              )}
              <Button
                disabled={submitting || !canAdvance}
                onClick={() => {
                  if (!canAdvance) {
                    toast.error('יש להשלים אישור וחתימה בטופס לפני סיום');
                    return;
                  }
                  handleFinish();
                }}
                className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> שומר...</>
                  : <><CheckCircle2 className="h-4 w-4" /> סיים וחתום</>
                }
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
