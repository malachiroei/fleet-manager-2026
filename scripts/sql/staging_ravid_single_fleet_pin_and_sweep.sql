-- =============================================================================
-- פרו + טסט: סידור צי לפי בעלות ניהול
--
-- · כל הרכבים והנהגים — משויכים ל־malachiroei@gmail.com (ארגון ראשי + managed_by)
--   חוץ מרכב סילברדו לוחית 99-888-77 → ravidmalachi@gmail.com
-- · נהג «רביד הקוף» נשאר צי רביד (אותו ארגון + managed_by רביד), משויך לסילברדו
--
-- מקור שורות (Supabase CSV, אפריל 2026) — UUIDים לביקורת ידנית בלבד; הסקריפט
-- מזהה משתמשים לפי אימייל כדי שיפעל גם אם ה-UUID שונים בין סביבות.
--
-- ארגונים (כמו ב־fleetDefaultOrg / VITE_*):
--   main:  857f2311-2ec5-41d3-8e32-dacd450a9a77
--   ravid: 2bb0f9c3-b210-4099-b0c5-de92794d5cc9
--
-- הרץ ב-SQL Editor (סטייג׳ינג ואז פרוד) אחרי גיבוי. אם אצלכם UUID ארגון ראשי אחר —
-- עדכן את main_org למטה.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  main_org  constant uuid := '857f2311-2ec5-41d3-8e32-dacd450a9a77';
  ravid_org constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
  roei_uid  uuid;
  ravid_uid uuid;
  ravid_driver_id uuid;
BEGIN
  SELECT p.id INTO roei_uid
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'malachiroei@gmail.com'
  LIMIT 1;

  SELECT p.id INTO ravid_uid
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com'
  LIMIT 1;

  IF roei_uid IS NULL THEN
    RAISE EXCEPTION 'לא נמצא profiles עבור malachiroei@gmail.com';
  END IF;
  IF ravid_uid IS NULL THEN
    RAISE EXCEPTION 'לא נמצא profiles עבור ravidmalachi@gmail.com';
  END IF;

  /*
   * נהגים: כולם תחת רועי, חוץ מ«רביד הקוף» (או ravid+monkey) תחת רביד.
   * היקף: שורות בארגוני main/ravid או שכבר מנוהלות ע״י רועי/רביד (כמו ב-CSV).
   */
  UPDATE public.drivers d
  SET
    org_id = main_org,
    managed_by_user_id = roei_uid
  WHERE NOT (
    d.full_name ILIKE '%רביד%קוף%'
    OR d.full_name ILIKE '%ravid%monkey%'
  )
  AND (
    d.org_id IN (main_org, ravid_org)
    OR d.managed_by_user_id IN (roei_uid, ravid_uid)
  );

  UPDATE public.drivers d
  SET
    org_id = ravid_org,
    managed_by_user_id = ravid_uid
  WHERE d.full_name ILIKE '%רביד%קוף%'
     OR d.full_name ILIKE '%ravid%monkey%';

  /*
   * רכבים: כולם תחת רועי, חוץ מסילברדו (לוחית 99-888-77 או שברולט+סילברדו).
   */
  UPDATE public.vehicles v
  SET
    org_id = main_org,
    managed_by_user_id = roei_uid
  WHERE NOT (
    regexp_replace(upper(trim(coalesce(v.plate_number, ''))), '[^A-Z0-9]', '', 'g') = '9988877'
    OR (
      upper(trim(coalesce(v.manufacturer, ''))) LIKE '%שברולט%'
      AND upper(trim(coalesce(v.model, ''))) LIKE '%סילברדו%'
    )
  )
  AND (
    v.org_id IN (main_org, ravid_org)
    OR v.managed_by_user_id IN (roei_uid, ravid_uid)
  );

  UPDATE public.vehicles v
  SET
    org_id = ravid_org,
    managed_by_user_id = ravid_uid
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
  WHERE id = roei_uid;

  UPDATE public.profiles
  SET org_id = ravid_org
  WHERE id = ravid_uid;

  DELETE FROM public.org_members om
  WHERE om.user_id = ravid_uid
    AND om.org_id IS DISTINCT FROM ravid_org;

  -- בלי ON CONFLICT: בחלק מהפריסות אין UNIQUE(user_id, org_id) על org_members
  INSERT INTO public.org_members (user_id, org_id)
  SELECT ravid_uid, ravid_org
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = ravid_uid
      AND om.org_id = ravid_org
  );

  INSERT INTO public.org_members (user_id, org_id)
  SELECT roei_uid, main_org
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = roei_uid
      AND om.org_id = main_org
  );

  RAISE NOTICE 'סיום: roei_uid=% ravid_uid=% ravid_driver_id=%', roei_uid, ravid_uid, ravid_driver_id;
END $$;

COMMIT;

-- בדיקה מהירה אחרי הרצה:
-- SELECT id, plate_number, org_id, managed_by_user_id, assigned_driver_id FROM vehicles ORDER BY plate_number;
-- SELECT id, full_name, email, org_id, managed_by_user_id FROM drivers ORDER BY full_name;
