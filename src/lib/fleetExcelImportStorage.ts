/** זמני טעינת אקסל רכבים/נהגים — localStorage (לפי מכשיר) + מפתח לפי org כשיש */

const LS_VEHICLE = 'last_vehicle_upload';
const LS_DRIVER = 'last_driver_upload';

export function persistFleetExcelImportTimestamp(kind: 'vehicle' | 'driver', orgId: string | null | undefined): string {
  const iso = new Date().toISOString();
  const base = kind === 'vehicle' ? LS_VEHICLE : LS_DRIVER;
  const oid = typeof orgId === 'string' ? orgId.trim() : '';
  try {
    localStorage.setItem(base, iso);
    if (oid) localStorage.setItem(`${base}_${oid}`, iso);
  } catch {
    // ignore quota / private mode
  }
  return iso;
}

export function readFleetExcelImportTimestamp(kind: 'vehicle' | 'driver', orgId: string | null | undefined): string | null {
  const base = kind === 'vehicle' ? LS_VEHICLE : LS_DRIVER;
  const oid = typeof orgId === 'string' ? orgId.trim() : '';
  try {
    if (oid) {
      const scoped = localStorage.getItem(`${base}_${oid}`);
      if (scoped) return scoped;
    }
    return localStorage.getItem(base);
  } catch {
    return null;
  }
}

export function pickLatestIsoString(...candidates: (string | null | undefined)[]): string | null {
  let bestMs = -Infinity;
  let best: string | null = null;
  for (const raw of candidates) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) continue;
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}

export const FLEET_EXCEL_IMPORT_EVENT = 'fleet-excel-import' as const;
