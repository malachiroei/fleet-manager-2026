-- =============================================================================
-- שחזור חשבון `roeima21@gmail.com` (id = 72c77494-79a5-4ad5-a38a-65d34155a6ca)
-- למצב אדמין עצמאי על הצי הישן שלו, לאחר שניסיון מחיקה השאיר אותו תקוע
-- כ-driver תחת מנהל אחר. השחזור מבוצע באמצעות שלושה צעדים אטומיים:
--   1. אתר את org_id האמיתי של הנתונים שתחתיו (vehicles.managed_by_user_id).
--   2. עדכן את שורת ה-profile למצב אדמין עם אותו org_id, וניקוי parent/managed.
--   3. סנכרן user_roles + org_members לאותו org.
-- בטוח להריץ שוב — `ON CONFLICT DO NOTHING` ופעולות עדכון אידמפוטנטיות.
-- =============================================================================

DO $$
DECLARE
  v_user_id  uuid := '72c77494-79a5-4ad5-a38a-65d34155a6ca';
  v_email    text := 'roeima21@gmail.com';
  v_org_id   uuid;
BEGIN
  /**
   * 1) נסה לאתר את ה-org_id "האמיתי" של המשתמש לפי הרכבים שהוא ניהל.
   *    אם אין רכבים בבעלותו — נופלים לעמודה drivers, ואחרון — לערך ה-profile הנוכחי.
   */
  SELECT v.org_id
  INTO   v_org_id
  FROM   public.vehicles v
  WHERE  v.managed_by_user_id = v_user_id
  ORDER  BY v.created_at NULLS LAST
  LIMIT  1;

  IF v_org_id IS NULL THEN
    SELECT d.org_id
    INTO   v_org_id
    FROM   public.drivers d
    WHERE  d.managed_by_user_id = v_user_id
    ORDER  BY d.created_at NULLS LAST
    LIMIT  1;
  END IF;

  IF v_org_id IS NULL THEN
    /** אם בפרופיל עצמו יש org תקין נשתמש בו, אחרת ניצור fallback. */
    SELECT p.org_id INTO v_org_id FROM public.profiles p WHERE p.id = v_user_id;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No org_id could be resolved for user % — aborting.', v_user_id;
    RETURN;
  END IF;

  RAISE NOTICE 'Restoring user % (% ) to admin of org %', v_user_id, v_email, v_org_id;

  /**
   * 2) מחזירים את השורה ב-profiles למצב admin עצמאי. שמרי על שאר השדות,
   *    אבל מאפסים parent_admin_id / managed_by_user_id שגרמו לקישור הלא נכון.
   */
  UPDATE public.profiles
  SET    role               = 'admin',
         status             = 'active',
         is_approved        = true,
         org_id             = v_org_id,
         parent_admin_id    = NULL,
         managed_by_user_id = NULL,
         permissions        = COALESCE(permissions, '{}'::jsonb)
                              || jsonb_build_object(
                                   'manage_team',  true,
                                   'admin_access', true,
                                   'report_mileage', true
                                 ),
         updated_at         = now()
  WHERE  id = v_user_id;

  /**
   * 3a) user_roles — מבטיחים שיש לו role='admin' במקום 'driver'.
   */
  DELETE FROM public.user_roles
  WHERE  user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT DO NOTHING;

  /**
   * 3b) org_members — מבטיחים שהוא חבר ב-org_id המשוחזר.
   */
  INSERT INTO public.org_members (user_id, org_id)
  VALUES (v_user_id, v_org_id)
  ON CONFLICT DO NOTHING;

  /**
   * 4) ניקוי שיוכים שגויים: אם משתמשים אחרים נקשרו למשתמש הזה כ-parent
   *    בעקבות הזמנה שגויה — אפשר להריץ ידנית query בנפרד. כאן רק לוגינג.
   */
  PERFORM 1
  FROM   public.profiles
  WHERE  parent_admin_id = v_user_id
     OR  managed_by_user_id = v_user_id;
  IF FOUND THEN
    RAISE NOTICE 'Note: there are still profiles linked to % via parent/managed — review manually if needed.', v_user_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
