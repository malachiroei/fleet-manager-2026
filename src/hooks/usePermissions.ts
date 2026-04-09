import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isFeatureEnabled, useFeatureFlags } from '@/hooks/useFeatureFlags';
import type { PermissionKey } from '@/lib/permissions';
import { accessAllowedByPermissionGuard } from '@/lib/allowedFeatures';
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
  const { user, profile, hasPermission, isAdmin, isManager } = useAuth();
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

  /** תואם ל־PermissionGuard (כולל allowed_features / FLEET_EDIT וכו') */
  const canAccessGuardedRoute = useCallback(
    (permission: PermissionKey) => {
      const bypassAllowedFeaturesSlice =
        isAdmin ||
        isManager ||
        profile?.is_system_admin === true ||
        isFleetBootstrapOwnerEmail(resolveSessionEmail(profile, user));
      return accessAllowedByPermissionGuard(profile, permission, hasPermission, {
        bypassAllowedFeaturesSlice,
      });
    },
    [profile, user, hasPermission, isAdmin, isManager],
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

  /**
   * שילוב הרשאת תפקיד + דגל פיצ'ר ל־UI (כרטיסים, תפריטים).
   * לא משלבים כאן allowed_features — זה נשאר ב־PermissionGuard בכניסה למסלול (הודעת חסימה במקום מסך ריק).
   */
  const canAccessUi = useCallback(
    ({ permission, featureKey }: { permission?: PermissionKey; featureKey?: string }) => {
      return canAccessPermission(permission) && canAccessFeature(featureKey);
    },
    [canAccessPermission, canAccessFeature],
  );

  return {
    canAccessPermission,
    canAccessGuardedRoute,
    canAccessFeature,
    canAccessUi,
  };
}

