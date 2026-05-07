import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/fleet';
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';
import type { PermissionKey } from '@/lib/permissions';

/**
 * מי רואה ת"ז, כתובת, מסמכי רישיון, הערות פנימיות וכו' — מנהלי צי / אדמין / הרשאות ניהול.
 */
export function canViewDriverSensitivePii(options: {
  profile: Profile | null;
  user: User | null;
  isAdmin: boolean;
  isManager: boolean;
  hasPermission: (permission: PermissionKey) => boolean;
}): boolean {
  const email = resolveSessionEmail(options.profile, options.user);
  if (options.isAdmin || options.isManager) return true;
  if (options.profile?.is_system_admin === true) return true;
  if (isPlatformSuperOwnerEmail(email) || isFleetOrgAdminFallbackEmail(email)) return true;
  if (options.hasPermission('manage_team') || options.hasPermission('admin_access')) return true;
  /** הרשאת «נהגים» כבר מאפשרת עריכה — בלי זה הבחירה בלקוח מחזירה פרופיל מצומצם והשדות נראים ריקים אחרי רענון. */
  if (options.hasPermission('drivers')) return true;
  return false;
}

/**
 * עמודות drivers ב-PostgREST: מנהלי צי רואים הכל; אחרים — תצוגה מצומצמת בלי PII/מסמכים.
 * RLS עדיין מגן בשרת; כאן מונעים דליפה דרך select('*') בטעות בלקוח.
 */
export const DRIVER_SELECT_COLUMNS_PUBLIC =
  [
    'id',
    'org_id',
    'user_id',
    'managed_by_user_id',
    'full_name',
    'license_expiry',
    'pending_license_expiry',
    'status',
    'is_active',
    'driving_permit',
    'job_title',
    'department',
    'division',
    'area',
    'group_name',
    'group_code',
    'eligibility',
    'work_start_date',
    'is_field_person',
    'health_declaration_date',
    'safety_training_date',
    'regulation_585b_date',
    'practical_driving_test_date',
    'safety_officer',
    'created_at',
    'updated_at',
  ].join(', ');

export const DRIVER_SELECT_ALL = '*';
