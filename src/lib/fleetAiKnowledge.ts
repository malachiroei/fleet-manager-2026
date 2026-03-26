/**
 * fleetAiKnowledge — מרכז הידע של העוזר הפנימי (Fleet AI)
 * ───────────────────────────────────────────────────────────────────────────
 * קובץ הגדרות בלבד: אין כאן לוגיקה טכנית או שאילתות.
 * מיועד לשליפה/הזנה להקשר (prompt, תיעוד, או הרחבת aiQueryEngine בעתיד).
 */

// ─────────────────────────────────────────────
// Data Schema — שדות שקיימים במערכת (לשאילתות ותשובות)
// ─────────────────────────────────────────────

/**
 * שדות נהג / רכב שהוגדרו או הודגשו כחלק מהעדכונים — העוזר צריך לדעת
 * שהם קיימים כדי לא להכחיש נתונים ולשאול/להציג לפי שמות אלה.
 */
export const DATA_SCHEMA = {
  /** נהג — שיוך ארגוני */
  driverOrganizational: [
    'department — מחלקה',
    'job_title — תפקיד',
    'employee_number, driver_code, division, area, group_name, group_code',
    'eligibility — כשירות',
    'work_start_date — תחילת עבודה',
  ],
  /** נהג — כשירות ובטיחות */
  driverSafety: [
    'regulation_585b_date — תאריך בדיקת רישיון לפי תקנה 585 ב׳ (תוקף מחושב +3 שנים)',
    'health_declaration_date, safety_training_date, practical_driving_test_date',
    'is_field_person — איש שטח',
  ],
  /** רכב — תחזוקה ומדדים */
  vehicleMaintenance: [
    'last_service_km — ק״מ טיפול אחרון (משמש גם לחישוב מד אוץ מוצג)',
    'last_service_date — תאריך טיפול אחרון',
    'next_maintenance_km, next_maintenance_date — טיפול הבא',
    'last_tire_change_date, next_tire_change_date — צמיגים',
  ],
  /** רכב — מד אוץ גולמי */
  vehicleOdometerRaw: [
    'current_odometer — ק״מ רשומים במערכת',
    'last_odometer_date — תאריך עדכון מד אוץ',
  ],
} as const;

// ─────────────────────────────────────────────
// Business Logic — כללים עסקיים (לא מימוש קוד)
// ─────────────────────────────────────────────

/**
 * מד אוץ (הערך המוצג למשתמש בלוח הבקרה/סקירת רכב):
 * תמיד המקסימום בין:
 * - current_odometer
 * - last_service_km (כאשר קיים וגדול מהמד הרשום)
 * כך שלא יוצג מד נמוך יותר מק״מ שדווח בעת טיפול.
 */
export const BUSINESS_LOGIC_ODOMETER_DISPLAY = `
מד אוץ מוצג = max(current_odometer, last_service_km אם קיים).
עדכון טיפול עם last_service_km גבוה מ-current_odometer אמור לעדכן גם את המד הרשום.
` as const;

// ─────────────────────────────────────────────
// Navigation — Storage + אפליקציה (להפניות למסמכים)
// ─────────────────────────────────────────────

/** Bucket ראשי למסמכי רכב וארכיון מסירות */
export const STORAGE_BUCKET_VEHICLE_DOCUMENTS = 'vehicle-documents';

/** Bucket לצילומי מסירה (אם רלוונטי להפניה) */
export const STORAGE_BUCKET_HANDOVER_PHOTOS = 'handover-photos';

/**
 * מבנה נתיבים ב-Storage (עקרונות — לא URL מלא):
 * - רכב / מסירה: documents/{vehicleId}/{timestamp}/ — קבצים כמו reception_*.pdf, procedure_*.pdf, license_front_*.jpg
 * - נהג (העלאות מהבוט/זרימות): driver_{driverId}/license_front_*.jpg, driver_{driverId}/license_back_*.jpg
 * מסמכים מקושרים גם בטבלאות (למשל driver_documents) עם file_url.
 */
export const STORAGE_PATH_CONVENTIONS = {
  vehicleFolderPattern: 'documents/{vehicleId}/{timestamp}/',
  driverLicensePattern: 'driver_{driverId}/license_front_*.jpg | license_back_*.jpg',
} as const;

/** נתיבי אפליקציה להפניה למסכים ותיקיות */
export const APP_NAVIGATION = {
  vehiclesList: '/vehicles',
  vehicleDetail: '/vehicles/:id',
  vehicleFolders: '/vehicles/:id — תיקיות ניהול (הוצאות, תחזוקה, מסירות)',
  driversList: '/drivers',
  driverFolders: '/drivers?folders={driverId} — תיקיות נהג',
  driverSectionEdit: '/drivers/:id/section/{personal|organizational|licenses|safety}',
} as const;

// ─────────────────────────────────────────────
// Assistant Tone — איך העוזר עונה
// ─────────────────────────────────────────────

/**
 * כללים לסגנון תשובה: ניהולי, תמציתי, מבוסס נתונים בלבד.
 * לא להמציא — אם אין בנתונים, לומר שלא זמין או להפנות למסך הרלוונטי.
 */
export const ASSISTANT_TONE = {
  style: 'ניהולי ותמציתי',
  rules: [
    'להסתמך רק על נתונים מהמערכת (Supabase/שדות לעיל) — לא להנחות חיצוניות.',
    'לענות בעברית ברורה; כותרות/נקודות כשמדובר ברשימות.',
    'אם חסר שדה — לציין "חסר נתון" או להפנות לעריכה במשבצת המתאימה.',
    'לא להאריך בהקדמות; עדיפות לעובדות (תאריכים, מספרים, סטטוסים).',
  ],
} as const;

// ─────────────────────────────────────────────
// אגרגציה אחת לייבוא נוח (ללא לוגיקה)
// ─────────────────────────────────────────────

export const FLEET_AI_KNOWLEDGE = {
  dataSchema: DATA_SCHEMA,
  businessLogicOdometer: BUSINESS_LOGIC_ODOMETER_DISPLAY,
  storage: {
    bucketVehicleDocuments: STORAGE_BUCKET_VEHICLE_DOCUMENTS,
    bucketHandoverPhotos: STORAGE_BUCKET_HANDOVER_PHOTOS,
    pathConventions: STORAGE_PATH_CONVENTIONS,
  },
  navigation: APP_NAVIGATION,
  tone: ASSISTANT_TONE,
} as const;

export type FleetAiKnowledge = typeof FLEET_AI_KNOWLEDGE;
