-- =============================================================================
-- איתור רכבים/נהגים «חופשיים» לשיוך ל־malachiroei (מנהל על):
-- org_id ריק, או בלי managed_by, או רחוקים מהארגון של בעל הפלטפורמה.
-- הרץ ב-Supabase SQL Editor; עדכן מיילים לפי הצורך.
-- =============================================================================

SELECT id, email, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) = 'malachiroei@gmail.com';

-- רכבים ללא ארגון (חשיפה דרך RLS legacy בלבד)
SELECT 'vehicles org_id null' AS kind, id, plate_number, org_id, managed_by_user_id
FROM public.vehicles
WHERE org_id IS NULL
ORDER BY plate_number;

-- נהגים ללא ארגון
SELECT 'drivers org_id null' AS kind, id, full_name, email, org_id, managed_by_user_id
FROM public.drivers
WHERE org_id IS NULL
ORDER BY full_name;

-- ברירת מחדל: ארגון של malachiroei (החלף אחרי SELECT למעלה)
-- :org_malachiroei := profiles.org_id של מנהל העל

SELECT 'vehicles in platform org, managed_by null' AS kind, v.id, v.plate_number, v.org_id, v.managed_by_user_id
FROM public.vehicles v
INNER JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
WHERE v.org_id = p.org_id
  AND v.managed_by_user_id IS NULL;

SELECT 'drivers in platform org, managed_by null' AS kind, d.id, d.full_name, d.email, d.org_id, d.managed_by_user_id
FROM public.drivers d
INNER JOIN public.profiles p ON lower(trim(p.email)) = 'malachiroei@gmail.com'
WHERE d.org_id = p.org_id
  AND d.managed_by_user_id IS NULL;
