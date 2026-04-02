import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isFeatureEnabled, useFeatureFlags } from '@/hooks/useFeatureFlags';
import type { PermissionKey } from '@/lib/permissions';
import { isFleetBootstrapOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';

/**
 * Unified permissions gate for UI sections.
 * - Route-level role/permission gate: useAuth().hasPermission
 * - Feature-flag gate (user overrides + global defaults): useFeatureFlags()
 *
 * When `featureFlags` is still undefined (edge case), allow UI — permission gates remain.
 * While loading, `useFeatureFlags` supplies placeholderData so flags are usually defined.
 */
export function usePermissions() {
  const { user, profile, hasPermission } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  const email = resolveSessionEmail(profile, user);
  const isSuperAdmin = isFleetBootstrapOwnerEmail(email);

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
      if (!featureFlags) return true;
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

