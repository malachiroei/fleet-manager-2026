-- =============================================================================
-- 1) submit_mileage_report / may_role: הייתה סטייה מול הלקוח — אובייקט permissions
--    עם מפתחות אחרים בלי report_mileage נחשב «אין הרשאה» ב-RPC, בעוד bootstrap
--    owners ומנהלים ב-UI עדיין רואים את הטופס. מיישרים: מפתח חסר = מותר
--    (כמו ברירת מחדל), + אותם אימיילי bootstrap כמו ב־fleetBootstrapEmails.ts.
-- 2) profiles SELECT: תצוגת «כל הארגונים» בניהול צוות עושה select ללא org_id;
--    בלי מדיניות זו RLS מחזירה כמעט שום שורה. משתמשים ב־user_may_cross_org_fleet_read
--    (כבר קיים לצי).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_mileage_report(
  vehicle_id uuid,
  odometer_value numeric,
  photo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  uid uuid := auth.uid();
  v_org_id uuid;
  v_assign uuid;
  new_log_id uuid;
  may_vehicle boolean;
  may_role boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF vehicle_id IS NULL OR odometer_value IS NULL OR odometer_value <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  IF photo_url IS NULL OR length(trim(photo_url)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_photo_url');
  END IF;

  SELECT v.org_id, v.assigned_driver_id
  INTO v_org_id, v_assign
  FROM public.vehicles v
  WHERE v.id = vehicle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vehicle_not_found');
  END IF;

  may_vehicle :=
    EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = uid
        AND lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
    )
    OR (
      v_org_id IS NOT NULL
      AND public.user_belongs_to_org(uid, v_org_id)
    )
    OR (
      v_org_id IS NULL
      AND public.user_has_fleet_staff_privileges(uid)
    )
    OR EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_assign
        AND d.user_id = uid
    )
    OR EXISTS (
      SELECT 1
      FROM public.driver_vehicle_assignments a
      INNER JOIN public.drivers d ON d.id = a.driver_id
      WHERE a.vehicle_id = vehicle_id
        AND a.unassigned_at IS NULL
        AND d.user_id = uid
        AND (
          v_org_id IS NULL
          OR public.user_belongs_to_org(uid, v_org_id)
        )
    );

  IF NOT may_vehicle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vehicle_forbidden');
  END IF;

  may_role :=
    EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = uid
        AND lower(trim(coalesce(u.email, ''))) IN (
          'malachiroei@gmail.com',
          'ravidmalachi@gmail.com'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND lower(ur.role::text) IN ('admin', 'fleet_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = uid
        AND (
          p.permissions IS NULL
          OR (p.permissions::jsonb) = '{}'::jsonb
          OR COALESCE((p.permissions::jsonb->>'report_mileage')::boolean, true) IS TRUE
        )
    );

  IF NOT may_role THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_report_permission');
  END IF;

  INSERT INTO public.mileage_logs (vehicle_id, odometer_value, photo_url, user_id)
  VALUES (vehicle_id, odometer_value, trim(photo_url), uid)
  RETURNING id INTO new_log_id;

  UPDATE public.vehicles v
  SET
    current_odometer = GREATEST(COALESCE(v.current_odometer, 0), ceiling(odometer_value)::integer),
    last_odometer_date = CASE
      WHEN ceiling(odometer_value)::integer >= COALESCE(v.current_odometer, 0) THEN CURRENT_DATE
      ELSE v.last_odometer_date
    END,
    updated_at = now()
  WHERE v.id = vehicle_id;

  RETURN jsonb_build_object('ok', true, 'log_id', new_log_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'database_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_mileage_report(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mileage_report(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_mileage_report(uuid, numeric, text) TO service_role;

DROP POLICY IF EXISTS "profiles_select_platform_owner" ON public.profiles;

CREATE POLICY "profiles_select_platform_owner"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.user_may_cross_org_fleet_read(auth.uid()));

COMMENT ON POLICY "profiles_select_platform_owner" ON public.profiles IS
  'Platform owner email may SELECT all profiles (super-admin team list across orgs).';

NOTIFY pgrst, 'reload schema';
