-- =============================================================================
-- יישור נתונים אחרי מיזוג שגוי:
-- מחזירים לארגון של malachiroei + managed_by = malachiroei את כל הרכבים/נהגים
-- שנמצאים כרגע ב־org של רביד (2bb0f9c3-…) אבל *לא* מסומנים כמנוהלים ע״י רביד או roeima21.
--
-- נשארים ב־2bb0f9c3: שורות עם managed_by_user_id = רביד או = roeima21 (הצי שלהם).
--
-- הרץ ב-Supabase SQL Editor. גיבוי לפני UPDATE. אין UPDATE גורף בלי WHERE.
-- =============================================================================

-- מזהה ארגון «הצי של רביד» (כמו ב־RAVID_FLEET_ORG_ID בקוד)
-- '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'

-- --- שלב 1: ספירות לפני ---
SELECT 'vehicles by org (before)' AS lbl, org_id, count(*) AS n
FROM public.vehicles
GROUP BY org_id
ORDER BY n DESC;

SELECT 'drivers by org (before)' AS lbl, org_id, count(*) AS n
FROM public.drivers
GROUP BY org_id
ORDER BY n DESC;

SELECT 'vehicles in Ravid org by managed_by' AS lbl, managed_by_user_id, count(*) AS n
FROM public.vehicles
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
GROUP BY managed_by_user_id;

SELECT 'drivers in Ravid org by managed_by' AS lbl, managed_by_user_id, count(*) AS n
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
GROUP BY managed_by_user_id;

-- --- שלב 2: עדכון רכבים ---
UPDATE public.vehicles v
SET
  org_id = (SELECT p.org_id FROM public.profiles p WHERE lower(trim(p.email)) = 'malachiroei@gmail.com' LIMIT 1),
  managed_by_user_id = (SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'malachiroei@gmail.com' LIMIT 1),
  updated_at = now()
WHERE v.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND (SELECT p.org_id FROM public.profiles p WHERE lower(trim(p.email)) = 'malachiroei@gmail.com' LIMIT 1) IS NOT NULL
  AND v.managed_by_user_id IS DISTINCT FROM (
    SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com' LIMIT 1
  )
  AND v.managed_by_user_id IS DISTINCT FROM (
    SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'roeima21@gmail.com' LIMIT 1
  );

-- --- שלב 3: עדכון נהגים ---
UPDATE public.drivers d
SET
  org_id = (SELECT p.org_id FROM public.profiles p WHERE lower(trim(p.email)) = 'malachiroei@gmail.com' LIMIT 1),
  managed_by_user_id = (SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'malachiroei@gmail.com' LIMIT 1),
  updated_at = now()
WHERE d.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND (SELECT p.org_id FROM public.profiles p WHERE lower(trim(p.email)) = 'malachiroei@gmail.com' LIMIT 1) IS NOT NULL
  AND d.managed_by_user_id IS DISTINCT FROM (
    SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com' LIMIT 1
  )
  AND d.managed_by_user_id IS DISTINCT FROM (
    SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'roeima21@gmail.com' LIMIT 1
  );

-- --- שלב 4: ספירות אחרי ---
SELECT 'vehicles by org (after)' AS lbl, org_id, count(*) AS n
FROM public.vehicles
GROUP BY org_id
ORDER BY n DESC;

SELECT 'drivers by org (after)' AS lbl, org_id, count(*) AS n
FROM public.drivers
GROUP BY org_id
ORDER BY n DESC;
