import { cn } from '@/lib/utils';
import { Fuel } from 'lucide-react';

interface FuelLevelSelectorProps {
  value: number;
  onChange: (level: number) => void;
}

const SEGMENTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

function clampFuelLevel(level: number) {
  return Math.max(0, Math.min(8, Math.round(level)));
}

function fuelLabel(value: number) {
  const labels: Record<number, string> = {
    0: 'ריק (E)',
    1: 'שמינית אחת',
    2: 'רבע מיכל',
    3: 'שלוש שמיניות',
    4: 'חצי מיכל',
    5: 'חמש שמיניות',
    6: 'שלושה רבעים',
    7: 'שבע שמיניות',
    8: 'מלא (F)',
  };

  return labels[value] ?? `${value} שמיניות`;
}

function segmentFillClass(level: number, segmentValue: number) {
  if (level === 0) {
    return 'bg-slate-500/45 border-slate-300/30';
  }

  if (segmentValue <= level) {
    // 1/8 and 2/8 ranges are red; above that all filled segments are green.
    if (level <= 2) {
      return 'border-red-300/80 bg-[linear-gradient(180deg,rgba(248,113,113,0.95)_0%,rgba(239,68,68,0.95)_55%,rgba(220,38,38,0.95)_100%)] shadow-[0_0_16px_rgba(239,68,68,0.7)]';
    }

    return 'border-emerald-200/80 bg-[linear-gradient(180deg,rgba(187,247,208,0.95)_0%,rgba(74,222,128,0.92)_48%,rgba(22,163,74,0.95)_100%)] shadow-[0_0_14px_rgba(34,197,94,0.58)]';
  }

  return 'bg-slate-500/45 border-slate-300/30';
}

export default function FuelLevelSelector({ value, onChange }: FuelLevelSelectorProps) {
  const clampedValue = clampFuelLevel(value);

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-end gap-2 text-sm font-medium text-cyan-100">
        <span>רמת דלק</span>
        <Fuel className="h-4 w-4 text-cyan-300" />
      </div>

      <div className="rounded-2xl border border-cyan-300/35 bg-[radial-gradient(circle_at_28%_20%,rgba(56,189,248,0.25)_0%,rgba(8,30,52,0.95)_56%,rgba(3,11,24,0.98)_100%)] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.38)]">
        <div className="flex items-center justify-center gap-4">
          <div className="flex h-64 flex-col justify-between text-right text-sm text-cyan-100/85">
            <span>מלא</span>
            <span>7/8</span>
            <span>3/4</span>
            <span>5/8</span>
            <span>1/2</span>
            <span>3/8</span>
            <span>1/4</span>
            <span>1/8</span>
            <span>ריק</span>
          </div>

          <div className="relative rounded-2xl border border-cyan-100/35 bg-[#081728]/90 px-3 py-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.26)]">
            <div className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2 bg-[radial-gradient(circle,rgba(56,189,248,0.22)_0%,rgba(56,189,248,0)_72%)]" />
            <div className="relative z-10 flex flex-col gap-1.5">
              {SEGMENTS.map((segment) => (
                <button
                  key={segment}
                  type="button"
                  onClick={() => onChange(segment)}
                  aria-label={`בחר ${segment} שמיניות דלק`}
                  className={cn(
                    'h-7 w-20 rounded-[6px] border transition-all duration-200 hover:scale-[1.02] active:scale-[0.99]',
                    segmentFillClass(clampedValue, segment)
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex h-64 flex-col justify-between text-left text-sm text-cyan-100/85">
            <span>F</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
            <span>E</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {[0, 2, 4, 6, 8].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors',
                clampedValue === preset
                  ? 'border-cyan-200/75 bg-cyan-400/25 text-white'
                  : 'border-cyan-300/25 bg-[#071426]/80 text-cyan-100/80 hover:border-cyan-200/50 hover:text-white'
              )}
            >
              {preset}/8
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-cyan-300/25 bg-[#061224]/70 px-3 py-2 text-center text-sm text-cyan-50">
          {`כמות הדלק במיכל: ${clampedValue} שמיניות [${fuelLabel(clampedValue)}]`}
        </div>
      </div>

    </div>
  );
}
