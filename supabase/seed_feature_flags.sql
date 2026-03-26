-- Feature flags: עמודות תצוגה + קטגוריה (הרץ פעם אחת לפני ה-INSERT)
alter table public.feature_flags
  add column if not exists display_name_he text;

alter table public.feature_flags
  add column if not exists description text;

alter table public.feature_flags
  add column if not exists category text;

-- אינדקס ייחודי למפתח (לסנכרון ולמניעת כפילויות)
create unique index if not exists feature_flags_feature_key_uidx on public.feature_flags (feature_key);

-- הזרקת פיצ׳רים — כולם פעילים בהתחלה
insert into public.feature_flags (feature_key, display_name_he, description, category, is_enabled_globally)
values
  ('dashboard_vehicles', 'רכבים', 'כרטיס דשבורד — ניהול צי רכבים', 'dashboard', true),
  ('dashboard_drivers', 'נהגים', 'כרטיס דשבורד — ניהול נהגים', 'dashboard', true),
  ('dashboard_replacement_car', 'רכב חליפי', 'כרטיס דשבורד — מרכז רכב חליפי', 'dashboard', true),
  ('dashboard_exception_alerts', 'התראות חריגה', 'כרטיס דשבורד — התראות ציות וחריגות', 'dashboard', true),
  ('qa_procedure6_complaints', 'תלונות נוהל 6', 'קישור מהיר — תלונות נוהל 6', 'quick_actions', true),
  ('qa_report_mileage', 'דיווח קילומטראז׳', 'קישור מהיר — דיווח ק״מ', 'quick_actions', true),
  ('qa_admin_settings', 'הגדרות מערכת', 'קישור מהיר — הגדרות מנהל', 'quick_actions', true),
  ('qa_forms', 'טפסים', 'קישור מהיר — מרכז הטפסים', 'quick_actions', true),
  ('qa_parking_reports', 'דוחות חניה', 'קישור מהיר — דוחות סריקת חניה', 'quick_actions', true),
  ('qa_reports', 'הפקת דוחות', 'קישור מהיר — דוחות וייצוא', 'quick_actions', true),
  ('qa_accidents', 'תאונות', 'קישור מהיר — ציות / תאונות', 'quick_actions', true),
  ('qa_vehicle_delivery', 'מסירת רכב', 'קישור מהיר — טופס מסירת רכב', 'quick_actions', true),
  ('qa_replacement_car', 'רכב חליפי (פעולות מהירות)', 'קישור מהיר בסרגל — מרכז רכב חליפי', 'quick_actions', true),
  ('qa_team', 'ניהול צוות', 'קישור מהיר — ניהול צוות', 'quick_actions', true),
  ('qa_users', 'ניהול משתמשים', 'קישור מהיר — משתמשים ואישורים', 'quick_actions', true),
  ('form_delivery', 'טופס מסירה', 'הצגת טפסים לשימוש במסירה', 'forms', true),
  ('form_return', 'טופס החזרה', 'הצגת טפסים לשימוש בהחזרה', 'forms', true)
on conflict (feature_key) do nothing;
