import React, { useState, useRef, useCallback, useEffect, useMemo, RefObject } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useCreateHandover, sendHandoverNotificationEmail, generateReceptionPDF, generateProcedurePDF, generateHealthDeclarationPDF } from '@/hooks/useHandovers';
import { useOrgSettings, parsePolicyClauses, parseHealthItems } from '@/hooks/useOrgSettings';
import { useOrgDocuments } from '@/hooks/useOrgDocuments';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { buildFormsAutoFillContext } from '@/lib/formsAutofill';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { HANDOVER_ACCESSORY_CEILINGS, formatCeilingPrice } from '@/lib/accessoryCeilings';
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

const idNumberRegex = /^\d{9}$/;
const phoneRegex = /^0\d{8,9}$/;
const ignitionCodeRegex = /^\d{4,6}$/;

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
  const endIdx = sliced.findIndex((line) => line.includes('שדות מילוי') || line.includes('חתימה דיגיטלית'));
  const section = endIdx >= 0 ? sliced.slice(0, endIdx) : sliced;

  return section.filter(
    (line) => !line.includes('פרטי הנהג והרכב') && !line.includes('טבלת אישור אביזרים') && !line.startsWith('['),
  );
}

function joinHebrewList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ו${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
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

function SignatureBlock({ sigRef, label, onSign }: {
  sigRef: RefObject<SignaturePadRef>;
  label: string;
  onSign: (has: boolean) => void;
}) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">{label}</p>
      <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-white">
        <SignaturePad ref={sigRef} onSign={onSign} />
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
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl max-h-[calc(100vh-220px)] overflow-y-auto">
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
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-employee-number">מספר עובד {requiredAsterisk}</Label>
            <Input
              id="receipt-employee-number"
              value={manualFields.employeeNumber}
              onChange={(e) => onManualFieldChange('employeeNumber', e.target.value)}
              placeholder="מספר עובד"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-phone">טלפון נייד {requiredAsterisk}</Label>
            <Input
              id="receipt-phone"
              value={manualFields.phone}
              onChange={(e) => onManualFieldChange('phone', e.target.value)}
              placeholder="05X..."
              inputMode="tel"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="receipt-address">כתובת העובד (עיר ורחוב) {requiredAsterisk}</Label>
            <Input
              id="receipt-address"
              value={manualFields.address}
              onChange={(e) => onManualFieldChange('address', e.target.value)}
              placeholder="עיר ורחוב"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-ignition-code">קוד קודנית {requiredAsterisk}</Label>
            <Input
              id="receipt-ignition-code"
              value={manualFields.ignitionCode}
              onChange={(e) => onManualFieldChange('ignitionCode', e.target.value)}
              placeholder="4-6 ספרות"
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-delivery-time">תאריך ושעת מסירה</Label>
            <Input id="receipt-delivery-time" value={deliveryDateTime} readOnly className="bg-slate-100" />
          </div>
        </div>
      </div>

      {canSign && (
        <SignatureBlock sigRef={sigRef} label="4. חתימת הנהג — אישור קבלת הרכב והאביזרים:" onSign={onSign} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 2 — Usage Procedure
// ─────────────────────────────────────────────
function Step2({
  procedureRead, setProcedureRead, sigRef, onSign, vehicleLabel, driverName, date, containerRef, clauses, pdfTemplateUrl,
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
  pdfTemplateUrl?: string | null;
}) {
  return (
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader
        title="נוהל שימוש ברכב חברה"
        subtitle="נוהל מס׳ 04-05-001 — קרא בעיון ואשר חתימה בתחתית"
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      {pdfTemplateUrl ? (
        <div className="mb-6">
          <iframe
            src={pdfTemplateUrl}
            className="w-full rounded-lg border border-slate-200"
            style={{ minHeight: '420px' }}
            title="נוהל שימוש ברכב"
          />
          <p className="text-xs text-slate-500 mt-2 text-center">גלול לקרוא את כל הנוהל לפני אישור</p>
        </div>
      ) : (
        <div className="space-y-1 mb-6">
          {clauses.map(clause => (
            <div key={clause.id} className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="text-xs font-bold text-slate-400 mt-0.5 w-6 shrink-0 text-left">{clause.id}.</span>
              <p className="text-sm text-slate-700 leading-relaxed">{clause.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4 flex gap-2">
        <Shield className="h-4 w-4 mt-0.5 shrink-0" />
        <span>בחתימתי אני מאשר/ת כי קראתי והבנתי את כלל סעיפי נוהל 04-05-001 ואני מתחייב/ת לפעול על-פיו.</span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <Checkbox
          id="proc-read"
          checked={procedureRead}
          onCheckedChange={(v) => setProcedureRead(!!v)}
          className="border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
        />
        <label htmlFor="proc-read" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
          קראתי את כל {clauses.length} הסעיפים ומסכים/ה לתנאים
        </label>
      </div>

      <SignatureBlock sigRef={sigRef} label="חתימת הנהג — הצהרת מחויבות לנוהל שימוש ברכב:" onSign={onSign} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 3 — Health Declaration
// ─────────────────────────────────────────────
function Step3({
  healthItems, setHealthItems, notes, setNotes, sigRef, onSign, vehicleLabel, driverName, date, containerRef, pdfTemplateUrl,
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
  pdfTemplateUrl?: string | null;
}) {
  const toggle = (id: string) =>
    setHealthItems(healthItems.map(h => h.id === id ? { ...h, checked: !h.checked } : h));

  const allChecked = healthItems.every(h => h.checked);
  const toggleAll  = () =>
    setHealthItems(healthItems.map(h => ({ ...h, checked: !allChecked })));

  return (
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
      <OfficialDocHeader
        title="הצהרת בריאות לנהג"
        subtitle="יש לסמן ✓ על כל סעיף ולחתום. ידוע כי מסירת פרטים כוזבים מהווה עבירה."
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <p className="text-sm text-slate-600 mb-3">
        אני הח"מ מצהיר/ה כי מצב בריאותי מאפשר נהיגה בטוחה, וכי הפרטים הבאים נכונים:
      </p>

      {pdfTemplateUrl ? (
        <div className="mb-6">
          <iframe
            src={pdfTemplateUrl}
            className="w-full rounded-lg border border-slate-200"
            style={{ minHeight: '420px' }}
            title="הצהרת בריאות"
          />
          <p className="text-xs text-slate-500 mt-2 text-center">קרא את ההצהרה ולאחר מכן חתום למטה</p>
        </div>
      ) : (
        <>
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

          {/* Quick-select button moved below checklist */}
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
        </>
      )}

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

      <SignatureBlock sigRef={sigRef} label="חתימת הנהג — הצהרת בריאות:" onSign={onSign} />
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
  licenseFront, setLicenseFront,
  licenseBack, setLicenseBack,
  skipLicenseStep,
  driverName, date,
}: {
  licenseNumber: string; setLicenseNumber: (v: string) => void;
  licenseExpiry: string; setLicenseExpiry: (v: string) => void;
  licenseClass: string; setLicenseClass: (v: string) => void;
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
            <Label className="text-slate-300 text-sm font-semibold">מספר רישיון *</Label>
            <Input
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="00000000"
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-slate-50 font-semibold placeholder:text-slate-400 focus:border-cyan-400"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm font-semibold">תוקף רישיון *</Label>
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
const BASE_STEPS = [
  { icon: Car, label: 'טופס קבלת רכב' },
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

// ─────────────────────────────────────────────
// Main Wizard
// ─────────────────────────────────────────────
export default function VehicleHandoverWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: vehicles } = useVehicles();
  const { data: drivers  } = useDrivers();
  const { user } = useAuth();
  const { data: orgSettings } = useOrgSettings();
  const { data: orgDocuments } = useOrgDocuments();

  const vehicleId  = searchParams.get('vehicleId')  ?? '';
  const driverId   = searchParams.get('driverId')   ?? '';
  const handoverTypeParam = searchParams.get('handoverType') ?? searchParams.get('type') ?? 'delivery';
  const handoverType = handoverTypeParam === 'return' ? 'return' : 'delivery';
  const selectedFormsParam = searchParams.get('selectedForms') ?? '';
  const reportUrl  = decodeURIComponent(searchParams.get('reportUrl')  ?? '');
  const handoverId = decodeURIComponent(searchParams.get('handoverId') ?? '');

  const vehicle = vehicles?.find(v => v.id === vehicleId);
  const driver  = drivers?.find(d => d.id === driverId);
  const driverExt = (driver ?? {}) as any;

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
  const [selectedDeliveryFormIds, setSelectedDeliveryFormIds] = useState<string[]>([]);
  const [formsPickerOpen, setFormsPickerOpen] = useState(false);

  // Derive effective clauses / health items from org settings, fall back to static defaults
  const parsedClauses = parsePolicyClauses(orgSettings?.vehicle_policy_text);
  const activeClauses = parsedClauses.length > 0 ? parsedClauses : PROCEDURE_CLAUSES;

  useEffect(() => {
    if (!orgSettings?.health_statement_text) return;
    const parsed = parseHealthItems(orgSettings.health_statement_text);
    if (parsed.length > 0) {
      setHealthItems(prev => prev.every(p => !p.checked) ? parsed : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSettings?.health_statement_text]);

  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [licenseClass,  setLicenseClass]  = useState('B');
  const [licenseFront,  setLicenseFront]  = useState<File | null>(null);
  const [licenseBack,   setLicenseBack]   = useState<File | null>(null);

  // All active forms (for backward compatibility)
  const availableDeliveryForms = useMemo(
    () => (orgDocuments ?? []).filter((doc) => doc.is_active),
    [orgDocuments],
  );


  // All forms except 'טופס קבלת רכב' for the picker
  const formsPickerForms = useMemo(
    () => availableDeliveryForms.filter(
      (doc) => doc.title !== 'טופס קבלת רכב'
    ),
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

  // ── PDF template URLs (from org settings) ──
  const healthPdfUrl  = (orgSettings as any)?.health_statement_pdf_url as string | null ?? null;
  const policyPdfUrl  = (orgSettings as any)?.vehicle_policy_pdf_url  as string | null ?? null;

  const selectedDeliveryForms = useMemo(() => {
    const selectedSet = new Set(selectedDeliveryFormIds);
    return availableDeliveryForms.filter((doc) => selectedSet.has(doc.id));
  }, [availableDeliveryForms, selectedDeliveryFormIds]);

  const receptionFormDoc = useMemo(() => {
    const inSelection = selectedDeliveryForms.find((doc) => doc.title.includes('טופס קבלת רכב'));
    if (inSelection) return inSelection;
    return availableDeliveryForms.find((doc) => doc.title.includes('טופס קבלת רכב')) ?? null;
  }, [selectedDeliveryForms, availableDeliveryForms]);

  const receptionDeclarationText =
    String((receptionFormDoc?.json_schema as any)?.template_content ?? '').trim() ||
    String(receptionFormDoc?.description ?? '').trim() ||
    '';

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

  // Build full wizard steps array
  // Build full wizard steps array, including dynamic forms
  // Always build steps from selected forms (order preserved), plus required steps
  const wizardSteps = useMemo(() => {
    // Always start with required 'טופס קבלת רכב'
    const steps = [...BASE_STEPS];
    // Add only selected forms except 'טופס קבלת רכב'
    const dynamicSteps = selectedDeliveryFormIds
      .map(id => {
        const doc = availableDeliveryForms.find(f => f.id === id && f.title !== 'טופס קבלת רכב');
        return doc ? { icon: FileText, label: doc.title } : null;
      })
      .filter(Boolean);
    return steps.concat(dynamicSteps);
  }, [selectedDeliveryFormIds, availableDeliveryForms]);

  // ── Validation per step ──
  // ── Validation per step ──
  const canAdvance = useCallback(() => {
    if (step === 0) return sig1OK && allAccessoriesChecked && manualFieldsValid;
    if (step === 1) return sig2OK && procedureRead;
    if (step === 2) return sig3OK && (healthPdfUrl ? true : healthItems.every(h => h.checked));
    if (step === 3) return skipLicenseStep ? true : (!!licenseNumber && !!licenseExpiry && !!licenseFront && !!licenseBack);
    // Dynamic forms: allow advance if step is a dynamic form (after base steps)
    if (step > 3 && step < wizardSteps.length) return true;
    return false;
  }, [step, sig1OK, allAccessoriesChecked, manualFieldsValid, sig2OK, procedureRead, sig3OK, healthItems, healthPdfUrl, licenseNumber, licenseExpiry, licenseFront, licenseBack, skipLicenseStep, wizardSteps]);

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

    // ── Step 1: Generate PDFs (each failure is isolated) ──────────────────────
    console.log('[Wizard] handleFinish start', { vehicleId, driverId, handoverId, reportUrl });
    const ts     = Date.now();
    const folder = `documents/${vehicleId || 'unknown'}/${ts}`;

    const [pdf1Blob, pdf2Blob, pdf3Blob] = await Promise.all([
      generateReceptionPDF({
        vehicleLabel,
        driverName,
        date: today,
        accessories,
        signatureDataUrl: sig1DataUrl,
        declarationText: extractCommitmentSection(receptionDeclarationText).join('\n'),
        manualFields,
      })
        .catch((e) => { console.error('[Wizard] PDF1 failed:', e); return null; }),
      generateProcedurePDF({ vehicleLabel, driverName, date: today, clauses: activeClauses, signatureDataUrl: sig2DataUrl })
        .catch((e) => { console.error('[Wizard] PDF2 failed:', e); return null; }),
      generateHealthDeclarationPDF({ vehicleLabel, driverName, date: today, healthItems, notes: healthNotes, signatureDataUrl: sig3DataUrl })
        .catch((e) => { console.error('[Wizard] PDF3 failed:', e); return null; }),
    ]);
    console.log('[Wizard] PDF blobs:', { pdf1: !!pdf1Blob, pdf2: !!pdf2Blob, pdf3: !!pdf3Blob });

    // ── Step 2: Upload all files (each failure is isolated) ───────────────────
    const [sig1Url, sig2Url, sig3Url, frontUrl, backUrl] = await Promise.all([
      pdf1Blob ? uploadBlobToStorage(pdf1Blob, `${folder}/reception_${ts}.pdf`)  : Promise.resolve(null),
      pdf2Blob ? uploadBlobToStorage(pdf2Blob, `${folder}/procedure_${ts}.pdf`)  : Promise.resolve(null),
      pdf3Blob ? uploadBlobToStorage(pdf3Blob, `${folder}/health_${ts}.pdf`)     : Promise.resolve(null),
      !skipLicenseStep && licenseFront ? uploadFileToStorage(licenseFront, `${folder}/license_front_${ts}.jpg`) : Promise.resolve(null),
      !skipLicenseStep && licenseBack  ? uploadFileToStorage(licenseBack,  `${folder}/license_back_${ts}.jpg`)  : Promise.resolve(null),
    ]);
    console.log('[Wizard] Upload URLs:', { sig1Url, sig2Url, sig3Url, frontUrl, backUrl });

    // ── Step 3: Build attachment list — include only successful uploads ────────
    const selectedCenterFormAttachments: { filename: string; url: string }[] = selectedDeliveryForms
      .filter((doc) => Boolean(doc.file_url))
      .map((doc) => ({
        filename: `${doc.title}.pdf`,
        url: doc.file_url as string,
      }));

    const allAttachments: { filename: string; url: string }[] = [
      sig1Url  && { filename: 'טופס_קבלת_רכב.pdf',  url: sig1Url  },
      sig2Url  && { filename: 'נוהל_שימוש_ברכב.pdf', url: sig2Url  },
      sig3Url  && { filename: 'הצהרת_בריאות.pdf',    url: sig3Url  },
      frontUrl && { filename: 'רישיון_קדמי.jpg',     url: frontUrl },
      backUrl  && { filename: 'רישיון_אחורי.jpg',    url: backUrl  },
      ...selectedCenterFormAttachments,
    ].filter(Boolean) as { filename: string; url: string }[];

    const expectedAttachments = skipLicenseStep ? 3 : 5;
    const failedCount = expectedAttachments - allAttachments.length;
    console.log(`[Wizard] ${allAttachments.length} attachments ready, ${failedCount} failed`);

    // ── Step 4: Send email — ALWAYS, regardless of upload failures ────────────
    try {
      await sendHandoverNotificationEmail({
        handoverId,
        vehicleId,
        handoverType,
        assignmentMode:  'permanent',
        vehicleLabel,
        driverLabel:     driverName,
        odometerReading: 0,
        fuelLevel:       0,
        notes:           healthNotes || null,
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
      console.warn('[Wizard] Email failed:', emailErr);
      toast.success('המסמכים נשמרו. שליחת המייל נכשלה.');
    }

    // ── Step 5: Persist to DB (failures here do NOT block navigation) ─────────
    try {
      const docsToInsert = [
        sig1Url  && { driver_id: driverId, file_url: sig1Url,  title: `אישור קבלת רכב | ${vehicleLabel}` },
        sig2Url  && { driver_id: driverId, file_url: sig2Url,  title: `התחייבות נוהל שימוש ברכב | ${vehicleLabel}` },
        sig3Url  && { driver_id: driverId, file_url: sig3Url,  title: `הצהרת בריאות חתומה | ${vehicleLabel}` },
        frontUrl && { driver_id: driverId, file_url: frontUrl, title: `רישיון נהיגה (קדמי) | מס׳: ${licenseNumber}` },
        backUrl  && { driver_id: driverId, file_url: backUrl,  title: `רישיון נהיגה (אחורי) | תוקף: ${licenseExpiry}` },
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
          license_number:    licenseNumber || undefined,
          license_expiry:    licenseExpiry || undefined,
          license_front_url: frontUrl      || undefined,
          license_back_url:  backUrl       || undefined,
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
    navigate(vehicleId ? `/vehicles/${vehicleId}` : '/vehicles');
  };

  // ── Memoized input handler for manual fields ──
  const onManualFieldChange = useCallback((field: keyof ReceptionManualFields, value: string) => {
    setManualFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ── Memoized step content renderer ──
  const RenderStepContent = useMemo(() => {
    return function RenderStepContent({ stepIdx }: { stepIdx: number }) {
      // Always first step: טופס קבלת רכב
      if (stepIdx === 0) {
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
            onManualFieldChange={onManualFieldChange}
            canSign={canSignReception}
          />
        );
      }
      // Dynamic steps: find doc by id
      const dynamicStepIdx = stepIdx - 1;
      const docId = selectedDeliveryFormIds[dynamicStepIdx];
      const doc = availableDeliveryForms.find(f => f.id === docId);
      if (!doc) return null;

      // Map template/component by doc.template_name or doc.title
      if (doc.template_name === 'health' || doc.title.includes('בריאות')) {
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
            pdfTemplateUrl={doc.file_url}
          />
        );
      }
      if (doc.template_name === 'procedure' || doc.title.includes('נוהל')) {
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
            pdfTemplateUrl={doc.file_url}
          />
        );
      }
      if (doc.template_name === 'license' || doc.title.includes('רישיון')) {
        return (
          <Step4
            licenseNumber={licenseNumber} setLicenseNumber={setLicenseNumber}
            licenseExpiry={licenseExpiry} setLicenseExpiry={setLicenseExpiry}
            licenseClass={licenseClass}   setLicenseClass={setLicenseClass}
            licenseFront={licenseFront}   setLicenseFront={setLicenseFront}
            licenseBack={licenseBack}     setLicenseBack={setLicenseBack}
            skipLicenseStep={skipLicenseStep}
            driverName={driverName}
            date={today}
          />
        );
      }
      // Default: show PDF with checkbox
      return (
        <div className="bg-white text-slate-900 rounded-2xl p-4 pb-32 sm:p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-4">{doc.title}</h2>
          {doc.file_url ? (
            <iframe
              src={doc.file_url}
              className="w-full rounded-lg border border-slate-200"
              style={{ minHeight: '420px' }}
              title={doc.title}
            />
          ) : (
            <p className="text-sm text-slate-500">לא נמצא קובץ PDF עבור טופס זה.</p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <Checkbox
              checked={!!doc.approved}
              onCheckedChange={() => {/* handle approval state if needed */}}
              className="border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
            <span className="text-sm font-medium text-slate-700 cursor-pointer select-none">
              קראתי והבנתי את הטופס
            </span>
          </div>
        </div>
      );
    };
  }, [accessories, setAccessories, sig1Ref, setSig1OK, vehicleLabel, driverName, today, deliveryDateTime, receptionDeclarationText, manualFields, onManualFieldChange, canSignReception, selectedDeliveryFormIds, availableDeliveryForms, healthItems, setHealthItems, healthNotes, setHealthNotes, sig3Ref, setSig3OK, procedureRead, setProcedureRead, sig2Ref, setSig2OK, activeClauses, licenseNumber, setLicenseNumber, licenseExpiry, setLicenseExpiry, licenseClass, setLicenseClass, licenseFront, setLicenseFront, licenseBack, setLicenseBack, skipLicenseStep]);

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[#0d1b2e]/95 backdrop-blur-sm border-b border-white/10">
        <div className="container py-3 flex items-center gap-3">
          <Link to={vehicleId ? `/vehicles/${vehicleId}` : '/vehicles'}>
            <Button variant="ghost" size="icon" className="text-white/70 hover:text-white">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
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
          <Button type="button" onClick={() => setFormsPickerOpen((prev) => !prev)} variant="outline" size="sm">
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
                  return (
                    <label key={doc.id} className="flex items-center gap-2 rounded-lg border border-cyan-400/15 bg-[#061325]/70 px-3 py-2 text-sm">
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
                        }}
                      />
                      <span className="text-cyan-50">{doc.title}</span>
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
          </div>
        )}

        {/* Render the current step by mapping */}
        <RenderStepContent stepIdx={step} />
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

          {!canAdvance() && (
            <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-6 whitespace-nowrap text-xs text-amber-400/90">
              {step === 0 && (step1MissingRequiredCount > 0
                ? `יש להשלים ${step1MissingRequiredCount} שדות חובה`
                : !manualFieldsValid
                  ? 'יש להשלים שדות בפורמט תקין'
                : 'נדרשת חתימה להמשך')}
              {step === 1 && (!procedureRead ? 'סמן קריאה ואישור להמשך' : 'נדרשת חתימה להמשך')}
              {step === 2 && (healthPdfUrl ? 'נדרשת חתימה להמשך' : (!healthItems.every(h => h.checked) ? 'סמן את כל סעיפי הבריאות' : 'נדרשת חתימה להמשך'))}
              {step === 3 && (
                skipLicenseStep
                  ? (!licenseNumber ? 'חסר מספר רישיון' : 'חסר תוקף רישיון')
                  : (!licenseFront ? 'חסר צילום צד א׳' :
                    !licenseBack  ? 'חסר צילום צד ב׳' :
                    !licenseNumber ? 'חסר מספר רישיון' :
                    'חסר תוקף רישיון')
              )}
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
                  if (step === 1 && !procedureRead) {
                    toast.error('יש לאשר את קריאת הסעיפים בטרם המעבר');
                    return;
                  }
                  if (step === 2 && !healthPdfUrl && !healthItems.every(h => h.checked)) {
                    toast.error('עליך לאשר את כל סעיפי הבריאות כדי להמשיך');
                    return;
                  }
                  if (!canAdvance()) return;
                  // Capture raw signature dataUrl from ref before the step unmounts
                  if (step === 0) setSig1DataUrl(sig1Ref.current?.getDataUrl() ?? null);
                  if (step === 1) setSig2DataUrl(sig2Ref.current?.getDataUrl() ?? null);
                  if (step === 2) setSig3DataUrl(sig3Ref.current?.getDataUrl() ?? null);
                  setStep(s => s + 1);
                }}
                disabled={submitting || ((step !== 0 && step !== 1 && step !== 2) && !canAdvance())}
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
              {step === 3 && (
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
                disabled={submitting}
                onClick={() => {
                  if (!skipLicenseStep && !licenseNumber) { toast.error('נא להזין מספר רישיון'); return; }
                  if (!skipLicenseStep && !licenseExpiry) { toast.error('נא להזין תוקף רישיון'); return; }
                  if (!skipLicenseStep && !licenseFront) { toast.error('נא לצלם את צד א׳ של הרישיון או לדלג על שלב זה'); return; }
                  if (!skipLicenseStep && !licenseBack)  { toast.error('נא לצלם את צד ב׳ של הרישיון או לדלג על שלב זה'); return; }
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
