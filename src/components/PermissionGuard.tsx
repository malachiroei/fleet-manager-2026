import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { PermissionKey } from '@/lib/permissions';

interface PermissionGuardProps {
  permission: PermissionKey;
  children: ReactNode;
}

/**
 * Renders children if the current user can access the route.
 * Admins and fleet managers (from user_roles) always have access.
 * Users with an org_id (profile.org_id) are allowed during permissions refactor.
 * Other users need the specific permission in their profile.
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { hasPermission, isAdmin, isManager, profile, roles } = useAuth();
  const roleList = roles?.length ? roles.join(', ') : '(none)';
  console.log('PermissionGuard', { permission, isAdmin, isManager, userRoles: roleList, profileOrgId: profile?.org_id ?? null });

  if (isAdmin || isManager) {
    return <>{children}</>;
  }
  if (profile?.org_id != null) {
    return <>{children}</>;
  }
  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
