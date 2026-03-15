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
 * Users with an active org (activeOrgId or profile.org_id) are allowed during permissions refactor.
 * Other users need the specific permission in their profile.
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { hasPermission, isAdmin, isManager, activeOrgId } = useAuth();

  if (isAdmin || isManager) {
    return <>{children}</>;
  }
  if (activeOrgId != null) {
    return <>{children}</>;
  }
  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
