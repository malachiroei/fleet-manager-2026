export type VehicleDamageSide = 'front' | 'back' | 'left' | 'right';
export type VehicleDamageType = 'dent' | 'scratch' | 'scuff' | 'crack';

export type VehicleDamageReport = Record<VehicleDamageSide, VehicleDamageType[]>;

export const DAMAGE_TYPE_LABELS: Record<VehicleDamageType, string> = {
  dent: 'מכה',
  scratch: 'סריטה',
  scuff: 'שפשוף',
  crack: 'שבר',
};

export const DAMAGE_SIDE_LABELS: Record<VehicleDamageSide, string> = {
  front: 'קדימה',
  back: 'אחורה',
  right: 'צד ימין',
  left: 'צד שמאל',
};

export const DAMAGE_TYPES: VehicleDamageType[] = ['dent', 'scratch', 'scuff', 'crack'];
export const DAMAGE_SIDES: VehicleDamageSide[] = ['front', 'back', 'right', 'left'];

export const EMPTY_DAMAGE_REPORT: VehicleDamageReport = {
  front: [],
  back: [],
  right: [],
  left: [],
};

export function hasAnyDamage(report: VehicleDamageReport): boolean {
  return DAMAGE_SIDES.some((side) => report[side].length > 0);
}

export function summarizeDamageReport(report: VehicleDamageReport): string {
  const parts: string[] = [];

  for (const side of DAMAGE_SIDES) {
    if (!report[side].length) continue;
    const damageLabels = report[side].map((type) => DAMAGE_TYPE_LABELS[type]).join(', ');
    parts.push(`${DAMAGE_SIDE_LABELS[side]}: ${damageLabels}`);
  }

  return parts.length ? parts.join(' | ') : 'ללא נזקים מסומנים';
}

export function cloneEmptyDamageReport(): VehicleDamageReport {
  return {
    front: [],
    back: [],
    right: [],
    left: [],
  };
}

export function parseDamageSummaryLine(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const line = notes
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('דיווח נזק:'));
  if (!line) return null;
  return line.replace('דיווח נזק:', '').trim() || null;
}

export function extractSidesFromSummary(summary: string): VehicleDamageSide[] {
  const found: VehicleDamageSide[] = [];
  if (summary.includes('קדימה')) found.push('front');
  if (summary.includes('אחורה')) found.push('back');
  if (summary.includes('צד ימין')) found.push('right');
  if (summary.includes('צד שמאל')) found.push('left');
  return found;
}
