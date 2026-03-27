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
  const { hasPermission } = useAuth();
  const { data: featureFlags } = useFeatureFlags();

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
      if (!featureFlags) return false;
      return isFeatureEnabled(featureFlags, featureKey);
    },
    [featureFlags],
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

