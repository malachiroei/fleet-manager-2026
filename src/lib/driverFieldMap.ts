/**
 * Single source of truth: Edit form ↔ List card section mapping (Natalie sync).
 * Section order and field order must match EditDriverPage cards.
 *
 * DriverCard must render every key listed in DRIVER_SECTION_FIELDS; empty values
 * show as MISSING_DATA ('חסר נתון') in muted gray — see DriverCard.tsx.
 */
export const DRIVER_SECTION_IDS = [
  'personal',
  'organizational',
  'licenses',
  'safety',
] as const;

export type DriverSectionId = (typeof DRIVER_SECTION_IDS)[number];

export const DRIVER_SECTION_LABELS: Record<DriverSectionId, string> = {
  personal: 'פרטים אישיים',
  organizational: 'שיוך ארגוני',
  licenses: 'רישיונות',
  safety: 'כשירות ובטיחות',
};

/** query param / anchor id לגלילה ממוקדת מכרטיס הרשימה */
export const DRIVER_SECTION_QUERY_PARAM = 'section';

/** Field keys per section — matches EditDriverPage input names */
export const DRIVER_SECTION_FIELDS: Record<DriverSectionId, readonly string[]> = {
  personal: ['full_name', 'id_number', 'phone', 'email', 'address'],
  organizational: ['job_title', 'department'],
  licenses: ['license_number', 'license_expiry'],
  safety: ['health_declaration_date', 'safety_training_date', 'regulation_585b_date'],
};

/** Hebrew labels for display (aligned with EditDriverPage Label text) */
export const DRIVER_FIELD_LABELS: Record<string, string> = {
  full_name: 'שם מלא',
  id_number: 'תעודת זהות',
  phone: 'טלפון',
  email: 'אימייל',
  address: 'כתובת מגורים',
  job_title: 'תפקיד',
  department: 'מחלקה',
  license_number: 'מספר רישיון נהיגה',
  license_expiry: 'תוקף רישיון נהיגה',
  health_declaration_date: 'תאריך הצהרת בריאות',
  safety_training_date: 'תאריך הדרכת בטיחות',
  regulation_585b_date: "תאריך בדיקת תקנה 585ב'",
};
