/**
 * יעד «חזרה» לפי היררכיית מסכים — לא לפי ערימת history של הדפדפן,
 * כדי שלא יחזיר למסך שביקרת בו בעבר (למשל כרטיס רכב אחרי חזרה לדשבורד).
 */
export function resolveLogicalBackTarget(pathname: string): string {
  const p = (pathname.replace(/\/+$/, '') || '/').trim();

  if (p === '/' || p === '') return '/';

  if (p === '/vehicles/add' || p === '/vehicles/odometer' || p === '/vehicles/service-update') {
    return '/vehicles';
  }
  if (p === '/vehicles/transfers') return '/';

  const vehicleEdit = /^\/vehicles\/([^/]+)\/edit$/.exec(p);
  if (vehicleEdit) return `/vehicles/${vehicleEdit[1]}`;

  if (/^\/vehicles\/[^/]+$/.test(p)) return '/vehicles';
  if (p === '/vehicles') return '/';

  if (p === '/drivers/add') return '/drivers';

  const driverSection = /^\/drivers\/([^/]+)\/section\/[^/]+$/.exec(p);
  if (driverSection) return `/drivers/${driverSection[1]}/edit`;

  const driverEdit = /^\/drivers\/([^/]+)\/edit$/.exec(p);
  if (driverEdit) return '/drivers';

  if (/^\/drivers\/[^/]+$/.test(p)) return '/drivers';
  if (p === '/drivers') return '/';

  if (p === '/procedure6-complaints') return '/compliance';
  if (p === '/compliance') return '/';

  if (p === '/maintenance/add') return '/';

  if (p.startsWith('/handover/')) return '/';

  if (p === '/report-mileage') return '/';

  if (p === '/admin/users') return '/admin/dashboard';
  if (
    p === '/admin/settings' ||
    p === '/admin-settings' ||
    p === '/admin/dashboard' ||
    p === '/admin/compliance' ||
    p === '/admin/org-settings' ||
    p === '/team'
  ) {
    return '/';
  }

  if (p === '/reports/scan') return '/reports';
  if (p === '/reports') return '/';

  if (p === '/forms') return '/';

  return '/';
}
