import {
  FLEET_UI_FEATURE_CATALOG,
  FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN,
  FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN,
  FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN,
  FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN,
} from '@/lib/fleetPublishedUiFeatures';
import type { VersionSnapshotFeature, VersionSnapshotFeatureType } from '@/lib/versionSnapshotTypes';

export type VersionPublishInventoryKind = 'form' | 'button' | 'page';

export type VersionPublishInventoryItem = {
  id: string;
  kind: VersionPublishInventoryKind;
  name: string;
  group: string;
  /** לשיוך לטוקן UI_FEATURE (אופציונלי) */
  token?: string;
};

function catalogItemsFromFeatureCatalog(): VersionPublishInventoryItem[] {
  return FLEET_UI_FEATURE_CATALOG.map((e) => ({
    id: e.token,
    kind: e.category === 'forms' ? 'form' : e.category === 'dashboard' || e.category === 'header' ? 'button' : 'button',
    name: e.title,
    group:
      e.category === 'forms'
        ? 'טפסים ומסמכים (טוקני הרשאה)'
        : e.category === 'dashboard'
          ? 'כפתורי דשבורד'
          : e.category === 'header'
            ? 'כותרת'
            : 'ניהול',
    token: e.token,
  }));
}

/** טפסי מערכת מהקטלוג הגלובלי — חסרים מ־FLEET_UI_FEATURE_CATALOG אך בשימוש ב־bypass / הרשאות */
const EXTRA_FORM_TOKEN_ITEMS: VersionPublishInventoryItem[] = [
  {
    id: FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN,
    kind: 'form',
    name: 'טופס סטטוס רכב',
    group: 'טפסים ומסמכים (טוקני הרשאה)',
    token: FLEET_UI_FEATURE_FORM_VEHICLE_STATUS_TOKEN,
  },
  {
    id: FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN,
    kind: 'form',
    name: 'טופס מסירת רכב',
    group: 'טפסים ומסמכים (טוקני הרשאה)',
    token: FLEET_UI_FEATURE_FORM_CAR_HANDOVER_TOKEN,
  },
  {
    id: FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN,
    kind: 'form',
    name: 'טופס טיפול תקופתי',
    group: 'טפסים ומסמכים (טוקני הרשאה)',
    token: FLEET_UI_FEATURE_FORM_PERIODIC_MAINTENANCE_TOKEN,
  },
  {
    id: FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN,
    kind: 'form',
    name: 'טופס דיווח תיקון',
    group: 'טפסים ומסמכים (טוקני הרשאה)',
    token: FLEET_UI_FEATURE_FORM_REPAIR_REPORT_TOKEN,
  },
];

/** עמודים / זרימות מרכזיות (מסלולי Router) */
const ROUTE_FLOW_ITEMS: VersionPublishInventoryItem[] = [
  { id: 'route_forms', kind: 'page', name: 'עמוד טפסים — /forms', group: 'עמודים וזרימות' },
  { id: 'route_handover_wizard', kind: 'page', name: 'אשף מסירה/החזרה — /handover/wizard', group: 'עמודים וזרימות' },
  { id: 'route_handover_delivery', kind: 'page', name: 'מסירת רכב — /handover/delivery', group: 'עמודים וזרימות' },
  { id: 'route_handover_return', kind: 'page', name: 'החזרת רכב — /handover/return', group: 'עמודים וזרימות' },
  { id: 'route_maintenance_add', kind: 'page', name: 'הוספת תחזוקה — /maintenance/add', group: 'עמודים וזרימות' },
  { id: 'route_report_mileage', kind: 'page', name: 'דיווח ק״מ — /report-mileage', group: 'עמודים וזרימות' },
  { id: 'route_vehicles_add', kind: 'page', name: 'הוספת רכב — /vehicles/add', group: 'עמודים וזרימות' },
  { id: 'route_drivers_add', kind: 'page', name: 'הוספת נהג — /drivers/add', group: 'עמודים וזרימות' },
  { id: 'route_team', kind: 'page', name: 'ניהול צוות — /team', group: 'עמודים וזרימות' },
  { id: 'route_org_settings', kind: 'page', name: 'הגדרות ארגון — /admin/org-settings', group: 'עמודים וזרימות' },
  { id: 'route_admin_settings', kind: 'page', name: 'הגדרות מערכת — /admin/settings', group: 'עמודים וזרימות' },
];

function dedupeById(items: VersionPublishInventoryItem[]): VersionPublishInventoryItem[] {
  const seen = new Set<string>();
  const out: VersionPublishInventoryItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/** מלאי לפרסום גרסה — טפסים, כפתורי UI מזוהים, ועמודים מרכזיים */
export const VERSION_PUBLISH_INVENTORY: VersionPublishInventoryItem[] = dedupeById([
  ...catalogItemsFromFeatureCatalog(),
  ...EXTRA_FORM_TOKEN_ITEMS.filter((x) => !FLEET_UI_FEATURE_CATALOG.some((c) => c.token === x.id)),
  ...ROUTE_FLOW_ITEMS,
]);

export function buildVersionSnapshotFeaturesFromSelection(
  selectedIds: Set<string>
): VersionSnapshotFeature[] {
  const out: VersionSnapshotFeature[] = [];
  for (const item of VERSION_PUBLISH_INVENTORY) {
    if (!selectedIds.has(item.id)) continue;
    const type: VersionSnapshotFeatureType =
      item.kind === 'page' ? 'page' : item.kind === 'form' ? 'form' : 'button';
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
  for (const it of VERSION_PUBLISH_INVENTORY) {
    const g = it.group;
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(it);
  }
  return Array.from(map.entries()).map(([group, items]) => ({
    group,
    items: items.sort((a, b) => a.name.localeCompare(b.name, 'he')),
  }));
}
