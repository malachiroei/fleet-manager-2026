type ComplianceTabKey =
  | 'annual_licensing'
  | 'insurance'
  | 'periodic_inspection'
  | 'maintenance'
  | 'driver_license'
  | 'health_declaration'
  | 'regulation_585';

/** פריט התראה מ-useComplianceAlerts — מזהה יעד במרכז ציות (מנהל) */
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
    const slot = id.split(':')[3] ?? '';
    if (slot === 'test' || slot === 'missing_test') return 'annual_licensing';
    if (slot === 'insurance' || slot === 'missing_insurance') return 'insurance';
    if (slot === 'inspection' || slot === 'missing_inspection') return 'periodic_inspection';
    if (slot === 'maintenance' || slot === 'missing_maintenance') return 'maintenance';
  }
  if (id.startsWith('derived:d:')) {
    const slot = id.split(':')[3] ?? '';
    if (slot === 'license' || slot === 'missing_license') return 'driver_license';
    if (slot === 'health' || slot === 'missing_health') return 'health_declaration';
    if (slot === 'r585' || slot === 'missing_r585') return 'regulation_585';
    if (slot === 'missing_practical_test') return 'driver_license';
    if (slot === 'missing_lic_front' || slot === 'missing_lic_back') return 'driver_license';
    if (slot === 'missing_health_doc') return 'health_declaration';
  }

  const at = alert.alertType || '';
  if (alert.type === 'vehicle') {
    if (/טסט|test/i.test(at)) return 'annual_licensing';
    if (/ביטוח|insurance/i.test(at)) return 'insurance';
    if (/ביקורת|inspection|תקופתית/i.test(at)) return 'periodic_inspection';
    if (/טיפול|maintenance|service/i.test(at)) return 'maintenance';
    return null;
  }
  if (/רישיון|license|נהג|בדיקת רישיון/i.test(at)) return 'driver_license';
  if (/בריאות|health|הצהרת/i.test(at)) return 'health_declaration';
  if (/חסר/.test(at)) {
    if (/טסט|ביטוח|ביקורת|טיפול/i.test(at)) {
      if (/טסט/i.test(at)) return 'annual_licensing';
      if (/ביטוח/i.test(at)) return 'insurance';
      if (/ביקורת/i.test(at)) return 'periodic_inspection';
      if (/טיפול/i.test(at)) return 'maintenance';
    }
  }
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
