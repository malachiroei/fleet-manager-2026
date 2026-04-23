-- =============================================================================
-- אבחון: למה staging_ravid_single_fleet_pin_and_sweep לא מוצא משתמש
-- הרץ ב-Supabase SQL Editor והעתק את כל התוצאות (או צילום מסך).
-- =============================================================================

-- 1) auth.users — האם המשתמש בכלל קיים בהרשמה
SELECT id, email, created_at
FROM auth.users
WHERE lower(trim(coalesce(email, ''))) IN (
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com'
)
ORDER BY email;

-- 2) profiles — אימייל ומזהה (לפעמים email ריק או רווחים)
SELECT id, email, org_id, managed_by_user_id, full_name, status
FROM public.profiles
WHERE lower(trim(coalesce(email, ''))) IN (
  'malachiroei@gmail.com',
  'ravidmalachi@gmail.com'
)
   OR id IN (
     SELECT id FROM auth.users
     WHERE lower(trim(coalesce(email, ''))) IN (
       'malachiroei@gmail.com',
       'ravidmalachi@gmail.com'
     )
   )
ORDER BY email NULLS LAST;

-- 3) כל ה-profiles שמכילים malachi בשדה email (טעות הקלדה / דומיין אחר)
SELECT id, email, full_name
FROM public.profiles
WHERE lower(coalesce(email, '')) LIKE '%malachi%'
   OR lower(coalesce(email, '')) LIKE '%roei%'
ORDER BY email;
