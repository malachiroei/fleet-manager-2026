-- =============================================================================
-- Production: הפעלת פעולות מהירות / קילומטראז' (הרץ אחרי sync או בנפרד).
-- המפתחות בקוד: qa_report_mileage, qa_vehicle_delivery, form_return —
-- מעדכנים גם שמות חלופיים אם קיימים ב-DB.
-- =============================================================================

INSERT INTO public.feature_flags (feature_key, display_name_he, description, category, is_enabled_globally)
VALUES
  ('qa_add_mileage', 'דיווח קילומטראז'' (מפתח חלופי)', 'מקביל ל-qa_report_mileage', 'quick_actions', true),
  ('qa_handover_car', 'מסירת רכב (מפתח חלופי)', 'מקביל ל-qa_vehicle_delivery', 'quick_actions', true),
  ('qa_return_car', 'החזרת רכב (מפתח חלופי)', 'מקביל ל-form_return', 'quick_actions', true)
ON CONFLICT (feature_key) DO UPDATE SET
  is_enabled_globally = true;

UPDATE public.feature_flags
SET is_enabled_globally = true
WHERE feature_key IN (
  'qa_service_update',
  'qa_report_mileage',
  'qa_add_mileage',
  'qa_vehicle_delivery',
  'qa_handover_car',
  'qa_forms',
  'form_delivery',
  'form_return',
  'qa_return_car'
);

INSERT INTO public.feature_flags (feature_key, display_name_he, description, category, is_enabled_globally)
VALUES
  ('qa_forms', 'טפסים', 'מרכז טפסים', 'quick_actions', true),
  ('form_delivery', 'טפסי מסירה', 'include_in_delivery', 'forms', true),
  ('form_return', 'טפסי החזרה', 'include_in_return', 'forms', true)
ON CONFLICT (feature_key) DO UPDATE SET is_enabled_globally = true;

NOTIFY pgrst, 'reload schema';
