-- =============================================================================
-- פרו + טסט: סידור צי לפי בעלות ניהול
--
-- · כל הרכבים והנהגים — משויכים ל־malachiroei@gmail.com (ארגון ראשי + managed_by)
--   חוץ מרכב סילברדו לוחית 99-888-77 → ravidmalachi@gmail.com
-- · נהג «רביד הקוף» נשאר צי רביד (אותו ארגון + managed_by רביד), משויך לסילברדו
--
-- חשוב:
-- · org_members.user_id → auth.users.id
-- · drivers.managed_by_user_id / vehicles.managed_by_user_id → public.profiles.id
--   (לא מזהה Auth אם profiles.id שונה או אם חסרה שורת profiles — לכן יוצרים profiles אם צריך)
--
-- ארגונים (כמו ב־fleetDefaultOrg / VITE_*):
--   main:  857f2311-2ec5-41d3-8e32-dacd450a9a77
--   ravid: 2bb0f9c3-b210-4099-b0c5-de92794d5cc9
--
-- הרץ ב-SQL Editor אחרי גיבוי. אם «לא נמצא משתמש» — diagnose_roei_ravid_uids.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  main_org  constant uuid := '857f2311-2ec5-41d3-8e32-dacd450a9a77';
  ravid_org constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
  roei_auth_id    uuid;
  ravid_auth_id   uuid;
  roei_profile_id uuid;
  ravid_profile_id uuid;
  ravid_driver_id uuid;
  has_user_id_col boolean;
