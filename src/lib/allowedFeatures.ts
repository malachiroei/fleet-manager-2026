import type { Profile } from '@/types/fleet';
import type { PermissionKey } from '@/lib/permissions';

/** מפתחות הרשאה גסים — תואמים ל־allowed_features ב־profiles (JSONB מערך). */
export const ALLOWED_FEATURE_KEYS = [
  'REPLACEMENT_CAR',
  'CAR_TRANSFER',
  'DAMAGE_REPORT',
  'VIEW_REPORTS',
  'FLEET_EDIT',
  'USER_MANAGEMENT',
  'GARAGE_TREATMENTS',
  'TEST_INSURANCE',
] as const;

export type AllowedFeatureKey = (typeof ALLOWED_FEATURE_KEYS)[number];

export const ALLOWED_FEATURE_LABELS: Record<AllowedFeatureKey, string> = {
  REPLACEMENT_CAR: 'רכב חליפי',
  CAR_TRANSFER: 'מסירת/החזרת רכב',
  DAMAGE_REPORT: 'דיווח נזק',
  VIEW_REPORTS: 'צפייה בדוחות',
  FLEET_EDIT: 'עריכת פרטי צי',
  USER_MANAGEMENT: 'ניהול משתמשים והרשאות',
  GARAGE_TREATMENTS: 'טיפולי מוסך',
  TEST_INSURANCE: 'טסט וביטוח',
};

export const ALLOWED_FEATURE_GROUPS: {
  title: string;
  keys: AllowedFeatureKey[];
}[] = [
  {
    title: 'קבוצת תפעול רכב',
    keys: ['REPLACEMENT_CAR', 'CAR_TRANSFER', 'DAMAGE_REPORT'],
  },
  {
    title: 'קבוצת דוחות וניהול',
    keys: ['VIEW_REPORTS', 'FLEET_EDIT', 'USER_MANAGEMENT'],
  },
  {
    title: 'קבוצת תחזוקה',
    keys: ['GARAGE_TREATMENTS', 'TEST_INSURANCE'],
  },
];

const ALLOWED_SET = new Set<string>(ALLOWED_FEATURE_KEYS);

/** מנהל-על לבדיקות PermissionGuard — תמיד גישה מלאה (פרודקשן). */
export const SUPER_ADMIN_PERMISSION_EMAIL = 'malachiroei@gmail.com';

function parseEnvSuperAdminProfileIds(): Set<string> {
  const raw = import.meta.env.VITE_FLEET_SUPER_ADMIN_USER_IDS;
  if (typeof raw !== 'string' || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const SUPER_ADMIN_PROFILE_IDS = parseEnvSuperAdminProfileIds();

/**
 * חריג יחיד מברירת המחדל המחמירה: אימייל קבוע או profiles.id מתוך VITE_FLEET_SUPER_ADMIN_USER_IDS.
 */
export function isSuperAdminPermissionBypass(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  const email = profile.email?.trim().toLowerCase();
  if (email === SUPER_ADMIN_PERMISSION_EMAIL.toLowerCase()) return true;
  const id = profile.id?.trim();
  if (id && SUPER_ADMIN_PROFILE_IDS.size > 0 && SUPER_ADMIN_PROFILE_IDS.has(id)) return true;
  return false;
}

/**
 * מחזיר מערך מסונן של מפתחות תקפים, או null אם אין מערך JSONB תקין.
 * [] אחרי סינון = מערך ריק מפורש (חסום ב-PermissionGuard).
 */
export function normalizeAllowedFeaturesFromProfile(raw: unknown): AllowedFeatureKey[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: AllowedFeatureKey[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && ALLOWED_SET.has(x)) {
      out.push(x as AllowedFeatureKey);
    }
  }
  return out;
}

/**
 * דרישת פיצ'רים לכל מפתח PermissionGuard.
 * מפתח שלא ממופה — חסום (ברירת מחדל מחמירה).
 */
export const PERMISSION_REQUIRED_FEATURES: Partial<Record<PermissionKey, AllowedFeatureKey[]>> = {
  vehicles: ['FLEET_EDIT'],
  drivers: ['FLEET_EDIT'],
  handover: ['CAR_TRANSFER'],
  vehicle_delivery: ['CAR_TRANSFER'],
  replacement_car: ['REPLACEMENT_CAR'],
  procedure6_complaints: ['DAMAGE_REPORT'],
  mileage_update: ['VIEW_REPORTS'],
  report_mileage: ['VIEW_REPORTS'],
  reports: ['VIEW_REPORTS'],
  forms: ['VIEW_REPORTS'],
  compliance: ['DAMAGE_REPORT'],
  maintenance: ['GARAGE_TREATMENTS'],
  manage_team: ['USER_MANAGEMENT'],
  edit_rights: ['FLEET_EDIT'],
  delete_rights: ['FLEET_EDIT'],
  admin_access: ['USER_MANAGEMENT'],
};

/**
 * PermissionGuard: ברירת מחדל מחמירה.
 * - סופר־אדמין (אימייל / מזהה env) → תמיד true.
 * - אחרת: בודקים ש־allowed_features (JSONB) הוא מערך שמכיל את כל המפתחות הנדרשים למסלול.
 * - allowed_features חסר / לא מערך / ריק / ללא המפתחות הנדרשים → false.
 * - permission שלא ממופה ב-PERMISSION_REQUIRED_FEATURES → false.
 */
export function canAccessRouteWithAllowedFeatures(profile: Profile | null, permission: PermissionKey): boolean {
  if (isSuperAdminPermissionBypass(profile)) return true;

  const required = PERMISSION_REQUIRED_FEATURES[permission];
  if (!required?.length) return false;

  const explicit = normalizeAllowedFeaturesFromProfile(profile?.allowed_features);
  if (explicit === null) return false;
  if (explicit.length === 0) return false;

  return required.every((k) => explicit.includes(k));
}
