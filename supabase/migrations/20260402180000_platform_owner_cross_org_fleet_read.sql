-- ─────────────────────────────────────────────────────────────────────────────
-- View-As / ביקורת צי: הלקוח שולח org_id של משתמש אחר, אבל JWT נשאר של המנהל
-- המחובר. בלי חריגה זו, RLS חוסם כי user_belongs_to_org(מנהל, org_של_המחולף) false.
-- מאפשרים קריאת צי (SELECT) רק למייל בעל הפלטפורמה (תואם ל-useDashboard isMainAdmin).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
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
      AND lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
  );
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Platform owner may SELECT fleet rows in any org (View-As / support); JWT stays the owner.';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

-- vehicles (נוכחי אחרי 20260402153000)
DROP POLICY IF EXISTS "vehicles_select_org_scope" ON public.vehicles;

CREATE POLICY "vehicles_select_org_scope"
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
    )
    OR (
      org_id IS NULL
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

DROP POLICY IF EXISTS "drivers_select_org_scope" ON public.drivers;

CREATE POLICY "drivers_select_org_scope"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = 'viewer'
      )
      AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "vehicle_handovers_select_same_org" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_select_same_org"
  ON public.vehicle_handovers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = vehicle_handovers.vehicle_id
        AND (
          public.user_may_cross_org_fleet_read(auth.uid())
          OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
    )
  );

DROP POLICY IF EXISTS "compliance_alerts_select_same_org" ON public.compliance_alerts;

CREATE POLICY "compliance_alerts_select_same_org"
  ON public.compliance_alerts FOR SELECT TO authenticated
  USING (
    (
      entity_type = 'vehicle'
      AND EXISTS (
        SELECT 1
        FROM public.vehicles v
        WHERE v.id = compliance_alerts.entity_id
          AND (
            public.user_may_cross_org_fleet_read(auth.uid())
            OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
      )
    )
    OR (
      entity_type = 'driver'
      AND EXISTS (
        SELECT 1
        FROM public.drivers d
        WHERE d.id = compliance_alerts.entity_id
          AND (
            public.user_may_cross_org_fleet_read(auth.uid())
            OR (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
      )
    )
  );

DROP POLICY IF EXISTS "assignments_select_same_org" ON public.driver_vehicle_assignments;

CREATE POLICY "assignments_select_same_org"
  ON public.driver_vehicle_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = driver_vehicle_assignments.vehicle_id
        AND (
          public.user_may_cross_org_fleet_read(auth.uid())
          OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
    )
  );

DROP POLICY IF EXISTS "vehicle_documents_select_same_org" ON public.vehicle_documents;

CREATE POLICY "vehicle_documents_select_same_org"
  ON public.vehicle_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = vehicle_documents.vehicle_id
        AND (
          public.user_may_cross_org_fleet_read(auth.uid())
          OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
    )
  );

DROP POLICY IF EXISTS "maintenance_logs_select_same_org" ON public.maintenance_logs;

CREATE POLICY "maintenance_logs_select_same_org"
  ON public.maintenance_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = maintenance_logs.vehicle_id
        AND (
          public.user_may_cross_org_fleet_read(auth.uid())
          OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_expenses'
  ) THEN
    DROP POLICY IF EXISTS "vehicle_expenses_select_same_org" ON public.vehicle_expenses;
    CREATE POLICY "vehicle_expenses_select_same_org"
      ON public.vehicle_expenses FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_incidents'
  ) THEN
    DROP POLICY IF EXISTS "vehicle_incidents_select_same_org" ON public.vehicle_incidents;
    CREATE POLICY "vehicle_incidents_select_same_org"
      ON public.vehicle_incidents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_documents'
  ) THEN
    DROP POLICY IF EXISTS "driver_documents_select_same_org" ON public.driver_documents;
    CREATE POLICY "driver_documents_select_same_org"
      ON public.driver_documents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (d.user_id IS NOT NULL AND d.user_id = auth.uid())
              OR (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_family_members'
  ) THEN
    DROP POLICY IF EXISTS "driver_family_members_select_same_org" ON public.driver_family_members;
    CREATE POLICY "driver_family_members_select_same_org"
      ON public.driver_family_members FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_family_members.driver_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_incidents'
  ) THEN
    DROP POLICY IF EXISTS "driver_incidents_select_same_org" ON public.driver_incidents;
    CREATE POLICY "driver_incidents_select_same_org"
      ON public.driver_incidents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_incidents.driver_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
            )
        )
      );
  END IF;
END $$;
