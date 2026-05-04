-- =============================================================================
-- הקשר: באותו org (`2bb0f9c3…`) חלק מהנהגים עם managed_by = roeima21 וחלק עם רביד.
--   אריק / malachiroei1 רואים רק שורות עם managed_by = רביד (או NULL) — לכן חסרים 3 נהגים.
--   roeima21 רואה את שלושת אלו כי managed_by = הוא.
--
-- אם כל צי «רביד» אמור להיות תחת רביד בלבד — העבר את נהגי roeima21 לרביד.
-- אם נהג אחד הוא באמת רק של roeima21 (למשל חשבון נהג שלו), השאר אותו אצלו:
--   הוסף ל-WHERE לא לעדכן: AND lower(trim(email)) <> 'roeima21@gmail.com'
--
-- הרץ SELECT קודם; גיבוי לפני UPDATE.
-- =============================================================================

-- רביד / roeima21 / org (עדכן מזהים אם השתנו אצלך)
-- ravid:   26854798-162b-4369-b34b-3010267678bd
-- roeima21: 72c77494-79a5-4ad5-a38a-65d34155a6ca
-- org:     2bb0f9c3-b210-4099-b0c5-de92794d5cc9

SELECT id, full_name, email, user_id, managed_by_user_id
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
ORDER BY full_name;

UPDATE public.drivers
SET
  managed_by_user_id = '26854798-162b-4369-b34b-3010267678bd',
  updated_at = now()
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
  -- להחריג נהג אישי של roeima21 אם צריך:
  -- AND lower(trim(coalesce(email, ''))) <> 'roeima21@gmail.com'
;

SELECT managed_by_user_id, count(*) AS n
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
GROUP BY managed_by_user_id;
