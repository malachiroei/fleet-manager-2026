-- =============================================================================
-- שמירת PDF מסירה: vehicle_documents insert failed —
--   permission denied for function user_may_insert_vehicle_document_row
--
-- אותו דפוס כמו handover/vehicles: RLS WITH CHECK קורא לפונקציה בלי EXECUTE
-- ל-authenticated, או שרשרת עזר חסרה. בנוסף: הרחבת הרשאות לארכון handover.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_document_row(
  _uid uuid,
  _vehicle_id uuid,
  _handover_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
      public.is_platform_super_admin(_uid)
      OR public.user_is_fleet_bootstrap_owner(_uid)
      OR EXISTS (
        SELECT 1
        FROM public.vehicles v
        WHERE v.id = _vehicle_id
          AND public.can_org_admin_write(_uid, v.org_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.vehicles v
        WHERE v.id = _vehicle_id
          AND v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_uid, v.org_id)
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = _uid
              AND (
                COALESCE((p.permissions ->> 'vehicle_delivery')::boolean, false)
                OR COALESCE((p.permissions ->> 'handover')::boolean, false)
                OR COALESCE((p.permissions ->> 'admin_access')::boolean, false)
              )
          )
      )
      OR (
        _handover_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.vehicle_handovers h
          INNER JOIN public.vehicles v ON v.id = h.vehicle_id
          WHERE h.id = _handover_id
            AND h.vehicle_id = _vehicle_id
            AND (
              (h.created_by IS NOT NULL AND h.created_by = _uid)
              OR public.can_org_admin_write(_uid, v.org_id)
              OR public.is_platform_super_admin(_uid)
              OR public.user_is_fleet_bootstrap_owner(_uid)
            )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.user_may_insert_vehicle_document_row(uuid, uuid, uuid) IS
  'RLS INSERT vehicle_documents: פלטפורמה / bootstrap / צוות / vehicle_delivery / יוצר handover.';

-- ── Grants: שרשרת מלאה ל-RLS WITH CHECK ─────────────────────────────────────
REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_document_row(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_document_row(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_org_admin_write(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_fleet_staff_privileges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_documents'
  ) THEN
    DROP POLICY IF EXISTS "vehicle_documents_insert_handover_archive" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_insert_handover_archive"
      ON public.vehicle_documents FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND public.user_may_insert_vehicle_document_row(auth.uid(), vehicle_id, handover_id)
      );

    DROP POLICY IF EXISTS "vehicle_documents_insert_platform_super_admin" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_insert_platform_super_admin"
      ON public.vehicle_documents FOR INSERT
      TO authenticated
      WITH CHECK (public.is_platform_super_admin(auth.uid()));

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_documents TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
