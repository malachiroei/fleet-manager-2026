-- =============================================================================
-- archiveHandoverSubmission: INSERT ל-vehicle_documents נחסם ב-RLS (42501).
-- מדיניות ישנות מסתמכות על JOIN ל-vehicles ב-WITH CHECK — בפרו הנוכחי נכשל;
-- ובעל פלטפורמה ללא התאמת user_may_cross_org_fleet_read לא עובר.
-- פונקציית SECURITY DEFINER מאמתת על vehicles/handover ללא RLS מקונן.
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
      /* בעל פלטפורמה */
      public.is_platform_super_admin(_uid)
      /* צוות כתיבה בארגון הרכב */
      OR EXISTS (
        SELECT 1
        FROM public.vehicles v
        WHERE v.id = _vehicle_id
          AND public.can_org_admin_write(_uid, v.org_id)
      )
      /* מסירה: הרשאת vehicle_delivery באותו ארגון */
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
              AND COALESCE((p.permissions ->> 'vehicle_delivery')::boolean, false)
          )
      )
      /* מארכב טופס PDF לאותה העברה: יוצר השורה, או צוות כתיבה אם created_by ריק ישן */
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
              OR (
                h.created_by IS NULL
                AND public.can_org_admin_write(_uid, v.org_id)
              )
            )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.user_may_insert_vehicle_document_row(uuid, uuid, uuid) IS
  'RLS INSERT vehicle_documents לארכון טופס מסירה: פלטפורמה / צוות ארגון / vehicle_delivery / יוצר ההעברה.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_document_row(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_document_row(uuid, uuid, uuid) TO authenticated;

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

    COMMENT ON POLICY "vehicle_documents_insert_handover_archive" ON public.vehicle_documents IS
      'INSERT מסמכי ארכון handover דרך אפליקציה — בלי תלות ב-vehicles RLS בתוך WITH CHECK.';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_documents TO authenticated;

NOTIFY pgrst, 'reload schema';
