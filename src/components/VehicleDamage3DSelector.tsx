import { useMemo, useState } from 'react';
import { fleetPublicStorageObjectUrl } from '@/lib/supabase/fleetPublicStorageUrl';
import { cn } from '@/lib/utils';
import {
  DAMAGE_SIDE_LABELS,
  DAMAGE_TYPE_LABELS,
  DAMAGE_TYPES,
  type VehicleDamageReport,
  type VehicleDamageSide,
  type VehicleDamageType,
} from '@/lib/vehicleDamage';
import { Sparkles, Target } from 'lucide-react';

interface VehicleDamage3DSelectorProps {
  value: VehicleDamageReport;
  onChange: (next: VehicleDamageReport) => void;
}

const DAMAGE_MARKER_LABEL: Record<VehicleDamageType, string> = {
  dent: 'מ',
  scratch: 'ש',
  scuff: 'פ',
  crack: 'ב',
};

const SIDE_MARKER_ANCHOR: Record<VehicleDamageSide, { x: number; y: number }> = {
  front: { x: 50, y: 17 },
  back: { x: 50, y: 83 },
  right: { x: 68, y: 50 },
  left: { x: 32, y: 50 },
};

export default function VehicleDamage3DSelector({ value, onChange }: VehicleDamage3DSelectorProps) {
  const realisticTopCar = useMemo(() => fleetPublicStorageObjectUrl('logos/car.jpg'), []);
  const [activeSide, setActiveSide] = useState<VehicleDamageSide>('front');
  const [pickerSide, setPickerSide] = useState<VehicleDamageSide | null>(null);

  const toggleDamageType = (side: VehicleDamageSide, type: VehicleDamageType) => {
    const current = value[side];
    const exists = current.includes(type);
    onChange({
      ...value,
      [side]: exists ? current.filter((item) => item !== type) : [...current, type],
    });
  };

  const setActiveSideOnly = (side: VehicleDamageSide) => {
    setActiveSide(side);
    setPickerSide(side);
  };

  const sideCount = (side: VehicleDamageSide) => value[side].length;
  const sideOptions: Array<{ side: VehicleDamageSide; label: string }> = [
    { side: 'front', label: 'קדימה' },
    { side: 'right', label: 'צד ימין' },
    { side: 'left', label: 'צד שמאל' },
    { side: 'back', label: 'אחורה' },
  ];

  const sideButtonClass = (side: VehicleDamageSide) =>
    cn(
      'rounded-full border px-4 py-2 text-xs font-semibold transition-all',
      activeSide === side
        ? 'border-cyan-200 bg-gradient-to-r from-cyan-400/35 to-blue-500/35 text-white shadow-[0_0_22px_rgba(34,211,238,0.55)]'
        : 'border-white/20 bg-white/5 text-white/75 hover:border-cyan-300/55 hover:text-white hover:bg-cyan-500/10'
    );

  const sideHotspotClass = (side: VehicleDamageSide) => {
    const selected = activeSide === side;
    const marked = sideCount(side) > 0;
    return cn(
      'absolute z-20 flex w-36 cursor-pointer flex-col rounded-2xl border p-3 text-center transition-all duration-300',
      selected
        ? 'scale-105 border-cyan-200 bg-cyan-400/25 shadow-[0_0_25px_rgba(34,211,238,0.5)]'
        : marked
        ? 'border-amber-200/70 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
        : 'border-white/20 bg-[#081325]/85 hover:border-cyan-300/60 hover:bg-cyan-500/10'
    );
  };

  const markers = sideOptions.flatMap(({ side }) => {
    const anchor = SIDE_MARKER_ANCHOR[side];
    return value[side].map((type, idx) => ({
      id: `${side}-${type}-${idx}`,
      label: DAMAGE_MARKER_LABEL[type],
      title: `${DAMAGE_SIDE_LABELS[side]}: ${DAMAGE_TYPE_LABELS[type]}`,
      x: anchor.x + (idx % 2 === 0 ? -2 : 2),
      y: anchor.y + Math.floor(idx / 2) * 4,
    }));
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="text-right">
        <h3 className="flex items-center justify-end gap-2 text-lg font-semibold text-white">
          <Sparkles className="h-4 w-4 text-cyan-300" />
          זיהוי פגיעות ברכב
        </h3>
        <p className="text-sm text-cyan-100/70">לחצי על אזור פגיעה סביב הרכב ואז בחרי את סוג הנזק.</p>
      </div>

      <div className="relative rounded-3xl border border-cyan-300/35 bg-gradient-to-b from-[#102846] via-[#0a1b31] to-[#050f1f] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
        <div className="mx-auto max-w-[920px]">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            {sideOptions.map(({ side, label }) => (
              <button key={side} type="button" onClick={() => setActiveSideOnly(side)} className={sideButtonClass(side)}>
                {label} {sideCount(side) > 0 ? `(${sideCount(side)})` : ''}
              </button>
            ))}
          </div>

          <div className="relative mx-auto mt-4 flex h-[470px] items-center justify-center overflow-hidden rounded-3xl border border-cyan-300/25 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.2),rgba(2,6,23,0.55)_52%,rgba(2,6,23,0.95)_100%)] sm:h-[560px] md:h-[680px]">
            <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:26px_26px]" />
            <div className="absolute left-1/2 top-[56%] h-16 w-[280px] -translate-x-1/2 rounded-full bg-cyan-500/30 blur-2xl sm:h-20 sm:w-[460px]" />

            <button type="button" onClick={() => setActiveSideOnly('right')} className={cn(sideHotspotClass('right'), 'right-6 top-1/2 hidden -translate-y-1/2 md:flex')}>
              <span className="text-sm font-semibold text-white">צד ימין</span>
              <span className="text-xs text-cyan-100/80">{sideCount('right') ? `${sideCount('right')} סימונים` : 'ללא סימון'}</span>
            </button>

            <button type="button" onClick={() => setActiveSideOnly('left')} className={cn(sideHotspotClass('left'), 'left-6 top-1/2 hidden -translate-y-1/2 md:flex')}>
              <span className="text-sm font-semibold text-white">צד שמאל</span>
              <span className="text-xs text-cyan-100/80">{sideCount('left') ? `${sideCount('left')} סימונים` : 'ללא סימון'}</span>
            </button>

            <button type="button" onClick={() => setActiveSideOnly('front')} className={cn(sideHotspotClass('front'), 'left-1/2 top-6 hidden -translate-x-1/2 md:flex')}>
              <span className="text-sm font-semibold text-white">קדימה</span>
              <span className="text-xs text-cyan-100/80">{sideCount('front') ? `${sideCount('front')} סימונים` : 'ללא סימון'}</span>
            </button>

            <button type="button" onClick={() => setActiveSideOnly('back')} className={cn(sideHotspotClass('back'), 'bottom-6 left-1/2 hidden -translate-x-1/2 md:flex')}>
              <span className="text-sm font-semibold text-white">אחורה</span>
              <span className="text-xs text-cyan-100/80">{sideCount('back') ? `${sideCount('back')} סימונים` : 'ללא סימון'}</span>
            </button>

            <div className="absolute left-1/2 top-1/2 z-10 flex h-[320px] w-[250px] -translate-x-1/2 -translate-y-1/2 items-center justify-center sm:h-[390px] sm:w-[300px] md:h-[470px] md:w-[360px]">
              <img
                src={realisticTopCar}
                alt="הדמיית רכב"
                // Rotate 90° so the car faces UP (per ops spec)
                className="h-full w-full rotate-90 scale-[1.18] origin-center select-none object-contain object-center drop-shadow-[0_24px_45px_rgba(0,0,0,0.62)]"
                draggable={false}
              />

              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className="pointer-events-none absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/90 bg-red-600 text-[10px] font-black text-white shadow-[0_0_16px_rgba(239,68,68,0.9)]"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  title={marker.title}
                >
                  {marker.label}
                </div>
              ))}

              {activeSide === 'right' && (
                <div className="pointer-events-none absolute inset-y-0 right-0 w-5 rounded-full bg-cyan-300/35 blur-[1px]" />
              )}
              {activeSide === 'left' && (
                <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-cyan-400/40 blur-sm" />
              )}
              {activeSide === 'front' && (
                <div className="pointer-events-none absolute left-1/2 top-[45px] h-6 w-36 -translate-x-1/2 rounded-full bg-cyan-300/35 blur-[1px]" />
              )}
              {activeSide === 'back' && (
                <div className="pointer-events-none absolute bottom-[45px] left-1/2 h-6 w-36 -translate-x-1/2 rounded-full bg-cyan-300/35 blur-[1px]" />
              )}
            </div>

            <div className="absolute right-3 top-3 hidden rounded-full border border-cyan-300/45 bg-cyan-500/20 px-3 py-1 text-xs text-cyan-100 sm:block">
              <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Damage Matrix</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
            {sideOptions.map(({ side, label }) => (
              <button
                key={`mobile-${side}`}
                type="button"
                onClick={() => setActiveSideOnly(side)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-center text-sm transition-all',
                  activeSide === side
                    ? 'border-cyan-200 bg-cyan-500/20 text-white'
                    : sideCount(side) > 0
                    ? 'border-amber-200/70 bg-amber-400/20 text-white'
                    : 'border-white/20 bg-white/5 text-white/80'
                )}
              >
                <span className="block font-semibold">{label}</span>
                <span className="text-xs text-cyan-100/80">{sideCount(side) ? `${sideCount(side)} סימונים` : 'ללא סימון'}</span>
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-cyan-100/70">
            לחיצה על כרטיס צד תעבור למצב סימון ממוקד ותאפשר דיווח פגיעה מדויק.
          </p>
        </div>

        {pickerSide && (
          <div className="relative z-30 mt-4 rounded-2xl border border-cyan-300/45 bg-[#061427]/95 p-4 shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm md:absolute md:inset-x-4 md:bottom-4 md:mt-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPickerSide(null)}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                סגור
              </button>
              <p className="text-sm font-semibold text-white">סוגי נזק עבור {DAMAGE_SIDE_LABELS[pickerSide]}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DAMAGE_TYPES.map((type) => {
                const selected = value[pickerSide].includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleDamageType(pickerSide, type)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm transition-colors',
                      selected
                        ? 'border-cyan-300 bg-cyan-500/20 text-cyan-200'
                        : 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10'
                    )}
                  >
                    {DAMAGE_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
