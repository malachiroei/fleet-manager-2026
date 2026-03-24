import type { VersionSnapshotFeature, VersionSnapshotFeatureType } from '@/lib/versionSnapshotTypes';

/** סוג תצוגה לפריט — נגזר מנתיב הקובץ או מפריטי תשתית ידניים. */
export type VersionPublishInventoryKind = 'form' | 'page' | 'button' | 'hook' | 'infra';

export type VersionPublishInventoryItem = {
  id: string;
  kind: VersionPublishInventoryKind;
  name: string;
  group: string;
};

const GROUP_INFRA = 'תשתית (Logic / Infrastructure)';
const GROUP_PAGES = 'דפים (Pages)';
const GROUP_FORMS = 'טפסים (Forms)';
const GROUP_HOOKS = 'כלים (Hooks / Logic)';

const GROUP_ORDER = [GROUP_INFRA, GROUP_PAGES, GROUP_FORMS, GROUP_HOOKS];

/** קבצי שורש — לא נסרקים ב-glob; נכללים במפורש לפרסום גרסה. */
const ROOT_INFRA_ITEMS: VersionPublishInventoryItem[] = [
  {
    id: 'root/package.json',
    kind: 'infra',
    name: 'package.json',
    group: GROUP_INFRA,
  },
  {
    id: 'root/package-lock.json',
    kind: 'infra',
    name: 'package-lock.json',
    group: GROUP_INFRA,
  },
];

const pagesGlob = import.meta.glob('../pages/**/*.tsx', { eager: false });
const componentsGlob = import.meta.glob('../components/**/*.tsx', { eager: false });
const hooksGlob = import.meta.glob('../hooks/**/*.{ts,tsx}', { eager: false });

function shouldSkipPath(normalized: string): boolean {
  if (normalized.includes('/ui/')) return true;
  if (normalized.includes('.test.')) return true;
  if (normalized.includes('.stories.')) return true;
  return false;
}

function toInventoryPath(globKey: string): string {
  return globKey.replace(/^\.\.\//, '');
}

function displayNameFromPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.(tsx|ts)$/i, '');
}

function classify(normalizedPath: string): { group: string; kind: VersionPublishInventoryKind } {
  const base = normalizedPath.split('/').pop() ?? '';
  const hasForm = /Form/i.test(base);
  const hasButton = /Button/i.test(base);

  if (hasForm) {
    return { group: GROUP_FORMS, kind: 'form' };
  }
  if (normalizedPath.startsWith('hooks/')) {
    return { group: GROUP_HOOKS, kind: 'hook' };
  }
  if (normalizedPath.startsWith('pages/')) {
    return { group: GROUP_PAGES, kind: 'page' };
  }
  if (normalizedPath.startsWith('components/')) {
    if (hasButton) {
      return { group: GROUP_HOOKS, kind: 'button' };
    }
    return { group: GROUP_HOOKS, kind: 'hook' };
  }
  return { group: GROUP_HOOKS, kind: 'hook' };
}

function scanInventory(): VersionPublishInventoryItem[] {
  const keys = new Set<string>([
    ...Object.keys(pagesGlob),
    ...Object.keys(componentsGlob),
    ...Object.keys(hooksGlob),
  ]);

  const items: VersionPublishInventoryItem[] = [];
  for (const key of keys) {
    const id = toInventoryPath(key);
    if (shouldSkipPath(id)) continue;
    if (!/^(pages|components|hooks)\//.test(id)) continue;
    const { group, kind } = classify(id);
    items.push({
      id,
      kind,
      name: displayNameFromPath(id),
      group,
    });
  }

  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}

/** מלאי: קבצי תשתית בשורש + סריקת glob — מתעדכן אחרי בנייה / רענון dev כשמוסיפים קבצים. */
export function getVersionPublishInventory(): VersionPublishInventoryItem[] {
  return [...ROOT_INFRA_ITEMS, ...scanInventory()];
}

export function buildVersionSnapshotFeaturesFromSelection(
  selectedIds: Set<string>
): VersionSnapshotFeature[] {
  const inv = getVersionPublishInventory();
  const out: VersionSnapshotFeature[] = [];
  for (const item of inv) {
    if (!selectedIds.has(item.id)) continue;
    const type: VersionSnapshotFeatureType =
      item.kind === 'page'
        ? 'page'
        : item.kind === 'form'
          ? 'form'
          : item.kind === 'button'
            ? 'button'
            : item.kind === 'infra'
              ? 'infra'
              : 'hook';
    out.push({
      id: item.id,
      type,
      name: item.name,
    });
  }
  return out;
}

export function versionPublishInventoryGroups(): { group: string; items: VersionPublishInventoryItem[] }[] {
  const map = new Map<string, VersionPublishInventoryItem[]>();
  for (const it of getVersionPublishInventory()) {
    if (!map.has(it.group)) map.set(it.group, []);
    map.get(it.group)!.push(it);
  }
  const entries = Array.from(map.entries()).map(([group, items]) => ({
    group,
    items: items.sort((a, b) => a.name.localeCompare(b.name, 'he')),
  }));
  entries.sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a.group);
    const ib = GROUP_ORDER.indexOf(b.group);
    const sa = ia === -1 ? GROUP_ORDER.length : ia;
    const sb = ib === -1 ? GROUP_ORDER.length : ib;
    if (sa !== sb) return sa - sb;
    return a.group.localeCompare(b.group, 'he');
  });
  return entries;
}
