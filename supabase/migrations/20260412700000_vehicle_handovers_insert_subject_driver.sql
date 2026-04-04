-- =============================================================================
-- INSERT vehicle_handovers עדיין נכשל ב־RLS כשהנהג המחובר הוא שורת drivers נכונה
-- (driver_id בטופס) אבל אין לו user_roles.driver / org_members / profile.org_id תואם —
-- user_may_insert_vehicle_handover דורש belongs או has_role. כאן מאשרים מסירה כש־auth.uid()
-- הוא user_id של הנהג שנבחר והרכב באותו org כמו שורת הנהג (בלי תלות ב-RLS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(
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
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles v
    INNER JOIN public.drivers d ON d.id = _driver_id
    WHERE v.id = _vehicle_id
      AND d.user_id = _user_id
      AND d.user_id IS NOT NULL
      AND (
        v.org_id IS NULL
        OR d.org_id = v.org_id
        OR public.user_belongs_to_org(_user_id, v.org_id)
      )
  );
$$;

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) IS
  'RLS: subject driver (handover.driver_id) may INSERT handover for vehicle in same org as driver row.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "vehicle_handovers_insert_handover_access" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_handover_access"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.user_may_insert_vehicle_handover(auth.uid(), vehicle_id)
      OR (
        driver_id IS NOT NULL
        AND public.user_may_insert_vehicle_handover_as_subject_driver(
          auth.uid(),
          vehicle_id,
          driver_id
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
