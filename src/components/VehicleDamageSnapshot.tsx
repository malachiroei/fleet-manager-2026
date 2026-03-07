import { cn } from '@/lib/utils';
import {
  DAMAGE_SIDE_LABELS,
  extractSidesFromSummary,
} from '@/lib/vehicleDamage';

interface VehicleDamageSnapshotProps {
  summary: string;
}

export default function VehicleDamageSnapshot({ summary }: VehicleDamageSnapshotProps) {
  const sides = extractSidesFromSummary(summary);

  const isMarked = (side: 'front' | 'back' | 'right' | 'left') => sides.includes(side);

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-[#071224] p-3" dir="rtl">
      <p className="mb-2 text-xs font-semibold text-cyan-200">סימון נזקים</p>

      <div className="relative mx-auto h-40 max-w-[180px]">
        <div
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 rounded-lg border px-2 py-4 text-[11px] [writing-mode:vertical-rl]',
            isMarked('back') ? 'border-rose-300 bg-rose-500/20 text-rose-200' : 'border-white/25 bg-white/5 text-white/60'
          )}
        >
          {DAMAGE_SIDE_LABELS.back}
        </div>

        <div
          className={cn(
            'absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border px-2 py-1 text-[11px]',
            isMarked('right') ? 'border-rose-300 bg-rose-500/20 text-rose-200' : 'border-white/25 bg-white/5 text-white/60'
          )}
        >
          {DAMAGE_SIDE_LABELS.right}
        </div>

        <div
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 rounded-lg border px-2 py-4 text-[11px] [writing-mode:vertical-rl]',
            isMarked('front') ? 'border-rose-300 bg-rose-500/20 text-rose-200' : 'border-white/25 bg-white/5 text-white/60'
          )}
        >
          {DAMAGE_SIDE_LABELS.front}
        </div>

        <div
          className={cn(
            'absolute bottom-0 left-1/2 -translate-x-1/2 rounded-lg border px-2 py-1 text-[11px]',
            isMarked('left') ? 'border-rose-300 bg-rose-500/20 text-rose-200' : 'border-white/25 bg-white/5 text-white/60'
          )}
        >
          {DAMAGE_SIDE_LABELS.left}
        </div>

        <div className="absolute left-1/2 top-1/2 h-24 w-14 -translate-x-1/2 -translate-y-1/2 rounded-[1.25rem] border border-cyan-100/30 bg-gradient-to-b from-slate-300/90 via-slate-400/85 to-slate-500/85 shadow-[0_10px_22px_rgba(2,6,23,0.55)]" />
      </div>

      <p className="mt-2 text-xs text-white/75">{summary}</p>
    </div>
  );
}
