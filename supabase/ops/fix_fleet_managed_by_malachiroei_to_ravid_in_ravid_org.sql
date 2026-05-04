-- =============================================================================
-- בעיה: רכבים/נהגים ב־org רביד עם managed_by = malachiroei (מנהל על).
--   • roeima21 (ילד של malachiroei) רואה אותם — זה נכון לפי RLS אבל לא לפי המוצר.
--   • אריק / malachiroei1 (ילדים של רביד) לא רואים — כי managed_by ≠ רביד.
--
-- פתרון: לשייך את הצי לרביד; רק נהגים/רכבים ששייכים ל־roeima21 נשארים אצלו.
-- הרץ: קודם SELECT, אחרי אימות — UPDATE.
-- =============================================================================

-- מזהים ידועים (תואמים לפרופילים אצלך)
-- org רביד: 2bb0f9c3-b210-4099-b0c5-de92794d5cc9
-- malachiroei: 200ebcdd-9900-4e74-88fd-1ff3993e5f3e
-- רביד:      26854798-162b-4369-b34b-3010267678bd
-- roeima21:  72c77494-79a5-4ad5-a38a-65d34155a6ca

-- --- שלב 1: מה המצב עכשיו ---
SELECT id, full_name, email, user_id, managed_by_user_id
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
ORDER BY full_name;

SELECT id, plate_number, managed_by_user_id
FROM public.vehicles
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
ORDER BY plate_number;

-- --- שלב 2: נהגים «של roeima21» → managed_by = roeima21 (התאם אימייל אם שונה) ---
UPDATE public.drivers
SET
  managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca',
  updated_at = now()
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id = '200ebcdd-9900-4e74-88fd-1ff3993e5f3e'
  AND (
    user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
    OR lower(trim(coalesce(email, ''))) = 'roeima21@gmail.com'
  );

-- --- שלב 3: כל השאר שעדיין malachiroei → רביד ---
UPDATE public.drivers
SET
  managed_by_user_id = '26854798-162b-4369-b34b-3010267678bd',
  updated_at = now()
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id = '200ebcdd-9900-4e74-88fd-1ff3993e5f3e';

-- --- שלב 4: רכבים — אותו עיקרון (אין רכב «של roeima21» אם לא יודעים — הכול לרביד) ---
-- אם יש רכב שצריך להישאר אצל roeima21, הוסף תנאי AND לפני השלב הזה.
UPDATE public.vehicles
SET
  managed_by_user_id = '26854798-162b-4369-b34b-3010267678bd',
  updated_at = now()
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id = '200ebcdd-9900-4e74-88fd-1ff3993e5f3e';

-- --- שלב 5: ספירות אחרי ---
SELECT managed_by_user_id, count(*) AS n
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
GROUP BY managed_by_user_id;

SELECT managed_by_user_id, count(*) AS n
FROM public.vehicles
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
GROUP BY managed_by_user_id;
