-- =============================================================================
-- אבחון: אילו רכבים/נהגים "של רועי" (malachiroei@gmail.com) — לפי org בפרופיל,
-- לפי managed_by, ולפי org שנשמר ב-localStorage / מתג (להשוות ידנית).
-- הרץ ב-Supabase SQL Editor (פרויקט נכון). אין כאן UPDATE.
-- =============================================================================

-- 0) פרופיל רועי — org_id ומזהה
SELECT id, email, full_name, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) = 'malachiroei@gmail.com';

-- 1) רכבים באותו org כמו הפרופיל של רועי (מה שהאפליקציה מסננת ב-.eq('org_id', …))
SELECT v.id, v.plate_number, v.org_id, v.managed_by_user_id
FROM public.vehicles v
JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
WHERE v.org_id IS NOT DISTINCT FROM p.org_id
ORDER BY v.plate_number;

-- 2) נהגים באותו org כמו הפרופיל של רועי
SELECT d.id, d.full_name, d.org_id, d.managed_by_user_id
FROM public.drivers d
JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
WHERE d.org_id IS NOT DISTINCT FROM p.org_id
ORDER BY d.full_name;

-- 3) רכבים שמסומנים לרועי כמנהל (managed_by = profiles.id שלו)
SELECT v.id, v.plate_number, v.org_id, v.managed_by_user_id
FROM public.vehicles v
JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
WHERE v.managed_by_user_id = p.id
ORDER BY v.plate_number;

-- 4) נהגים שמסומנים לרועי כמנהל
SELECT d.id, d.full_name, d.org_id, d.managed_by_user_id
FROM public.drivers d
JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
WHERE d.managed_by_user_id = p.id
ORDER BY d.full_name;

-- 5) חברות ב-org_members — לאיזה org_ids רועי שייך (אם יש כמה, המתג משפיע)
SELECT om.org_id, o.name AS org_name
FROM public.org_members om
LEFT JOIN public.organizations o ON o.id = om.org_id
JOIN public.profiles p ON p.id = om.user_id
WHERE lower(trim(p.email)) = 'malachiroei@gmail.com';

-- 6) ספירות מהירות להשוואה (אותו org כמו בפרופיל vs כל המערכת)
SELECT
  (SELECT count(*)::int FROM public.vehicles v
   JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
   WHERE v.org_id IS NOT DISTINCT FROM p.org_id) AS vehicles_in_profile_org,
  (SELECT count(*)::int FROM public.drivers d
   JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
   WHERE d.org_id IS NOT DISTINCT FROM p.org_id) AS drivers_in_profile_org,
  (SELECT count(*)::int FROM public.vehicles) AS vehicles_all_rows,
  (SELECT count(*)::int FROM public.drivers) AS drivers_all_rows;
