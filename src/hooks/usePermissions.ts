import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isFeatureEnabled, useFeatureFlags } from '@/hooks/useFeatureFlags';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Unified permissions gate for UI sections.
 * - Route-level role/permission gate: useAuth().hasPermission
 * - Feature-flag gate (user overrides + global defaults): useFeatureFlags()
 *
 * Important: when feature flags are unresolved, we default to HIDE (false)
 * to avoid showing disabled UI briefly in view-as mode.
 */
export function usePermissions() {
  const { user, profile, hasPermission } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  const email = (profile?.email ?? user?.email ?? '').trim().toLowerCase();
  const isSuperAdmin = email === 'malachiroei@gmail.com';

  const canAccessPermission = useCallback(
    (permission?: PermissionKey) => {
      if (!permission) return true;
      return hasPermission(permission);
    },
    [hasPermission],
  );

  const canAccessFeature = useCallback(
    (featureKey?: string) => {
      if (!featureKey) return true;
      if (featureKey === 'qa_team') {
        return isSuperAdmin || hasPermission('manage_team');
      }
      if (!featureFlags) return false;
      return isFeatureEnabled(featureFlags, featureKey);
    },
    [featureFlags, hasPermission, isSuperAdmin],
  );

  const canAccessUi = useCallback(
    ({ permission, featureKey }: { permission?: PermissionKey; featureKey?: string }) => {
      return canAccessPermission(permission) && canAccessFeature(featureKey);
    },
    [canAccessPermission, canAccessFeature],
  );

  return {
    canAccessPermission,
    canAccessFeature,
    canAccessUi,
  };
}

