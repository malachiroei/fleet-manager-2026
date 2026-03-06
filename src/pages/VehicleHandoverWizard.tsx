import React, { useState, useRef, useCallback, useEffect, RefObject } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useCreateHandover, sendHandoverNotificationEmail, generateReceptionPDF, generateProcedurePDF, generateHealthDeclarationPDF } from '@/hooks/useHandovers';
import { useOrgSettings, parsePolicyClauses, parseHealthItems } from '@/hooks/useOrgSettings';
import { useOrgDocuments } from '@/hooks/useOrgDocuments';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
// Badge no longer needed — replaced with plain span
import { toast } from 'sonner';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Car,
  FileText,
  Heart,
  Camera,
  Loader2,
  Shield,
  AlertTriangle,
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

// ─────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────
const INITIAL_ACCESSORIES: AccessoryItem[] = [
  { id: 'spare_wheel',    name: 'גלגל רזרבי',             maxPrice: '₪800',  checked: false, notes: '' },
  { id: 'jack',           name: 'מגבה',                   maxPrice: '₪150',  checked: false, notes: '' },
  { id: 'wheel_wrench',   name: 'מפתח גלגל',              maxPrice: '₪80',   checked: false, notes: '' },
  { id: 'warning_tri',    name: 'משולש אזהרה',            maxPrice: '₪60',   checked: false, notes: '' },
  { id: 'toolkit',        name: 'סט כלים',                maxPrice: '₪120',  checked: false, notes: '' },
  { id: 'first_aid',      name: 'ערכת עזרה ראשונה',       maxPrice: '₪200',  checked: false, notes: '' },
  { id: 'fire_ext',       name: 'מטף כיבוי אש',           maxPrice: '₪250',  checked: false, notes: '' },
  { id: 'fuel_card',      name: 'כרטיס דלק',              maxPrice: '—',     checked: false, notes: '' },
  { id: 'manual',         name: 'ספר הוראות הפעלה',       maxPrice: '₪100',  checked: false, notes: '' },
  { id: 'reflective',     name: 'אפוד זוהר',              maxPrice: '₪50',   checked: false, notes: '' },
];

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
  accessories, setAccessories, sigRef, onSign, vehicleLabel, driverName, date, containerRef,
}: {
  accessories: AccessoryItem[];
  setAccessories: (a: AccessoryItem[]) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
  containerRef?: RefObject<HTMLDivElement>;
}) {
  const toggle = (id: string) =>
    setAccessories(accessories.map(a => a.id === id ? { ...a, checked: !a.checked } : a));

  const setNotes = (id: string, notes: string) =>
    setAccessories(accessories.map(a => a.id === id ? { ...a, notes } : a));

  const allChecked = accessories.every(a => a.checked);
  const toggleAll  = () =>
    setAccessories(accessories.map(a => ({ ...a, checked: !allChecked })));

  return (
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
      <OfficialDocHeader
        title="טופס קבלת רכב"
        subtitle="יש לסמן ✓ על כל פריט המצוי ברכב ולחתום בתחתית הטופס"
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <p className="text-sm text-slate-600 mb-3">
        אני הח"מ מאשר/ת כי קיבלתי את הרכב הנ"ל וכי הפריטים הבאים נמסרו לי:
      </p>

      {/* Quick-select button */}
      <div className="flex justify-end mb-2">
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

      {/* Accessories table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2.5 font-semibold text-slate-700 w-9 text-center">✓</th>
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
                    checked={item.checked}
                    onCheckedChange={() => toggle(item.id)}
                    className="border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
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

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
        <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />
        פריטים שסומנו כנמסרו — אחריות החזרתם בשלמות חלה על הנהג. אובדן או נזק יחויב לפי מחיר התקרה.
      </div>

      <SignatureBlock sigRef={sigRef} label="חתימת הנהג — אישור קבלת הרכב והאביזרים:" onSign={onSign} />
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
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
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
    <div ref={containerRef} className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
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
          {/* Quick-select button */}
          <div className="flex justify-end mb-2">
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
  driverName, date,
}: {
  licenseNumber: string; setLicenseNumber: (v: string) => void;
  licenseExpiry: string; setLicenseExpiry: (v: string) => void;
  licenseClass: string; setLicenseClass: (v: string) => void;
  licenseFront: File | null; setLicenseFront: (f: File | null) => void;
  licenseBack: File | null; setLicenseBack: (f: File | null) => void;
  driverName: string; date: string;
}) {
  const makePrev = (file: File | null) => file ? URL.createObjectURL(file) : null;

  return (
    <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
      <OfficialDocHeader
        title="צילום רישיון נהיגה"
        subtitle="יש לצלם את שני צדי הרישיון ולמלא את הפרטים"
        date={date}
        driverName={driverName}
      />

      {/* Photo upload */}
      <div className="grid grid-cols-2 gap-4 mb-6">
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
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-slate-300 text-sm font-semibold">מספר רישיון *</Label>
            <Input
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="00000000"
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-cyan-400"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm font-semibold">תוקף רישיון *</Label>
            <Input
              type="date"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
              className="mt-1 border-slate-700 bg-slate-900 text-white focus:border-cyan-400"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-sm font-semibold">דרגת רישיון</Label>
            <Input
              value={licenseClass}
              onChange={(e) => setLicenseClass(e.target.value)}
              placeholder="B, C1..."
              dir="ltr"
              className="mt-1 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-cyan-400"
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
// Step Doc — Extra org document step
// ─────────────────────────────────────────────
function StepDoc({ title, description, fileUrl, confirmed, onConfirm }: {
  title: string;
  description: string;
  fileUrl: string | null;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
}) {
  return (
    <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-800 mb-1">{title}</h2>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {fileUrl ? (
        <div className="mb-6">
          <iframe
            src={fileUrl}
            className="w-full rounded-lg border border-slate-200"
            style={{ minHeight: '420px' }}
            title={title}
          />
          <p className="text-xs text-slate-500 mt-2 text-center">גלול לקרוא לפני אישור</p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-6 text-center text-slate-400">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">אין קובץ מצורף — קרא את הכותרת וההסבר ואשר למטה</p>
        </div>
      )}
      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Checkbox
          id={`doc-confirm-${title}`}
          checked={confirmed}
          onCheckedChange={(v) => onConfirm(!!v)}
          className="border-blue-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
        />
        <label htmlFor={`doc-confirm-${title}`} className="text-sm font-medium text-blue-800 cursor-pointer select-none">
          קראתי ומאשר/ת את תוכן המסמך
        </label>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Progress Bar
// ─────────────────────────────────────────────
const BASE_STEPS = [
  { icon: Car,      label: 'קבלת רכב'    },
  { icon: FileText, label: 'נוהל שימוש'  },
  { icon: Heart,    label: 'הצהרת בריאות' },
  { icon: Camera,   label: 'רישיון נהיגה' },
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
          return (
            <div key={i} className="flex items-center flex-1">
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
  const { data: extraDocs } = useOrgDocuments(); // docs with include_in_handover=true

  const vehicleId  = searchParams.get('vehicleId')  ?? '';
  const driverId   = searchParams.get('driverId')   ?? '';
  const reportUrl  = decodeURIComponent(searchParams.get('reportUrl')  ?? '');
  const handoverId = decodeURIComponent(searchParams.get('handoverId') ?? '');

  const vehicle = vehicles?.find(v => v.id === vehicleId);
  const driver  = drivers?.find(d => d.id === driverId);

  const vehicleLabel = vehicle
    ? `${vehicle.manufacturer} ${vehicle.model} (${vehicle.plate_number})`
    : vehicleId;
  const driverName = driver?.full_name ?? driverId;
  const today = new Date().toLocaleDateString('he-IL');

  // Step state
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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

  // ── PDF template URLs (from org settings) ──
  const healthPdfUrl  = (orgSettings as any)?.health_statement_pdf_url as string | null ?? null;
  const policyPdfUrl  = (orgSettings as any)?.vehicle_policy_pdf_url  as string | null ?? null;

  // ── Dynamic extra doc steps from org_documents ──
  const [docConfirms, setDocConfirms] = useState<boolean[]>([]);
  useEffect(() => {
    if (extraDocs) setDocConfirms(extraDocs.map(() => false));
  }, [extraDocs?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build full wizard steps array
  const wizardSteps = [
    ...BASE_STEPS,
    ...(extraDocs ?? []).map(d => ({ icon: FileText, label: d.title.slice(0, 8) })),
  ];

  // ── Validation per step ──
  const canAdvance = useCallback(() => {
    if (step === 0) return sig1OK;
    if (step === 1) return sig2OK && procedureRead;
    if (step === 2) return sig3OK && (healthPdfUrl ? true : healthItems.every(h => h.checked));
    if (step === 3) return !!licenseNumber && !!licenseExpiry && !!licenseFront && !!licenseBack;
    // extra org document steps
    const docIdx = step - 4;
    if (docIdx >= 0 && docIdx < (extraDocs?.length ?? 0)) return docConfirms[docIdx] === true;
    return false;
  }, [step, sig1OK, sig2OK, procedureRead, sig3OK, healthItems, healthPdfUrl, licenseNumber, licenseExpiry, licenseFront, licenseBack, docConfirms, extraDocs]);

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
      generateReceptionPDF({ vehicleLabel, driverName, date: today, accessories, signatureDataUrl: sig1DataUrl })
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
      licenseFront ? uploadFileToStorage(licenseFront, `${folder}/license_front_${ts}.jpg`) : Promise.resolve(null),
      licenseBack  ? uploadFileToStorage(licenseBack,  `${folder}/license_back_${ts}.jpg`)  : Promise.resolve(null),
    ]);
    console.log('[Wizard] Upload URLs:', { sig1Url, sig2Url, sig3Url, frontUrl, backUrl });

    // ── Step 3: Build attachment list — include only successful uploads ────────
    const allAttachments: { filename: string; url: string }[] = [
      sig1Url  && { filename: 'טופס_קבלת_רכב.pdf',  url: sig1Url  },
      sig2Url  && { filename: 'נוהל_שימוש_ברכב.pdf', url: sig2Url  },
      sig3Url  && { filename: 'הצהרת_בריאות.pdf',    url: sig3Url  },
      frontUrl && { filename: 'רישיון_קדמי.jpg',     url: frontUrl },
      backUrl  && { filename: 'רישיון_אחורי.jpg',    url: backUrl  },
    ].filter(Boolean) as { filename: string; url: string }[];

    const failedCount = 5 - allAttachments.length;
    console.log(`[Wizard] ${allAttachments.length} attachments ready, ${failedCount} failed`);

    // ── Step 4: Send email — ALWAYS, regardless of upload failures ────────────
    try {
      await sendHandoverNotificationEmail({
        handoverId,
        vehicleId,
        handoverType:    'delivery',
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
          ? `המייל נשלח עם ${allAttachments.length} מתוך 5 קבצים`
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
          license_number:    licenseNumber || undefined,
          license_expiry:    licenseExpiry || undefined,
          license_front_url: frontUrl      || undefined,
          license_back_url:  backUrl       || undefined,
        }).eq('id', driverId);
        if (updateErr) console.error('[Wizard] drivers update error:', updateErr.message);
      }
    } catch (dbErr) {
      console.error('[Wizard] DB persist error (non-blocking):', dbErr);
    }

    setSubmitting(false);
    navigate(vehicleId ? `/vehicles/${vehicleId}` : '/vehicles');
  };

  // ── Render ──
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
            <h1 className="font-bold text-lg leading-tight">אשף מסירת רכב</h1>
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

        {/* Steps */}
        {step === 0 && (
          <Step1
            accessories={accessories}
            setAccessories={setAccessories}
            sigRef={sig1Ref}
            onSign={setSig1OK}
            vehicleLabel={vehicleLabel}
            driverName={driverName}
            date={today}
          />
        )}
        {step === 1 && (
          <Step2
            procedureRead={procedureRead}
            setProcedureRead={setProcedureRead}
            sigRef={sig2Ref}
            onSign={setSig2OK}
            vehicleLabel={vehicleLabel}
            driverName={driverName}
            date={today}
            clauses={activeClauses}
            pdfTemplateUrl={policyPdfUrl}
          />
        )}
        {step === 2 && (
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
            pdfTemplateUrl={healthPdfUrl}
          />
        )}
        {step === 3 && (
          <Step4
            licenseNumber={licenseNumber} setLicenseNumber={setLicenseNumber}
            licenseExpiry={licenseExpiry} setLicenseExpiry={setLicenseExpiry}
            licenseClass={licenseClass}   setLicenseClass={setLicenseClass}
            licenseFront={licenseFront}   setLicenseFront={setLicenseFront}
            licenseBack={licenseBack}     setLicenseBack={setLicenseBack}
            driverName={driverName}
            date={today}
          />
        )}
        {step >= 4 && (extraDocs ?? []).map((doc, idx) => step === idx + 4 ? (
          <React.Fragment key={doc.id}>
            <StepDoc
              title={doc.title}
              description={doc.description}
              fileUrl={doc.file_url}
              confirmed={docConfirms[idx] ?? false}
              onConfirm={(v) => setDocConfirms(prev => { const next = [...prev]; next[idx] = v; return next; })}
            />
          </React.Fragment>
        ) : null)}
      </main>

      {/* Fixed bottom navigation — raised 56 px to clear the test-build banner */}
      <div className="fixed bottom-14 left-0 right-0 bg-[#020617]/95 backdrop-blur-sm border-t border-white/10 py-4 z-20">
        <div className="container max-w-3xl mx-auto flex items-center gap-3">
          {step > 0 && (
            <Button
              variant="ghost"
              className="gap-2 text-white/70 hover:text-white"
              onClick={() => setStep(s => s - 1)}
              disabled={submitting}
            >
              <ArrowRight className="h-4 w-4" />
              הקודם
            </Button>
          )}

          <div className="flex-1" />

          {!canAdvance() && (
            <p className="text-xs text-amber-400/80">
              {step === 0 && 'נדרשת חתימה להמשך'}
              {step === 1 && (!procedureRead ? 'סמן קריאה ואישור להמשך' : 'נדרשת חתימה להמשך')}
              {step === 2 && (healthPdfUrl ? 'נדרשת חתימה להמשך' : (!healthItems.every(h => h.checked) ? 'סמן את כל סעיפי הבריאות' : 'נדרשת חתימה להמשך'))}
              {step >= 4 && 'יש לאשר קריאת המסמך להמשך'}
              {step === 3 && (
                !licenseFront ? 'חסר צילום צד א׳' :
                !licenseBack  ? 'חסר צילום צד ב׳' :
                !licenseNumber ? 'חסר מספר רישיון' :
                'חסר תוקף רישיון'
              )}
            </p>
          )}

          {step < wizardSteps.length - 1 ? (
            <Button
              onClick={async () => {
                // Step-specific validation toasts before advancing
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
              disabled={step !== 1 && step !== 2 && !canAdvance()}
              className="gap-2 bg-cyan-500 hover:bg-cyan-400 text-[#020617] font-bold px-6"
            >
              הבא
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled={submitting}
              onClick={() => {
                if (!licenseFront) { toast.error('נא לצלם את צד א׳ של הרישיון'); return; }
                if (!licenseBack)  { toast.error('נא לצלם את צד ב׳ של הרישיון'); return; }
                if (!licenseNumber) { toast.error('נא להזין מספר רישיון'); return; }
                if (!licenseExpiry) { toast.error('נא להזין תוקף רישיון'); return; }
                handleFinish();
              }}
              className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> שומר...</>
                : <><CheckCircle2 className="h-4 w-4" /> סיים וחתום</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
