import type { Profile, ProfilePermissions } from '@/types/fleet';

/** Permission keys used across the app. Add new ones here and in PERMISSION_LABELS. */
export const PERMISSION_KEYS = [
  'vehicles',
  'drivers',
  'handover',
  'reports',
  'forms',
  'compliance',
  'maintenance',
  'manage_team',
  'edit_rights',
  'delete_rights',
  'admin_access',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  vehicles: 'רכבים',
  drivers: 'נהגים',
  handover: 'מסירות / החזרות',
  reports: 'דוחות',
  forms: 'טפסים',
  compliance: 'התראות ותקינות',
  maintenance: 'תחזוקה',
  manage_team: 'ניהול צוות',
  edit_rights: 'זכויות עריכה',
  delete_rights: 'זכויות מחיקה',
  admin_access: 'גישת מנהל',
};

/**
 * Returns true if the profile has the given permission.
 * - Admins and fleet_managers (from user_roles) have all permissions.
 * - When profile.permissions is null or empty, treat as having all permissions so new users
 *   see the full dashboard and layout like existing users (no "empty" broken UI).
 */
export function hasPermission(
  profile: Profile | null,
  permission: PermissionKey,
  roles?: { isAdmin: boolean; isManager: boolean }
): boolean {
  if (!profile) return false;
  if (roles?.isAdmin || roles?.isManager) return true;
  const perms = profile.permissions as ProfilePermissions | null | undefined;
  if (perms && typeof perms === 'object' && Object.keys(perms).length > 0) {
    if (typeof perms[permission] === 'boolean') return perms[permission] === true;
    return false;
  }
  return true;
}

export function getDefaultPermissions(): ProfilePermissions {
  return PERMISSION_KEYS.reduce<ProfilePermissions>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}
