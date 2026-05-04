-- =============================================================================
-- יישור הורה: אריק ורועי 1 תחת רביד (לא תחת מנהל-העל).
-- הרץ רק בפרויקט Supabase הנכון. בדוק תוצאות SELECT לפני UPDATE.
-- =============================================================================

-- 1) וידוא מזהים (אמור להחזיר שורה אחת לכל אימייל)
SELECT id, email, full_name, parent_admin_id, managed_by_user_id, org_id
FROM public.profiles
WHERE lower(trim(email)) IN (
  'ravidmalachi@gmail.com',
  'arikzohargold@gmail.com',
  'malachiroei1@gmail.com'
)
ORDER BY email;

-- 2) עדכון ממוקד — רק שני העובדים (לא גורף על כל profiles)
UPDATE public.profiles AS p
SET
  parent_admin_id = m.id,
  managed_by_user_id = m.id,
  updated_at = now()
FROM (
  SELECT id
  FROM public.profiles
  WHERE lower(trim(email)) = 'ravidmalachi@gmail.com'
  LIMIT 1
) AS m
WHERE lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  AND m.id IS NOT NULL;

-- 2b) יישור org_id לארגון של רביד (לרשימות, פיצ'רים, org_members — אחרי זה לוודא שיש שורה ב-org_members)
UPDATE public.profiles AS p
SET
  org_id = m.org_id,
  updated_at = now()
FROM (
  SELECT org_id
  FROM public.profiles
  WHERE lower(trim(email)) = 'ravidmalachi@gmail.com'
  LIMIT 1
) AS m
WHERE lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  AND m.org_id IS NOT NULL;

-- 3) אימות אחרי עדכון
SELECT id, email, full_name, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) IN (
  'ravidmalachi@gmail.com',
  'arikzohargold@gmail.com',
  'malachiroei1@gmail.com'
)
ORDER BY email;
