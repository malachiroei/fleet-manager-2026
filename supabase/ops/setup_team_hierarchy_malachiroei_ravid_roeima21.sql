-- =============================================================================
-- סדר יישור צוות לפי המודל:
--   מנהל על: malachiroei@gmail.com
--   אדמינים עמיתים (תחת מנהל העל): ravidmalachi, roeima21
--   משנים תחת רביד בלבד: arikzohargold, malachiroei1
--
-- הרץ ב-Supabase SQL Editor בלוקים (1 → 2 → 3 → 4), לא בהכרח בשורה אחת.
-- אחרי נתונים: בדיקות באפליקציה כל משתמש.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- בלוק 1 — וידוא מזהים לפני שינוי (העתק תוצאות לצד אם צריך גיבוי מנטלי)
-- -----------------------------------------------------------------------------
SELECT id, email, full_name, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) IN (
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com',
  'roeima21@gmail.com',
  'arikzohargold@gmail.com',
  'malachiroei1@gmail.com'
)
ORDER BY email;

-- -----------------------------------------------------------------------------
-- בלוק 2 — רביד ו־roeima21: הורה = מנהל העל (שניהם אדמינים עמיתים)
-- (מיישר גם אם כבר נכון — עדכון יתאים רק שורות שעדיין לא תואמות)
-- -----------------------------------------------------------------------------
UPDATE public.profiles AS p
SET
  parent_admin_id = m.id,
  managed_by_user_id = m.id,
  updated_at = now()
FROM (
  SELECT id FROM public.profiles WHERE lower(trim(email)) = 'malachiroei@gmail.com' LIMIT 1
) AS m
WHERE lower(trim(p.email)) IN ('ravidmalachi@gmail.com', 'roeima21@gmail.com')
  AND m.id IS NOT NULL
  AND (p.parent_admin_id IS DISTINCT FROM m.id OR p.managed_by_user_id IS DISTINCT FROM m.id);

-- -----------------------------------------------------------------------------
-- בלוק 3 — אריק ורועי 1: הורה = רביד (לא מנהל העל)
-- -----------------------------------------------------------------------------
UPDATE public.profiles AS p
SET
  parent_admin_id = r.id,
  managed_by_user_id = r.id,
  updated_at = now()
FROM (
  SELECT id FROM public.profiles WHERE lower(trim(email)) = 'ravidmalachi@gmail.com' LIMIT 1
) AS r
WHERE lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  AND r.id IS NOT NULL
  AND (p.parent_admin_id IS DISTINCT FROM r.id OR p.managed_by_user_id IS DISTINCT FROM r.id);

-- יישור org לצי של רביד (אם שונה)
UPDATE public.profiles AS p
SET
  org_id = r.org_id,
  updated_at = now()
FROM (
  SELECT org_id FROM public.profiles WHERE lower(trim(email)) = 'ravidmalachi@gmail.com' LIMIT 1
) AS r
WHERE lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  AND r.org_id IS NOT NULL
  AND p.org_id IS DISTINCT FROM r.org_id;

-- -----------------------------------------------------------------------------
-- בלוק 4 — אימות אחרי
-- -----------------------------------------------------------------------------
SELECT id, email, full_name, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) IN (
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com',
  'roeima21@gmail.com',
  'arikzohargold@gmail.com',
  'malachiroei1@gmail.com'
)
ORDER BY email;

-- -----------------------------------------------------------------------------
-- בלוק 5 (אופציונלי) — רכבים/נהגים בארגון הצי: לפי מי מסומן managed_by
-- אחרי יישור פרופילים, וודאו שרכבים של רביד מסומנים ל־ravid, של roeima21 ל־roeima21
-- -----------------------------------------------------------------------------
/*
SELECT managed_by_user_id, count(*) AS n
FROM public.vehicles
WHERE org_id = (SELECT org_id FROM public.profiles WHERE lower(trim(email)) = 'ravidmalachi@gmail.com' LIMIT 1)
GROUP BY managed_by_user_id;

SELECT managed_by_user_id, count(*) AS n
FROM public.drivers
WHERE org_id = (SELECT org_id FROM public.profiles WHERE lower(trim(email)) = 'ravidmalachi@gmail.com' LIMIT 1)
GROUP BY managed_by_user_id;
*/
