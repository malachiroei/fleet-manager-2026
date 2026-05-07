-- =============================================================================
-- מסירת רכב: RLS חוסם למרות שהממשק נותן גישה —
-- 1) Google מחזיר לעיתים ravid.malachi@gmail.com; בפרונט זה מזוהה כאדמין רביד, ב-DB
--    רק ravidmalachi@ היה ב-bootstrap / JWT — מדיניות INSERT נכשלת.
-- 2) פרופיל עם vehicle_delivery (בלי admin_access / manage_team / user_roles) צריך
--    לאפשר INSERT handover כשהוא שייך לארגון הרכב.
--
-- חברי צוות «כמו אדמין בלי ניהול צוות»: ב-DB לא נדרש manage_team למסילת handover —
-- user_has_fleet_staff_privileges() כבר מכיר profiles.permissions.admin_access בנפרד
-- מ-manage_team; בשילוב user_belongs_to_org → can_org_admin_write → user_may_insert_vehicle_handover
-- זה מה שהיה בתוקף גם לפני המיגרציה הזו. המיגרציה לא צריכה ולא עוקפת את זה; היא משלימה
-- רק (1)-(2) לעיל. וודא שבפרופיל יש לפחות admin_access=true או תפקיד admin/fleet_manager;
-- אם כיביתם את admin_access ורק vehicle_delivery — יעבדו דרך הסעיף (2) למסירה בלבד.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_is_fleet_bootstrap_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(trim(coalesce(u.email, ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND lower(trim(coalesce(p.email, ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
  );
$$;

COMMENT ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) IS
  'Bootstrap fleet owners: auth.users or profiles email (כולל גרסת נקודה של Gmail לרביד).';

CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover(_user_id uuid, _vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = _vehicle_id
      AND (
        public.user_may_cross_org_fleet_read(_user_id)
        OR public.can_org_admin_write(_user_id, v.org_id)
        OR (
          v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_user_id, v.org_id)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              WHERE p.id = _user_id
                AND COALESCE((p.permissions ->> 'vehicle_delivery')::boolean, false)
            )
            OR EXISTS (
              SELECT 1
              FROM public.user_roles ur
              WHERE ur.user_id = _user_id
                AND lower(trim(both from ur.role::text)) IN ('driver', 'employee')
            )
            OR EXISTS (
              SELECT 1
              FROM public.drivers d
              WHERE d.id = v.assigned_driver_id
                AND d.user_id = _user_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.driver_vehicle_assignments a
              INNER JOIN public.drivers d ON d.id = a.driver_id
              WHERE a.vehicle_id = v.id
                AND a.unassigned_at IS NULL
                AND d.user_id = _user_id
                AND (
                  v.org_id IS NULL
                  OR public.user_belongs_to_org(_user_id, v.org_id)
                )
            )
          )
        )
        OR (v.org_id IS NULL AND public.user_has_fleet_staff_privileges(_user_id))
      )
  );
$$;

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) IS
  'RLS handover INSERT: צוות ארגון, נהג משויך, או profiles.permissions.vehicle_delivery באותו org.';

CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover_row_check(
  _user_id uuid,
  _vehicle_id uuid,
  _driver_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      (
        public.user_may_insert_vehicle_handover(_user_id, _vehicle_id)
        OR (
          _driver_id IS NOT NULL
          AND public.user_may_insert_vehicle_handover_as_subject_driver(
            _user_id,
            _vehicle_id,
            _driver_id
          )
        )
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND public.user_is_fleet_bootstrap_owner(_user_id)
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND (
          lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
            'malachiroei@gmail.com',
            'ravidmalachi@gmail.com',
            'ravid.malachi@gmail.com'
          )
          OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) IN (
            'malachiroei@gmail.com',
            'ravidmalachi@gmail.com',
            'ravid.malachi@gmail.com'
          )
        )
      )
    );
$$;

DROP POLICY IF EXISTS "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_jwt_bootstrap_email"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND (
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
      OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
    )
  );

COMMENT ON POLICY "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers IS
  'Bootstrap owners: JWT email כולל ravid.malachi@gmail.com (נורמליזציה של Gmail).';

NOTIFY pgrst, 'reload schema';