BEGIN
  SELECT u.id INTO roei_auth_id
  FROM auth.users u
  WHERE lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
  LIMIT 1;

  SELECT u.id INTO ravid_auth_id
  FROM auth.users u
  WHERE lower(trim(coalesce(u.email, ''))) = 'ravidmalachi@gmail.com'
  LIMIT 1;

  IF roei_auth_id IS NULL THEN
    RAISE EXCEPTION
      'לא נמצא malachiroei@gmail.com ב-auth.users. הרץ diagnose_roei_ravid_uids.sql.';
  END IF;
  IF ravid_auth_id IS NULL THEN
    RAISE EXCEPTION
      'לא נמצא ravidmalachi@gmail.com ב-auth.users. הרץ diagnose_roei_ravid_uids.sql.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'profiles'
      AND c.column_name = 'user_id'
  ) INTO has_user_id_col;

  -- פרופיל לרועי: id לשימוש ב-FK של managed_by (ולרוב גם = auth uid באפליקציה)
  SELECT p.id INTO roei_profile_id
  FROM public.profiles p
  WHERE lower(trim(coalesce(p.email, ''))) = 'malachiroei@gmail.com'
  LIMIT 1;

  IF roei_profile_id IS NULL THEN
    SELECT p.id INTO roei_profile_id
    FROM public.profiles p
    WHERE p.id = roei_auth_id
    LIMIT 1;
  END IF;

  IF roei_profile_id IS NULL AND has_user_id_col THEN
    SELECT p.id INTO roei_profile_id
    FROM public.profiles p
    WHERE p.user_id = roei_auth_id
    LIMIT 1;
  END IF;

  IF roei_profile_id IS NULL THEN
    BEGIN
      IF has_user_id_col THEN
        INSERT INTO public.profiles (id, user_id, full_name, email, status)
        VALUES (
          roei_auth_id,
          roei_auth_id,
          'רועי (סוויפ)',
          'malachiroei@gmail.com',
          'active'
        );
      ELSE
        INSERT INTO public.profiles (id, full_name, email, status)
        VALUES (
          roei_auth_id,
          'רועי (סוויפ)',
          'malachiroei@gmail.com',
          'active'
        );
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;

    SELECT COALESCE(
      (SELECT p.id FROM public.profiles p WHERE p.id = roei_auth_id LIMIT 1),
      CASE
        WHEN has_user_id_col THEN (SELECT p.id FROM public.profiles p WHERE p.user_id = roei_auth_id LIMIT 1)
        ELSE NULL::uuid
      END
    ) INTO roei_profile_id;
  END IF;

  IF roei_profile_id IS NULL THEN
    RAISE EXCEPTION 'לא הצלחנו ליצור/לאתר profiles.id עבור malachiroei@gmail.com';
  END IF;

  -- פרופיל לרביד
  SELECT p.id INTO ravid_profile_id
  FROM public.profiles p
  WHERE lower(trim(coalesce(p.email, ''))) = 'ravidmalachi@gmail.com'
  LIMIT 1;

  IF ravid_profile_id IS NULL THEN
    SELECT p.id INTO ravid_profile_id
    FROM public.profiles p
    WHERE p.id = ravid_auth_id
    LIMIT 1;
  END IF;

  IF ravid_profile_id IS NULL AND has_user_id_col THEN
    SELECT p.id INTO ravid_profile_id
    FROM public.profiles p
    WHERE p.user_id = ravid_auth_id
    LIMIT 1;
  END IF;

  IF ravid_profile_id IS NULL THEN
    BEGIN
      IF has_user_id_col THEN
        INSERT INTO public.profiles (id, user_id, full_name, email, status)
        VALUES (
          ravid_auth_id,
          ravid_auth_id,
          'רביד (סוויפ)',
          'ravidmalachi@gmail.com',
          'active'
        );
      ELSE
        INSERT INTO public.profiles (id, full_name, email, status)
        VALUES (
          ravid_auth_id,
          'רביד (סוויפ)',
          'ravidmalachi@gmail.com',
          'active'
        );
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;

    SELECT COALESCE(
      (SELECT p.id FROM public.profiles p WHERE p.id = ravid_auth_id LIMIT 1),
      CASE
        WHEN has_user_id_col THEN (SELECT p.id FROM public.profiles p WHERE p.user_id = ravid_auth_id LIMIT 1)
        ELSE NULL::uuid
      END
    ) INTO ravid_profile_id;
  END IF;

  IF ravid_profile_id IS NULL THEN
    RAISE EXCEPTION 'לא הצלחנו ליצור/לאתר profiles.id עבור ravidmalachi@gmail.com';
  END IF;

  /*
   * נהגים: כולם תחת רועי, חוץ מ«רביד הקוף» (או ravid+monkey) תחת רביד.
   * managed_by_user_id חייב להיות profiles.id; בסינון כוללים גם auth id אם יש נתונים ישנים שגויים.
   */
  UPDATE public.drivers d
  SET
    org_id = main_org,
    managed_by_user_id = roei_profile_id
  WHERE NOT (
    d.full_name ILIKE '%רביד%קוף%'
    OR d.full_name ILIKE '%ravid%monkey%'
  )
  AND (
    d.org_id IN (main_org, ravid_org)
    OR d.managed_by_user_id IN (roei_profile_id, ravid_profile_id, roei_auth_id, ravid_auth_id)
  );

  UPDATE public.drivers d
  SET
    org_id = ravid_org,
    managed_by_user_id = ravid_profile_id
  WHERE d.full_name ILIKE '%רביד%קוף%'
     OR d.full_name ILIKE '%ravid%monkey%';

  UPDATE public.vehicles v
  SET
    org_id = main_org,
    managed_by_user_id = roei_profile_id
  WHERE NOT (
    regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g') = '9988877'
    OR (
      upper(trim(coalesce(v.manufacturer, ''))) LIKE '%שברולט%'
      AND upper(trim(coalesce(v.model, ''))) LIKE '%סילברדו%'
    )
  )
  AND (
    v.org_id IN (main_org, ravid_org)
    OR v.managed_by_user_id IN (roei_profile_id, ravid_profile_id, roei_auth_id, ravid_auth_id)
  );

  UPDATE public.vehicles v
  SET
    org_id = ravid_org,
    managed_by_user_id = ravid_profile_id
  WHERE regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g') = '9988877'
     OR (
       upper(trim(coalesce(v.manufacturer, ''))) LIKE '%שברולט%'
       AND upper(trim(coalesce(v.model, ''))) LIKE '%סילברדו%'
     );

  SELECT d.id INTO ravid_driver_id
  FROM public.drivers d
  WHERE d.org_id = ravid_org
    AND (d.full_name ILIKE '%רביד%קוף%' OR d.full_name ILIKE '%ravid%monkey%')
  ORDER BY d.updated_at DESC NULLS LAST
  LIMIT 1;

  IF ravid_driver_id IS NOT NULL THEN
    UPDATE public.vehicles v
    SET assigned_driver_id = ravid_driver_id
    WHERE v.org_id = ravid_org
      AND (
        regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g') = '9988877'
        OR (
          upper(trim(coalesce(v.manufacturer, ''))) LIKE '%שברולט%'
          AND upper(trim(coalesce(v.model, ''))) LIKE '%סילברדו%'
        )
      );
  END IF;

  UPDATE public.profiles
  SET org_id = main_org
  WHERE id = roei_profile_id;

  UPDATE public.profiles
  SET org_id = ravid_org
  WHERE id = ravid_profile_id;

  UPDATE public.profiles
  SET managed_by_user_id = roei_profile_id
  WHERE id = ravid_profile_id;

  DELETE FROM public.org_members om
  WHERE om.user_id = ravid_auth_id
    AND om.org_id IS DISTINCT FROM ravid_org;

  INSERT INTO public.org_members (user_id, org_id)
  SELECT ravid_auth_id, ravid_org
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = ravid_auth_id
      AND om.org_id = ravid_org
  );

  INSERT INTO public.org_members (user_id, org_id)
  SELECT roei_auth_id, main_org
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = roei_auth_id
      AND om.org_id = main_org
  );

  RAISE NOTICE
    'סיום: roei auth=% profile=% | ravid auth=% profile=% | ravid_driver=%',
    roei_auth_id,
    roei_profile_id,
    ravid_auth_id,
    ravid_profile_id,
    ravid_driver_id;
END $$;

COMMIT;

-- בדיקה מהירה אחרי הרצה:
-- SELECT id, plate_number, org_id, managed_by_user_id, assigned_driver_id FROM vehicles ORDER BY plate_number;
-- SELECT id, full_name, email, org_id, managed_by_user_id FROM drivers ORDER BY full_name;
