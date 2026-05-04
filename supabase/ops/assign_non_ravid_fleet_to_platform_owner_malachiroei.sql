-- =============================================================================
-- מנהל על (malachiroei): להחזיר שיוך org + managed_by לפרופיל שלו לכל הרכבים/נהגים
-- שאינם שייכים לצי של רביד.
--
-- מה לא נוגעים בו: כל שורה ש־managed_by_user_id = פרופיל ravidmalachi@gmail.com
-- (ה־5 נהגים וה־2 רכבים של רביד נשארים אצלו).
--
-- הרץ SELECT קודם — וודא שספירות מתאימות לציפייה (למשל ~9 רכבים + ~6 נהגים תחת מנהל העל
-- אחרי הסקריפט, ~2 רכבים + ~5 נהגים תחת רביד). אם יש גם צי roeima21 — ראה הערה בסוף.
-- =============================================================================

-- --- שלב 1: מזהים (אימות) ---
SELECT id AS malachiroei_profile_id, email, org_id AS malachiroei_org_id
FROM public.profiles
WHERE lower(trim(email)) = 'malachiroei@gmail.com';

SELECT id AS ravid_profile_id, email, org_id
FROM public.profiles
WHERE lower(trim(email)) = 'ravidmalachi@gmail.com';

-- --- שלב 2: ספירות לפני (globally / לפי managed_by) ---
SELECT 'drivers' AS tbl, managed_by_user_id, count(*) AS n
FROM public.drivers
GROUP BY managed_by_user_id
ORDER BY n DESC;

SELECT 'vehicles' AS tbl, managed_by_user_id, count(*) AS n
FROM public.vehicles
GROUP BY managed_by_user_id
ORDER BY n DESC;

-- --- שלב 3: עדכון נהגים — כל מי שלא מנוהל על ידי רביד → malachiroei ---
UPDATE public.drivers AS d
SET
  managed_by_user_id = m.id,
  org_id = m.org_id,
  updated_at = now()
FROM (
  SELECT id, org_id
  FROM public.profiles
  WHERE lower(trim(email)) = 'malachiroei@gmail.com'
  LIMIT 1
) AS m
WHERE m.id IS NOT NULL
  AND m.org_id IS NOT NULL
  AND d.managed_by_user_id IS DISTINCT FROM (
    SELECT id FROM public.profiles WHERE lower(trim(email)) = 'ravidmalachi@gmail.com' LIMIT 1
  );

-- --- שלב 4: עדכון רכבים — אותו עיקרון ---
UPDATE public.vehicles AS v
SET
  managed_by_user_id = m.id,
  org_id = m.org_id,
  updated_at = now()
FROM (
  SELECT id, org_id
  FROM public.profiles
  WHERE lower(trim(email)) = 'malachiroei@gmail.com'
  LIMIT 1
) AS m
WHERE m.id IS NOT NULL
  AND m.org_id IS NOT NULL
  AND v.managed_by_user_id IS DISTINCT FROM (
    SELECT id FROM public.profiles WHERE lower(trim(email)) = 'ravidmalachi@gmail.com' LIMIT 1
  );

-- --- שלב 5: ספירות אחרי ---
SELECT 'drivers after' AS lbl, managed_by_user_id, count(*) AS n
FROM public.drivers
GROUP BY managed_by_user_id
ORDER BY n DESC;

SELECT 'vehicles after' AS lbl, managed_by_user_id, count(*) AS n
FROM public.vehicles
GROUP BY managed_by_user_id
ORDER BY n DESC;

-- =============================================================================
-- הערה: אם יש נכסים שצריכים להישאר אצל roeima21 (אדמין נפרד), הוסף לכל UPDATE:
--   AND d.managed_by_user_id IS DISTINCT FROM (
--     SELECT id FROM public.profiles WHERE lower(trim(email)) = 'roeima21@gmail.com' LIMIT 1
--   )
-- (ובדוק ספירות לפני/אחרי.)
-- =============================================================================
