-- =============================================================================
-- אחרי העתקת נתונים מסטייג' לפרו: טפסים מופיעים ב-Supabase אבל לא באפליקציה
-- =============================================================================
--
-- סיבות נפוצות:
-- 1) org_documents.is_active = false — דף /forms מציג רק is_active = true (מלבד ארכיון למנהלים).
-- 2) feature_flags: form_delivery / form_return / qa_forms כבויים — הרץ גם prod_enable_qa_feature_flags.sql
-- 3) vehicle_handovers.org_id עדיין UUID של ארגון הסטייג' — האפליקציה מסננת לפי activeOrgId של המשתמש בפרו.
-- 4) vehicle_id במסירה לא קיים ב-public.vehicles בפרו — RLS על vehicle_handovers דורש רכב קיים שנראה למשתמש.
--
-- בדיקות אבחון (החלף :prod_org ב-UUID הארגון בפרודקשן):
-- =============================================================================

-- כמה מסירות לפי org_id
-- SELECT org_id, count(*) FROM public.vehicle_handovers GROUP BY 1 ORDER BY 2 DESC;

-- מסירות "יתומות" (אין רכב בפרו)
-- SELECT h.id, h.org_id, h.vehicle_id
-- FROM public.vehicle_handovers h
-- LEFT JOIN public.vehicles v ON v.id = h.vehicle_id
-- WHERE v.id IS NULL;

-- טפסים לא פעילים
-- SELECT id, title, is_active FROM public.org_documents WHERE is_active = false ORDER BY updated_at DESC;

-- =============================================================================
-- תיקון org_id אם ייבאת מהסטייג' (דוגמה — ערוך UUID לפני הרצה)
-- =============================================================================
-- UPDATE public.vehicle_handovers
-- SET org_id = 'PASTE_PRODUCTION_ORG_UUID_HERE'
-- WHERE org_id = 'PASTE_STAGING_ORG_UUID_HERE';

-- =============================================================================
-- להפעיל מחדש טפסים שיובאו ככבויים
-- =============================================================================
-- UPDATE public.org_documents SET is_active = true WHERE is_active = false;
