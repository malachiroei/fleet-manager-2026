-- ─────────────────────────────────────────────────────────────────────────────
-- Procedure 6: org-scoped complaints + public employee response tokens
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.procedure6_complaints
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_token text,
  ADD COLUMN IF NOT EXISTS forwarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_to_email text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

COMMENT ON COLUMN public.procedure6_complaints.org_id IS 'Owning organization — required for RLS silo';
COMMENT ON COLUMN public.procedure6_complaints.driver_id IS 'Resolved driver at offense time (nullable = ללא נהג)';
COMMENT ON COLUMN public.procedure6_complaints.vehicle_id IS 'Matched vehicle row when plate resolves';
COMMENT ON COLUMN public.procedure6_complaints.response_token IS 'Public token for /procedure6/respond/:token';
COMMENT ON COLUMN public.procedure6_complaints.forwarded_by IS 'Staff user who forwarded the response link to the driver';
COMMENT ON COLUMN public.procedure6_complaints.forwarded_to_email IS 'Email the response link was sent to';
COMMENT ON COLUMN public.procedure6_complaints.closed_at IS 'When status became closed (employee submit or staff)';
COMMENT ON COLUMN public.procedure6_complaints.source IS 'manual | xml | email_inbound';

CREATE UNIQUE INDEX IF NOT EXISTS procedure6_complaints_response_token_uidx
  ON public.procedure6_complaints (response_token)
  WHERE response_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS procedure6_complaints_org_id_idx
  ON public.procedure6_complaints (org_id);

CREATE INDEX IF NOT EXISTS procedure6_complaints_driver_id_idx
  ON public.procedure6_complaints (driver_id)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS procedure6_complaints_vehicle_number_idx
  ON public.procedure6_complaints (vehicle_number);

-- Backfill org_id from matched vehicle / driver when possible
UPDATE public.procedure6_complaints c
SET org_id = v.org_id,
    vehicle_id = COALESCE(c.vehicle_id, v.id)
FROM public.vehicles v
WHERE c.org_id IS NULL
  AND v.org_id IS NOT NULL
  AND regexp_replace(COALESCE(v.plate_number, ''), '\D', '', 'g')
      = regexp_replace(COALESCE(c.vehicle_number, ''), '\D', '', 'g')
  AND length(regexp_replace(COALESCE(c.vehicle_number, ''), '\D', '', 'g')) >= 5;

UPDATE public.procedure6_complaints c
SET org_id = d.org_id,
    driver_id = COALESCE(c.driver_id, d.id)
FROM public.drivers d
WHERE c.org_id IS NULL
  AND d.org_id IS NOT NULL
  AND c.driver_name IS NOT NULL
  AND trim(c.driver_name) <> ''
  AND lower(trim(d.full_name)) = lower(trim(c.driver_name));

-- Remaining rows without org: attach to primary fleet org if present
UPDATE public.procedure6_complaints c
SET org_id = '857f2311-2ec5-41d3-8e32-dacd450a9a77'
WHERE c.org_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = '857f2311-2ec5-41d3-8e32-dacd450a9a77'
  );

-- Historical plate → driver at as-of time (used by Edge + client helpers)
CREATE OR REPLACE FUNCTION public.resolve_procedure6_driver_for_plate(
  p_plate text,
  p_as_of timestamptz,
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  org_id uuid,
  vehicle_id uuid,
  driver_id uuid,
  driver_name text,
  plate_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plate_digits text := regexp_replace(COALESCE(p_plate, ''), '\D', '', 'g');
  as_of timestamptz := COALESCE(p_as_of, now());
BEGIN
  IF plate_digits IS NULL OR length(plate_digits) < 5 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched_vehicles AS (
    SELECT v.id, v.org_id, v.plate_number
    FROM public.vehicles v
    WHERE regexp_replace(COALESCE(v.plate_number, ''), '\D', '', 'g') = plate_digits
      AND (p_org_id IS NULL OR v.org_id = p_org_id)
    ORDER BY v.updated_at DESC NULLS LAST
  ),
  pick_vehicle AS (
    SELECT * FROM matched_vehicles LIMIT 1
  ),
  as_of_assign AS (
    SELECT a.driver_id, a.vehicle_id
    FROM public.driver_vehicle_assignments a
    INNER JOIN pick_vehicle pv ON pv.id = a.vehicle_id
    WHERE a.assigned_at <= as_of
      AND (a.unassigned_at IS NULL OR a.unassigned_at > as_of)
    ORDER BY a.assigned_at DESC
    LIMIT 1
  ),
  current_assign AS (
    SELECT pv.id AS vehicle_id, v.assigned_driver_id AS driver_id
    FROM pick_vehicle pv
    INNER JOIN public.vehicles v ON v.id = pv.id
    WHERE v.assigned_driver_id IS NOT NULL
  )
  SELECT
    pv.org_id,
    pv.id AS vehicle_id,
    COALESCE(aa.driver_id, ca.driver_id) AS driver_id,
    d.full_name AS driver_name,
    pv.plate_number
  FROM pick_vehicle pv
  LEFT JOIN as_of_assign aa ON TRUE
  LEFT JOIN current_assign ca ON aa.driver_id IS NULL
  LEFT JOIN public.drivers d ON d.id = COALESCE(aa.driver_id, ca.driver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_procedure6_driver_for_plate(text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_procedure6_driver_for_plate(text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_procedure6_driver_for_plate(text, timestamptz, uuid) TO service_role;

-- RLS: replace loose policies with org-scoped ones
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'procedure6_complaints'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.procedure6_complaints', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.procedure6_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "procedure6_select_org_scoped"
  ON public.procedure6_complaints FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
  );

CREATE POLICY "procedure6_insert_org_admins"
  ON public.procedure6_complaints FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.can_org_admin_write(auth.uid(), org_id)
  );

CREATE POLICY "procedure6_update_org_admins"
  ON public.procedure6_complaints FOR UPDATE TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.can_org_admin_write(auth.uid(), org_id)
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND public.can_org_admin_write(auth.uid(), org_id)
  );

CREATE POLICY "procedure6_delete_org_admins"
  ON public.procedure6_complaints FOR DELETE TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.can_org_admin_write(auth.uid(), org_id)
  );
