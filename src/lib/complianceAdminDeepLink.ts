type ComplianceTabKey =
  | 'annual_licensing'
  | 'insurance'
  | 'periodic_inspection'
  | 'maintenance'
  | 'driver_license'
  | 'health_declaration'
  | 'regulation_585';

/** פריט התראה מ-useComplianceAlerts — מזהה יעד במגדל ציות (מנהל) */
export type ComplianceAlertNavItem = {
  id: string;
  type: 'vehicle' | 'driver';
  entityId?: string;
  alertType: string;
};

/**
 * מחזיר טאב במסך /admin/compliance לפי סוג ההתראה.
 * תומך ב-derived ids (derived:v:uuid:test) וב-alert_type בעברית מהמסד.
 */
export function alertToAdminComplianceTab(alert: ComplianceAlertNavItem): ComplianceTabKey | null {
  const id = alert.id ?? '';
  if (id.startsWith('derived:v:')) {
    const slot = id.split(':')[3];
    if (slot === 'test') return 'annual_licensing';
    if (slot === 'insurance') return 'insurance';
    if (slot === 'inspection') return 'periodic_inspection';
    if (slot === 'maintenance') return 'maintenance';
  }
  if (id.startsWith('derived:d:')) {
    const slot = id.split(':')[3];
    if (slot === 'license') return 'driver_license';
    if (slot === 'health') return 'health_declaration';
    if (slot === 'r585') return 'regulation_585';
  }

  const at = alert.alertType || '';
  if (alert.type === 'vehicle') {
    if (/טסט|test/i.test(at)) return 'annual_licensing';
    if (/ביטוח|insurance/i.test(at)) return 'insurance';
    if (/ביקורת|inspection|תקופתית/i.test(at)) return 'periodic_inspection';
    if (/טיפול|maintenance|service/i.test(at)) return 'maintenance';
    return null;
  }
  if (/רישיון|license|נהג/i.test(at)) return 'driver_license';
  if (/בריאות|health/i.test(at)) return 'health_declaration';
  if (/585/.test(at)) return 'regulation_585';
  return null;
}

export function complianceAdminDeepLink(alert: ComplianceAlertNavItem): string | null {
  const tab = alertToAdminComplianceTab(alert);
  const entityId = alert.entityId?.trim();
  if (!tab || !entityId) return null;
  const q = new URLSearchParams();
  q.set('tab', tab);
  q.set('focus', entityId);
  return `/admin/compliance?${q.toString()}`;
}
