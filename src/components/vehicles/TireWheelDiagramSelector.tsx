import { useMemo } from 'react';
import { fleetPublicStorageObjectUrl } from '@/lib/supabase/fleetPublicStorageUrl';
import { cn } from '@/lib/utils';

/** ערכי מיקום תואמים לשמירה במסמכים / DB (כמו הרשימה הקודמת) */
export const TIRE_WHEEL_VALUES = [
  'קדמי שמאל',
  'קדמי ימין',
  'אחורי שמאל',
  'אחורי ימין',
  'גלגל חירום / גיבוי',
] as const;

type WheelValue = (typeof TIRE_WHEEL_VALUES)[number];

/** אחוזים בתוך מסגרת התמונה (רכב מלמעלה, אף כלפי מעלה) — תואם VehicleDamage3DSelector */
const HOTSPOTS: { value: WheelValue; label: string; style: React.CSSProperties }[] = [
  { value: 'קדמי שמאל', label: 'קד״ש', style: { top: '14%', left: '24%', transform: 'translate(-50%, -50%)' } },
  { value: 'קדמי ימין', label: 'קד״י', style: { top: '14%', left: '76%', transform: 'translate(-50%, -50%)' } },
  { value: 'אחורי שמאל', label: 'אח״ש', style: { top: '78%', left: '24%', transform: 'translate(-50%, -50%)' } },
  { value: 'אחורי ימין', label: 'אח״י', style: { top: '78%', left: '76%', transform: 'translate(-50%, -50%)' } },
  { value: 'גלגל חירום / גיבוי', label: 'חירום', style: { top: '88%', left: '50%', transform: 'translate(-50%, -50%)' } },
];

export function TireWheelDiagramSelector({
  value,
  onChange,
  minSelection = 1,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** לא משמש לולידציה כאן — רק להודעת עזר */
  minSelection?: number;
}) {
  const selected = useMemo(() => new Set(value), [value]);
  const carUrl = useMemo(() => fleetPublicStorageObjectUrl('logos/car.jpg'), []);

  const toggle = (v: WheelValue) => {
    const has = selected.has(v);
    const next = has ? value.filter((x) => x !== v) : [...value, v];
    onChange(next);
  };

  return (
    <div className="space-y-2" dir="rtl">
      <p className="text-xs text-muted-foreground">
        לחצי על הגלגלים בתמונה לסימון מיקומים שהוחלפו
        {minSelection > 0 ? ` (לפחות ${minSelection})` : ''}.
      </p>
      <div className="relative mx-auto overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-[#102846] via-[#0a1b31] to-[#050f1f] p-3 shadow-inner">
        <div className="relative mx-auto aspect-[250/320] w-full max-w-[280px] sm:max-w-[320px]">
          <img
            src={carUrl}
            alt="תרשים רכב — בחירת צמיגים"
            className="h-full w-full rotate-90 scale-[1.12] select-none object-contain object-center opacity-95"
            draggable={false}
          />
          {HOTSPOTS.map(({ value: v, label, style }) => {
            const on = selected.has(v);
            return (
              <button
                key={v}
                type="button"
                title={v}
                aria-pressed={on}
                onClick={() => toggle(v)}
                style={style}
                className={cn(
                  'absolute z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg transition sm:h-11 sm:w-11 sm:text-[11px]',
                  on
                    ? 'border-cyan-200 bg-cyan-500/90 text-white shadow-cyan-500/40'
                    : 'border-white/40 bg-[#061427]/80 text-white/90 hover:border-cyan-300 hover:bg-cyan-500/25',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {value.length > 0 ? (
        <p className="text-center text-xs font-medium text-cyan-200/90">נבחרו: {value.join(' · ')}</p>
      ) : (
        <p className="text-center text-xs text-amber-200/80">לא נבחר מיקום — לחצי על גלגל בתמונה</p>
      )}
    </div>
  );
}
