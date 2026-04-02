-- =============================================================================
-- Staging / תיקון נתונים: ברגון רביד יישארו רק —
--   · רכב לוחית 99-888-77 (נורמליזציה ל־9988877)
--   · נהג בשם שמכיל «רביד» ו«קוף» (או ravid + monkey)
-- כל שאר רכבים/נהגים עם org_id של ארגון רביד מוחזרים לצי הראשי של רועי
-- ומסומנים managed_by_user_id = פרופיל רועי.
--
-- הרץ ב-Supabase SQL Editor (סטייג׳ינג) אחרי גיבוי / בדיקת SELECT.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  ravid_org constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
  main_org  constant uuid := '857f2311-2ec5-41d3-8e32-dacd450a9a77';
  ravid_uid uuid;
  roei_uid  uuid;
  ravid_driver_id uuid;
  ravid_vehicle_id uuid;
BEGIN
  SELECT p.id INTO ravid_uid
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com'
  LIMIT 1;

  SELECT p.id INTO roei_uid
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'malachiroei@gmail.com'
  LIMIT 1;

  IF ravid_uid IS NULL THEN
    RAISE EXCEPTION 'לא נמצא profiles עבור ravidmalachi@gmail.com';
  END IF;
  IF roei_uid IS NULL THEN
    RAISE EXCEPTION 'לא נמצא profiles עבור malachiroei@gmail.com';
  END IF;

  -- 1) כל מה שיושב בטעות בארגון רביד ואינו הרכב/הנהג הנכונים → חזרה לצי רועי
  UPDATE public.vehicles v
  SET
    org_id = main_org,
    managed_by_user_id = roei_uid
  WHERE v.org_id = ravid_org
    AND regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g')
      IS DISTINCT FROM '9988877';

  UPDATE public.drivers d
  SET
    org_id = main_org,
    managed_by_user_id = roei_uid
  WHERE d.org_id = ravid_org
    AND NOT (
      d.full_name ILIKE '%רביד%קוף%'
      OR d.full_name ILIKE '%ravid%monkey%'
    );

  -- 2) לנעול את הרכב והנהג של רביד בארגון רביד + ניהול ע״י רביד
  UPDATE public.vehicles v
  SET
    org_id = ravid_org,
    managed_by_user_id = ravid_uid
  WHERE regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g') = '9988877';

  UPDATE public.drivers d
  SET
    org_id = ravid_org,
    managed_by_user_id = ravid_uid
  WHERE d.full_name ILIKE '%רביד%קוף%'
     OR d.full_name ILIKE '%ravid%monkey%';

  -- 3) שיוך נהג לרכב (אם שני הרשומות קיימים)
  SELECT d.id INTO ravid_driver_id
  FROM public.drivers d
  WHERE d.org_id = ravid_org
    AND (d.full_name ILIKE '%רביד%קוף%' OR d.full_name ILIKE '%ravid%monkey%')
  ORDER BY d.updated_at DESC NULLS LAST
  LIMIT 1;

  SELECT v.id INTO ravid_vehicle_id
  FROM public.vehicles v
  WHERE v.org_id = ravid_org
    AND regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g') = '9988877'
  ORDER BY v.updated_at DESC NULLS LAST
  LIMIT 1;

  IF ravid_vehicle_id IS NOT NULL AND ravid_driver_id IS NOT NULL THEN
    UPDATE public.vehicles
    SET assigned_driver_id = ravid_driver_id
    WHERE id = ravid_vehicle_id;
  END IF;

  UPDATE public.profiles
  SET org_id = ravid_org
  WHERE id = ravid_uid;

  DELETE FROM public.org_members om
  WHERE om.user_id = ravid_uid
    AND om.org_id IS DISTINCT FROM ravid_org;

  INSERT INTO public.org_members (user_id, org_id)
  VALUES (ravid_uid, ravid_org)
  ON CONFLICT (user_id, org_id) DO NOTHING;

  RAISE NOTICE 'ravid_uid=% roei_uid=% ravid_vehicle_id=% ravid_driver_id=%', ravid_uid, roei_uid, ravid_vehicle_id, ravid_driver_id;
END $$;

COMMIT;
