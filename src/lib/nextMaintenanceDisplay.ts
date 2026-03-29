import type { Vehicle } from '@/types/fleet';

/** מד אוץ לצורך השוואה ל־next_maintenance_km — כמו בדף פרטי רכב */
export function effectiveOdometerForMaintenance(
  v: Pick<Vehicle, 'current_odometer' | 'last_service_km'>,
): number {
  const odo = Number(v.current_odometer) || 0;
  const ls =
    v.last_service_km != null && !Number.isNaN(Number(v.last_service_km))
      ? Number(v.last_service_km)
      : 0;
  return Math.max(odo, ls);
}

export function nextMaintenanceKmRemaining(
  v: Pick<Vehicle, 'current_odometer' | 'last_service_km' | 'next_maintenance_km'>,
): number | null {
  if (v.next_maintenance_km == null) return null;
  const next = Number(v.next_maintenance_km);
  if (!Number.isFinite(next)) return null;
  return next - effectiveOdometerForMaintenance(v);
}

export type NextMaintenanceKmUrgency = 'none' | 'ok' | 'orange' | 'red';

/** ≤1000 ק״מ (כולל באיחור) = אדום; ≤2500 = כתום; אחרת תקין */
export function nextMaintenanceKmUrgency(remaining: number | null): NextMaintenanceKmUrgency {
  if (remaining == null) return 'none';
  if (remaining <= 1000) return 'red';
  if (remaining <= 2500) return 'orange';
  return 'ok';
}

export function nextMaintenanceCountdownLabelHe(remaining: number | null): string | null {
  if (remaining == null) return null;
  const r = Math.round(remaining);
  if (r < 0) {
    return `באיחור — עברו ${Math.abs(r).toLocaleString()} ק״מ`;
  }
  if (r === 0) return 'הגעת ליעד הטיפול';
  return `עוד ${r.toLocaleString()} ק״מ לטיפול`;
}

export function nextMaintenanceCardStyles(urgency: NextMaintenanceKmUrgency): {
  border: string;
  ring: string;
  iconClass: string;
  countdownClass: string;
  kmTargetClass: string;
} {
  switch (urgency) {
    case 'red':
      return {
        border: 'border-red-500/70',
        ring: 'shadow-[0_0_20px_rgba(239,68,68,0.22)]',
        iconClass: 'text-red-400',
        countdownClass: 'text-red-300 font-semibold',
        kmTargetClass: 'text-red-200/90',
      };
    case 'orange':
      return {
        border: 'border-orange-500/60',
        ring: 'shadow-[0_0_16px_rgba(249,115,22,0.18)]',
        iconClass: 'text-orange-400',
        countdownClass: 'text-orange-200 font-semibold',
        kmTargetClass: 'text-orange-100/90',
      };
    default:
      return {
        border: 'border-white/10',
        ring: '',
        iconClass: 'text-purple-400',
        countdownClass: 'text-slate-300',
        kmTargetClass: 'text-slate-300',
      };
  }
}
