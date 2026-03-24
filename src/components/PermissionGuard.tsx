import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { canAccessRouteWithAllowedFeatures } from '@/lib/allowedFeatures';
import type { PermissionKey } from '@/lib/permissions';

interface PermissionGuardProps {
  permission: PermissionKey;
  children: ReactNode;
}

/**
 * ברירת מחדל מחמירה: תוכן חסום אלא אם ב-profiles.allowed_features מופיעים המפתחות הנדרשים (JSONB).
 * חריג: סופר־אדמין (malachiroei@gmail.com או VITE_FLEET_SUPER_ADMIN_USER_IDS) — תמיד מורשה.
 * אין גישה → null.
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { profile } = useAuth();

  const allowed = canAccessRouteWithAllowedFeatures(profile, permission);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
