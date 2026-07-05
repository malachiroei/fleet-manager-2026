import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { canAccessRouteWithAllowedFeatures, isSuperAdminPermissionBypass } from '@/lib/allowedFeatures';
import { isPlatformSuperOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import type { PermissionKey } from '@/lib/permissions';

interface PermissionGuardProps {
  permission?: PermissionKey;
  /** כשמוגדר — מספיק הרשאה אחת מהרשימה (למשל אשף מסירה אחרי vehicle_delivery או handover). */
  anyOf?: PermissionKey[];
  children: ReactNode;
}

/**
 * גישה למסלול:
 * - סופר־אדמין / בעל פלטפורמה (bootstrap) / `is_system_admin` בפרופיל → תמיד.
 * - אחרת: קודם `hasPermission` (מנהלים, JSON permissions / מערך, ברירות מחדל).
 * - ואז `canAccessRouteWithAllowedFeatures` (מניפסט `allowed_features` + חריגים כמו דיווח קילומטראז׳).
 *
 * סדר זה מונע מסך שחור כש־`allowed_features` ריק אבל יש הרשאות קלאסיות, ומותיר את מניפסט ה-UI
 * כשהוא מוגדר ומדויק.
 */
export function PermissionGuard({ permission, anyOf, children }: PermissionGuardProps) {
  const { profile, user, hasPermission } = useAuth();
  const keys = anyOf?.length ? anyOf : permission ? [permission] : [];

  if (isSuperAdminPermissionBypass(profile)) {
    return <>{children}</>;
  }
  if (profile?.is_system_admin === true) {
    return <>{children}</>;
  }
  const sessionEmail = resolveSessionEmail(profile, user);
  /** רק חשבון על — לא מנהלי ארגון (למשל רביד) שקיבלו בעבר את אותו bypass בטעות */
  if (isPlatformSuperOwnerEmail(sessionEmail)) {
    return <>{children}</>;
  }

  for (const key of keys) {
    if (hasPermission(key)) {
      return <>{children}</>;
    }
    if (canAccessRouteWithAllowedFeatures(profile, key)) {
      return <>{children}</>;
    }
  }

  return null;
}
