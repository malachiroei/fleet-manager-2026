-- =============================================================================
-- פרודקשן: טפסים / מסירה-החזרה — שורות ב-feature_flags עם is_enabled_globally=false
-- מסתירות טפסים ב-FormsPage למרות ש-org_documents מלא (סינון canAccessFeature).
-- =============================================================================

INSERT INTO public.feature_flags (feature_key, display_name_he, description, category, is_enabled_globally)
VALUES
  (
    'qa_forms',
    'טפסים',
    'מרכז טפסים ופעולות מהירות',
    'quick_actions',
    true
  ),
  (
    'form_delivery',
    'טפסי מסירה',
    'טפסים שמסומנים include_in_delivery',
    'forms',
    true
  ),
  (
    'form_return',
    'טפסי החזרה',
    'טפסים שמסומנים include_in_return',
    'forms',
    true
  ),
  (
    'qa_vehicle_delivery',
    'מסירת רכב',
    'אשף מסירה מהדשבורד',
    'quick_actions',
    true
  )
ON CONFLICT (feature_key) DO UPDATE SET
  is_enabled_globally = true,
  display_name_he = COALESCE(EXCLUDED.display_name_he, public.feature_flags.display_name_he),
  description = COALESCE(EXCLUDED.description, public.feature_flags.description),
  category = COALESCE(EXCLUDED.category, public.feature_flags.category);
