import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { PermissionKey } from '@/lib/permissions';

interface PermissionGuardProps {
  permission: PermissionKey;
  children: ReactNode;
}

/**
 * Renders children only if the current user has the given permission (or is admin/manager).
 * Otherwise redirects to home.
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
