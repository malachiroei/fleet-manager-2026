-- =============================================================================
-- ServiceUpdatePage שומר שורת audit לפני שליחת מייל — הטבלה לא הוגדרה במיגרציות
-- → PGRST205 / 404. יוצרים vehicle_service_logs + RLS תואם גישה לרכב.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles (id) ON DELETE CASCADE,
  plate_number text,
  service_type text NOT NULL,
  odometer_reading integer NOT NULL,
  photo_url text,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_service_logs_vehicle_id ON public.vehicle_service_logs (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_service_logs_created_at ON public.vehicle_service_logs (created_at DESC);

COMMENT ON TABLE public.vehicle_service_logs IS
  'Audit log for עדכון טיפול / service update form (before email notification).';

ALTER TABLE public.vehicle_service_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: רק המשתמש המחובר כמדווח, ורק אם יש לו גישת צי לרכב (כמו vehicles SELECT)
CREATE POLICY "vehicle_service_logs_insert_vehicle_access"
  ON public.vehicle_service_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = vehicle_service_logs.vehicle_id
        AND (
          public.user_may_cross_org_fleet_read(auth.uid())
          OR (
            v.org_id IS NOT NULL
            AND public.user_belongs_to_org(auth.uid(), v.org_id)
            AND (
              v.managed_by_user_id IS NULL
              OR v.managed_by_user_id = auth.uid()
              OR public.user_has_fleet_staff_privileges(auth.uid())
            )
          )
          OR (
            v.org_id IS NULL
            AND public.user_has_fleet_staff_privileges(auth.uid())
          )
        )
    )
  );

CREATE POLICY "vehicle_service_logs_select_vehicle_access"
  ON public.vehicle_service_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = vehicle_service_logs.vehicle_id
        AND (
          public.user_may_cross_org_fleet_read(auth.uid())
          OR (
            v.org_id IS NOT NULL
            AND public.user_belongs_to_org(auth.uid(), v.org_id)
            AND (
              v.managed_by_user_id IS NULL
              OR v.managed_by_user_id = auth.uid()
              OR public.user_has_fleet_staff_privileges(auth.uid())
            )
          )
          OR (
            v.org_id IS NULL
            AND public.user_has_fleet_staff_privileges(auth.uid())
          )
        )
    )
  );

GRANT SELECT, INSERT ON TABLE public.vehicle_service_logs TO authenticated;
GRANT ALL ON TABLE public.vehicle_service_logs TO service_role;

NOTIFY pgrst, 'reload schema';
