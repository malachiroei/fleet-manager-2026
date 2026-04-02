-- =============================================================================
-- Production: יצירת שורת profiles לכל auth.users בלי פרופיל (מתקן no_profile_row,
-- ריק ברכבים בגלל RLS, ו-403 מיותרים כשהאפליקציה לא מוצאת org_id).
-- הרץ ב-SQL Editor של פרויקט הייצור. התאם את default_org_id אם הארגון אצלכם אחר.
-- =============================================================================

DO $$
DECLARE
  default_org uuid := '857f2311-2ec5-41d3-8e32-dacd450a9a77';
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    phone,
    org_id,
    status,
    permissions,
    created_at,
    updated_at,
    is_system_admin
  )
  SELECT
    u.id,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(lower(trim(u.email)), '@', 1)
    ),
    lower(trim(u.email)),
    NULL::text,
    default_org,
    'active',
    '{}'::jsonb,
    now(),
    now(),
    false
  FROM auth.users u
  WHERE u.email IS NOT NULL
    AND trim(u.email) <> ''
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.org_members (user_id, org_id)
  SELECT p.id, p.org_id
  FROM public.profiles p
  WHERE p.org_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = p.id AND om.org_id = p.org_id
    );
END $$;

NOTIFY pgrst, 'reload schema';
