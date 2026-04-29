import type { FleetColumnOption } from '@/components/fleet/FleetTableColumnsSheet';

/** עמודות אופציונליות (ללא צ׳קבוקס ושם נהג) */
export const DRIVER_HUD_OPTIONAL_COLUMNS: FleetColumnOption[] = [
  { id: 'id_number', label: 'תעודת זהות' },
  { id: 'assigned_vehicle_model', label: 'סוג רכב משויך' },
  { id: 'assigned_vehicle_plate', label: 'מספר רכב משויך' },
  { id: 'status', label: 'סטטוס' },
  { id: 'phone', label: 'טלפון' },
  { id: 'license_expiry', label: 'תוקף רישיון' },
  { id: 'driver_code', label: 'קוד נהג' },
  { id: 'employee_number', label: 'מספר עובד' },
  { id: 'email', label: 'דוא״ל' },
  { id: 'address', label: 'כתובת' },
  { id: 'city', label: 'עיר' },
  { id: 'job_title', label: 'תפקיד' },
  { id: 'department', label: 'מחלקה' },
  { id: 'group_name', label: 'קבוצה' },
  { id: 'group_code', label: 'קוד קבוצה' },
  { id: 'division', label: 'חטיבה' },
  { id: 'area', label: 'אזור' },
  { id: 'safety_officer', label: 'קצין בטיחות' },
  { id: 'birth_date', label: 'תאריך לידה' },
  { id: 'work_start_date', label: 'תאריך תחילת עבודה' },
  { id: 'license_number', label: 'מספר רישיון' },
  { id: 'driving_permit', label: 'סוג רישיון / היתר' },
  { id: 'health_declaration_date', label: 'תאריך הצהרת בריאות' },
  { id: 'safety_training_date', label: 'הדרכת בטיחות' },
  { id: 'regulation_585b_date', label: 'תקנה 585ב' },
  { id: 'practical_driving_test_date', label: 'מבחן מעשי' },
  { id: 'eligibility', label: 'זכאות' },
  { id: 'rating', label: 'דירוג' },
  { id: 'note1', label: 'הערה 1' },
  { id: 'note2', label: 'הערה 2' },
  { id: 'is_field_person', label: 'איש שטח' },
  { id: 'is_active', label: 'פעיל / לא פעיל' },
];

export const DRIVER_HUD_OPTIONAL_IDS = DRIVER_HUD_OPTIONAL_COLUMNS.map((c) => c.id);

export const DEFAULT_DRIVER_HUD_OPTIONAL_VISIBLE = [
  'id_number',
  'assigned_vehicle_model',
  'assigned_vehicle_plate',
  'status',
  'phone',
  'license_expiry',
] as const;
