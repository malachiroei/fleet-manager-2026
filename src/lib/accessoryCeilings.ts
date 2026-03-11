export interface AccessoryCeiling {
  id: string;
  name: string;
  maxPriceNis: number | null;
}

export const HANDOVER_ACCESSORY_CEILINGS: AccessoryCeiling[] = [
  { id: 'spare_wheel', name: 'גלגל רזרבי', maxPriceNis: 200 },
  { id: 'jack', name: 'מגבה', maxPriceNis: 90 },
  { id: 'wheel_wrench', name: 'מפתח גלגלים', maxPriceNis: 30 },
  { id: 'warning_tri', name: 'משולש אזהרה', maxPriceNis: 40 },
  { id: 'toolkit', name: 'סט כלים', maxPriceNis: 80 },
  { id: 'first_aid', name: 'ערכת עזרה ראשונה', maxPriceNis: 75 },
  { id: 'fire_ext', name: 'מטף כיבוי אש', maxPriceNis: 120 },
  { id: 'fuel_card', name: 'כרטיס דלק', maxPriceNis: null },
  { id: 'manual', name: 'ספר הוראות הפעלה', maxPriceNis: 50 },
  { id: 'reflective', name: 'אפוד זוהר', maxPriceNis: 25 },
];

export function formatCeilingPrice(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `₪${value}`;
}
