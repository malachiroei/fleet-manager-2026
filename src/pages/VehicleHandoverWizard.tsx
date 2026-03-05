import { useState, useRef, useCallback, RefObject } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useCreateHandover, uploadSignature } from '@/hooks/useHandovers';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { sendHandoverEmail } from '@/lib/sendHandoverEmail';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  accessories, setAccessories, sigRef, onSign, vehicleLabel, driverName, date,
}: {
  accessories: AccessoryItem[];
  setAccessories: (a: AccessoryItem[]) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
}) {
  const toggle = (id: string) =>
    setAccessories(accessories.map(a => a.id === id ? { ...a, checked: !a.checked } : a));

  const setNotes = (id: string, notes: string) =>
    setAccessories(accessories.map(a => a.id === id ? { ...a, notes } : a));

  const allChecked = accessories.every(a => a.checked);
  const toggleAll  = () =>
    setAccessories(accessories.map(a => ({ ...a, checked: !allChecked })));

  return (
    <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
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
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400"
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
  procedureRead, setProcedureRead, sigRef, onSign, vehicleLabel, driverName, date,
}: {
  procedureRead: boolean;
  setProcedureRead: (v: boolean) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
}) {
  return (
    <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
      <OfficialDocHeader
        title="נוהל שימוש ברכב חברה"
        subtitle="נוהל מס׳ 04-05-001 — קרא בעיון ואשר חתימה בתחתית"
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <div className="space-y-1 mb-6">
        {PROCEDURE_CLAUSES.map(clause => (
          <div key={clause.id} className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
            <span className="text-xs font-bold text-slate-400 mt-0.5 w-6 shrink-0 text-left">{clause.id}.</span>
            <p className="text-sm text-slate-700 leading-relaxed">{clause.text}</p>
          </div>
        ))}
      </div>

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
          קראתי את כל 21 הסעיפים ומסכים/ה לתנאים
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
  healthItems, setHealthItems, sigRef, onSign, vehicleLabel, driverName, date,
}: {
  healthItems: HealthDeclaration[];
  setHealthItems: (h: HealthDeclaration[]) => void;
  sigRef: RefObject<SignaturePadRef>;
  onSign: (has: boolean) => void;
  vehicleLabel: string;
  driverName: string;
  date: string;
}) {
  const toggle = (id: string) =>
    setHealthItems(healthItems.map(h => h.id === id ? { ...h, checked: !h.checked } : h));

  return (
    <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl">
      <OfficialDocHeader
        title="הצהרת בריאות לנהג"
        subtitle="יש לסמן ✓ על כל סעיף ולחתום. ידוע כי מסירת פרטים כוזבים מהווה עבירה."
        date={date}
        vehicleLabel={vehicleLabel}
        driverName={driverName}
      />

      <p className="text-sm text-slate-600 mb-5">
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

      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 mb-2">
        <Heart className="inline h-3.5 w-3.5 ml-1" />
        הצהרת בריאות זו הינה תנאי סף לקבלת רכב חברה. מסירת פרטים כוזבים תגרור הפסקת הטיפול בהפרת רישיון.
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

      {/* Fields */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-slate-700 text-sm font-semibold">מספר רישיון *</Label>
          <Input
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="00000000"
            dir="ltr"
            className="mt-1 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>
        <div>
          <Label className="text-slate-700 text-sm font-semibold">תוקף רישיון *</Label>
          <Input
            type="date"
            value={licenseExpiry}
            onChange={(e) => setLicenseExpiry(e.target.value)}
            className="mt-1 border-slate-300 bg-white text-slate-900 focus:border-blue-500"
          />
        </div>
        <div>
          <Label className="text-slate-700 text-sm font-semibold">דרגת רישיון</Label>
          <Input
            value={licenseClass}
            onChange={(e) => setLicenseClass(e.target.value)}
            placeholder="B, C1..."
            dir="ltr"
            className="mt-1 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
          />
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
const STEPS = [
  { icon: Car,      label: 'קבלת רכב'    },
  { icon: FileText, label: 'נוהל שימוש'  },
  { icon: Heart,    label: 'הצהרת בריאות' },
  { icon: Camera,   label: 'רישיון נהיגה' },
];

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done    = i < current;
          const active  = i === current;
          return (
            <div key={i} className="flex items-center flex-1">
              <div className={`flex flex-col items-center flex-1 ${i === STEPS.length - 1 ? '' : ''}`}>
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
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 mt-[-14px] transition-all rounded-full ${done ? 'bg-cyan-500' : 'bg-white/10'}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded-full transition-all duration-500"
          style={{ width: `${((current) / (STEPS.length - 1)) * 100}%` }}
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

  const vehicleId = searchParams.get('vehicleId') ?? '';
  const driverId  = searchParams.get('driverId')  ?? '';

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

  const [procedureRead, setProcedureRead] = useState(false);
  const [sig2OK, setSig2OK] = useState(false);

  const [healthItems, setHealthItems] = useState<HealthDeclaration[]>(INITIAL_HEALTH);
  const [sig3OK, setSig3OK] = useState(false);

  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [licenseClass,  setLicenseClass]  = useState('B');
  const [licenseFront,  setLicenseFront]  = useState<File | null>(null);
  const [licenseBack,   setLicenseBack]   = useState<File | null>(null);

  // ── Validation per step ──
  const canAdvance = useCallback(() => {
    if (step === 0) return sig1OK;
    if (step === 1) return sig2OK && procedureRead;
    if (step === 2) return sig3OK && healthItems.every(h => h.checked);
    if (step === 3) return !!licenseNumber && !!licenseExpiry && !!licenseFront && !!licenseBack;
    return false;
  }, [step, sig1OK, sig2OK, procedureRead, sig3OK, healthItems, licenseNumber, licenseExpiry, licenseFront, licenseBack]);

  // ── Upload helper ──
  const uploadFileToStorage = async (file: File, path: string): Promise<string | null> => {
    try {
      const { error } = await supabase.storage
        .from('vehicle-documents')
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error('Upload error', e);
      return null;
    }
  };

  const uploadSigToStorage = async (
    ref: RefObject<SignaturePadRef>,
    name: string
  ): Promise<string | null> => {
    const dataUrl = ref.current?.getDataUrl();
    if (!dataUrl) return null;
    try {
      return await uploadSignature(dataUrl, vehicleId, name as 'delivery' | 'return');
    } catch {
      return null;
    }
  };

  // ── Final submit ──
  const handleFinish = async () => {
    setSubmitting(true);
    try {
      const base = `documents/${vehicleId}/${Date.now()}`;

      // Upload all 3 signatures
      const [sig1Url, sig2Url, sig3Url] = await Promise.all([
        uploadSigToStorage(sig1Ref, 'delivery'),
        uploadSigToStorage(sig2Ref, 'delivery'),
        uploadSigToStorage(sig3Ref, 'delivery'),
      ]);

      // Upload license photos
      const [frontUrl, backUrl] = await Promise.all([
        licenseFront ? uploadFileToStorage(licenseFront, `${base}/license_front.jpg`) : Promise.resolve(null),
        licenseBack  ? uploadFileToStorage(licenseBack,  `${base}/license_back.jpg`)  : Promise.resolve(null),
      ]);

      // Save to driver_documents (schema: driver_id, file_url, title)
      const docsToInsert = [
        sig1Url  && { driver_id: driverId, file_url: sig1Url,  title: `handover_receipt | רכב: ${vehicleLabel}` },
        sig2Url  && { driver_id: driverId, file_url: sig2Url,  title: `procedure_agreement | נוהל 04-05-001 | רכב: ${vehicleLabel}` },
        sig3Url  && { driver_id: driverId, file_url: sig3Url,  title: `health_declaration | הצהרת בריאות | רכב: ${vehicleLabel}` },
        frontUrl && { driver_id: driverId, file_url: frontUrl, title: `license_front | מס׳: ${licenseNumber}` },
        backUrl  && { driver_id: driverId, file_url: backUrl,  title: `license_back | תוקף: ${licenseExpiry}` },
      ].filter(Boolean);

      if (docsToInsert.length > 0) {
        await supabase.from('driver_documents').insert(docsToInsert as never);
      }

      // Update driver record with license details
      if (driverId) {
        await supabase.from('drivers').update({
          license_number:    licenseNumber   || undefined,
          license_expiry:    licenseExpiry   || undefined,
          license_front_url: frontUrl        || undefined,
          license_back_url:  backUrl         || undefined,
        }).eq('id', driverId);
      }

      // ── Send email directly from browser via Resend ─────────────────────────────
      const savedDocs = (
        docsToInsert as { driver_id: string; file_url: string; title: string }[]
      ).map((d) => ({ title: d.title, file_url: d.file_url }));

      const emailResult = await sendHandoverEmail({
        docs:          savedDocs,
        driverName,
        driverEmail:   driver?.email ?? null,
        vehicleLabel,
        licenseNumber,
        supabase,
      });

      if (emailResult.success) {
        toast.success('כל המסמכים נחתמו ונשלח מייל!');
      } else {
        toast.success('כל המסמכים נשמרו בהצלחה.');
        if (emailResult.error) {
          console.warn('שליחת מייל נכשלה (אינו חוסם על השמירה):', emailResult.error);
          toast.warning(`שליחת מייל נכשלה: ${emailResult.error}`);
        }
      }

      navigate(vehicleId ? `/vehicles/${vehicleId}` : '/vehicles');
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בשמירת המסמכים. נסה שנית.');
    } finally {
      setSubmitting(false);
    }
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
              שלב {step + 1} מתוך {STEPS.length}
            </span>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-32 max-w-3xl mx-auto">
        <ProgressBar current={step} />

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
          />
        )}
        {step === 2 && (
          <Step3
            healthItems={healthItems}
            setHealthItems={setHealthItems}
            sigRef={sig3Ref}
            onSign={setSig3OK}
            vehicleLabel={vehicleLabel}
            driverName={driverName}
            date={today}
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
      </main>

      {/* Fixed bottom navigation — raised 40 px to clear the test-build banner */}
      <div className="fixed bottom-10 left-0 right-0 bg-[#020617]/95 backdrop-blur-sm border-t border-white/10 py-4 z-20">
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
              {step === 2 && (!healthItems.every(h => h.checked) ? 'סמן את כל סעיפי הבריאות' : 'נדרשת חתימה להמשך')}
              {step === 3 && 'מלא שדות חובה וצלם רישיון'}
            </p>
          )}

          {step < STEPS.length - 1 ? (
            <Button
              disabled={!canAdvance()}
              onClick={() => setStep(s => s + 1)}
              className="gap-2 bg-cyan-500 hover:bg-cyan-400 text-[#020617] font-bold px-6"
            >
              הבא
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled={!canAdvance() || submitting}
              onClick={handleFinish}
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
