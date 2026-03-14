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
};

/**
 * Returns true if the profile has the given permission.
 * Admins and fleet_managers (from user_roles) are treated as having all permissions when profile.permissions is missing.
 */
export function hasPermission(
  profile: Profile | null,
  permission: PermissionKey,
  roles?: { isAdmin: boolean; isManager: boolean }
): boolean {
  if (!profile) return false;
  const perms = profile.permissions as ProfilePermissions | null | undefined;
  if (perms && typeof perms[permission] === 'boolean') {
    return perms[permission] === true;
  }
  if (roles?.isAdmin || roles?.isManager) return true;
  return false;
}

export function getDefaultPermissions(): ProfilePermissions {
  return PERMISSION_KEYS.reduce<ProfilePermissions>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}
