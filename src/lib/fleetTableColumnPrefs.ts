const PREFIX = 'fleet.table.columns.';

export function fleetTableColumnsStorageKey(kind: 'vehicles' | 'drivers'): string {
  return `${PREFIX}${kind}`;
}

/** קורא רשימת עמודות אופציונליות מוצגות (בסדר). */
export function readOptionalColumnIds(storageKey: string, allowed: Set<string>, fallback: string[]): string[] {
  if (typeof window === 'undefined') return [...fallback];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return [...fallback];
    const vis = (parsed as { visible?: unknown }).visible;
    if (!Array.isArray(vis)) return [...fallback];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of vis) {
      const id = String(x ?? '').trim();
      if (!id || !allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    if (out.length === 0) return [...fallback];
    return out;
  } catch {
    return [...fallback];
  }
}

export function writeOptionalColumnIds(storageKey: string, visibleIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ v: 1, visible: visibleIds }));
  } catch {
    /* ignore quota */
  }
}
