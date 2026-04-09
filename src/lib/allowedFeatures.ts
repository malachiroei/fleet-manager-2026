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
const FULL_ALLOWED_FEATURE_SET = new Set<string>(ALLOWED_FEATURE_KEYS);

function explicitHasAllAllowedFeatures(explicit: AllowedFeatureKey[]): boolean {
  if (explicit.length < FULL_ALLOWED_FEATURE_SET.size) return false;
  const s = new Set(explicit);
  for (const k of FULL_ALLOWED_FEATURE_SET) {
    if (!s.has(k)) return false;
  }
  return true;
}

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
 * מערך ריק אחרי סינון — ב־accessAllowedByPermissionGuard מתייחסים כמו «לא הוגדר».
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

export type AccessPermissionGuardOptions = {
  /**
   * מנהל צי / אדמין / בעלים מזוהה — לא מיישמים את מגבלת allowed_features (מיועד לנהגים עם רשימת JSONB).
   */
  bypassAllowedFeaturesSlice?: boolean;
};

/**
 * אותה לוגיקה כמו PermissionGuard — לשימוש ב־usePermissions וכו'.
 */
export function accessAllowedByPermissionGuard(
  profile: Profile | null | undefined,
  permission: PermissionKey,
  hasPermission: (p: PermissionKey) => boolean,
  opts?: AccessPermissionGuardOptions,
): boolean {
  if (isSuperAdminPermissionBypass(profile)) return true;

  if (
    hasPermission('handover') &&
    (permission === 'replacement_car' || permission === 'vehicle_delivery')
  ) {
    return true;
  }

  if (!hasPermission(permission)) return false;

  if (opts?.bypassAllowedFeaturesSlice) return true;

  const required = PERMISSION_REQUIRED_FEATURES[permission];
  if (!required?.length) return false;

  const explicit = normalizeAllowedFeaturesFromProfile(profile?.allowed_features);
  /** לא הוגדר מערך בפרופיל — נשענים על hasPermission בלבד */
  if (explicit === null) return true;
  /**
   * מערך ריק או שלא נשארו מפתחות תקפים אחרי סינון — מתייחסים כמו «לא הוגדר» (מונע חסימה שגויה
   * אחרי מיגרציות / שמירת UI ריקה).
   */
  if (explicit.length === 0) return true;
  /** נבחרו כל הפיצ'רים במסך הניהול — גישה מלאה לכל המסלולים הממופים */
  if (explicitHasAllAllowedFeatures(explicit)) return true;

  return required.every((k) => explicit.includes(k));
}

/**
 * @deprecated השתמש ב־accessAllowedByPermissionGuard עם hasPermission — פונקציה זו לא תואמת את השער
 * (מחזירה false כש־allowed_features חסר, בעוד השער מאפשר במקרה הזה).
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
