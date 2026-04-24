-- =============================================================================
-- הסרת המשתמש roeima21@gmail.com מהמערכת (נתונים + auth.users).
-- הרץ ב-Supabase → SQL Editor עם הרשאות postgres (או Service Role דרך migration ידנית).
-- גיבוי לפני הרצה.
-- =============================================================================

DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(trim(email)) = 'roeima21@gmail.com' LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'אין שורה ב-auth.users עבור roeima21@gmail.com — מנקים רק נתונים ציבוריים לפי אימייל.';

    DELETE FROM public.org_invitations WHERE lower(trim(email)) = 'roeima21@gmail.com';
    DELETE FROM public.profiles WHERE lower(trim(email)) = 'roeima21@gmail.com';

    RETURN;
  END IF;

  RAISE NOTICE 'מוחק auth user id=%', v_uid;

  DELETE FROM public.org_members WHERE user_id = v_uid;
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  DELETE FROM public.user_feature_overrides WHERE user_id = v_uid;
  DELETE FROM public.org_invitations WHERE lower(trim(email)) = 'roeima21@gmail.com';

  UPDATE public.profiles SET parent_admin_id = NULL WHERE parent_admin_id = v_uid;
  UPDATE public.profiles SET managed_by_user_id = NULL WHERE managed_by_user_id = v_uid;

  DELETE FROM public.drivers WHERE user_id = v_uid;

  DELETE FROM public.profiles WHERE id = v_uid OR user_id = v_uid;

  DELETE FROM auth.users WHERE id = v_uid;
END $$;
