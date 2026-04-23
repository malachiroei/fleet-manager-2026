-- ─────────────────────────────────────────────────────────────────────────────
-- RLS hardening: org-scoped SELECT for authenticated; writes for org admins.
--
-- · Expands user_belongs_to_org() to include org_members (multi-org) + profiles.org_id.
-- · Adds user_has_fleet_staff_privileges() + can_org_admin_write() (no dependency on is_manager()).
-- · Replaces permissive policies on core fleet tables (vehicles, drivers, org_documents,
--   ui_settings already uses helpers — they pick up the new user_belongs_to_org).
-- · Splits system_settings writes from open FOR ALL.
-- · REVOKE ALL from anon on public tables/sequences (no PostgREST exposure for anon).
-- · Each table’s RLS/policies run only if information_schema.tables has the table.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: membership in an organization (primary profile org OR org_members) ─
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _org_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = _user_id
          AND p.org_id IS NOT NULL
          AND p.org_id = _org_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.org_members m
        WHERE m.user_id = _user_id
          AND m.org_id = _org_id
      )
    );
$$;

COMMENT ON FUNCTION public.user_belongs_to_org(uuid, uuid) IS
  'True if profiles.org_id or org_members grants access to _org_id.';

-- ── Helper: fleet staff without calling is_manager() (user_roles + profiles JSON) ─
CREATE OR REPLACE FUNCTION public.user_has_fleet_staff_privileges(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text IN ('admin', 'fleet_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _user_id
        AND (
          COALESCE((p.permissions ->> 'admin_access')::boolean, false)
          OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        )
    );
$$;

COMMENT ON FUNCTION public.user_has_fleet_staff_privileges(uuid) IS
  'True if user_roles has admin/fleet_manager OR profiles.permissions admin_access/manage_team.';

GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;

-- ── Helper: may INSERT/UPDATE/DELETE org-scoped fleet / settings rows ─────────
CREATE OR REPLACE FUNCTION public.can_org_admin_write(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _org_id IS NULL THEN
      public.user_has_fleet_staff_privileges(_user_id)
    ELSE
      public.user_belongs_to_org(_user_id, _org_id)
      AND public.user_has_fleet_staff_privileges(_user_id)
  END;
$$;

COMMENT ON FUNCTION public.can_org_admin_write(uuid, uuid) IS
  'Org-scoped write: in org + fleet staff (user_roles admin/fleet_manager OR profiles admin_access/manage_team). Legacy NULL org_id: staff only.';

GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

-- ── Drop all policies on tables we recreate (names vary across historical migrations) ─
DO $$
DECLARE
  t text;
  pol text;
  tables text[] := ARRAY[
    'vehicles',
    'drivers',
    'maintenance_logs',
    'vehicle_handovers',
    'compliance_alerts',
    'driver_documents',
    'driver_vehicle_assignments',
    'pricing_data',
    'procedure6_complaints',
    'vehicle_expenses',
    'vehicle_incidents',
    'vehicle_documents',
    'org_documents',
    'organization_settings',
    'ui_customization',
    'feature_flags',
    'organizations',
    'driver_family_members',
    'driver_incidents',
    'mileage_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;
  END LOOP;
END $$;

-- ── organizations ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    EXECUTE 'ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY';
    EXECUTE $sql$
      CREATE POLICY "organizations_select_same_org"
        ON public.organizations FOR SELECT TO authenticated
        USING (public.user_belongs_to_org(auth.uid(), id));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "organizations_insert_org_admins"
        ON public.organizations FOR INSERT TO authenticated
        WITH CHECK (public.can_org_admin_write(auth.uid(), id));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "organizations_update_org_admins"
        ON public.organizations FOR UPDATE TO authenticated
        USING (public.can_org_admin_write(auth.uid(), id))
        WITH CHECK (public.can_org_admin_write(auth.uid(), id));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "organizations_delete_org_admins"
        ON public.organizations FOR DELETE TO authenticated
        USING (public.can_org_admin_write(auth.uid(), id));
    $sql$;
  END IF;
END $$;

-- ── vehicles ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicles'
  ) THEN
    ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicles_select_org_scope"
      ON public.vehicles FOR SELECT TO authenticated
      USING (
        (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
        AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
      );
    CREATE POLICY "vehicles_insert_org_admins"
      ON public.vehicles FOR INSERT TO authenticated
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "vehicles_update_org_admins"
      ON public.vehicles FOR UPDATE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      )
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "vehicles_delete_org_admins"
      ON public.vehicles FOR DELETE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "vehicles_update_assigned_driver_odometer"
      ON public.vehicles FOR UPDATE TO authenticated
      USING (
        assigned_driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      )
      WITH CHECK (
        assigned_driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      );
  END IF;
END $$;

-- ── drivers ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drivers'
  ) THEN
    ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "drivers_select_org_scope"
      ON public.drivers FOR SELECT TO authenticated
      USING (
        (user_id IS NOT NULL AND user_id = auth.uid())
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
    CREATE POLICY "drivers_insert_org_admins"
      ON public.drivers FOR INSERT TO authenticated
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "drivers_update_org_admins"
      ON public.drivers FOR UPDATE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      )
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "drivers_update_own_linked_user"
      ON public.drivers FOR UPDATE TO authenticated
      USING (
        user_id IS NOT NULL
        AND user_id = auth.uid()
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      )
      WITH CHECK (
        user_id IS NOT NULL
        AND user_id = auth.uid()
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      );
    CREATE POLICY "drivers_delete_org_admins"
      ON public.drivers FOR DELETE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
  END IF;
END $$;

-- ── org_documents (no org_id column — global forms per deployment) ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_documents'
  ) THEN
    ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "org_documents_select_authenticated"
      ON public.org_documents FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
    CREATE POLICY "org_documents_insert_staff"
      ON public.org_documents FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "org_documents_update_staff"
      ON public.org_documents FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "org_documents_delete_staff"
      ON public.org_documents FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── ui_settings: policies already reference user_belongs_to_org / can_edit_org_ui_settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ui_settings'
  ) THEN
    ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ── organization_settings (per-row organization_id when present) ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_settings'
  ) THEN
    ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organization_settings'
        AND column_name = 'organization_id'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY "organization_settings_select_same_org"
          ON public.organization_settings FOR SELECT TO authenticated
          USING (
            organization_id IS NULL
            OR public.user_belongs_to_org(auth.uid(), organization_id)
          );
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_insert_org_admins"
          ON public.organization_settings FOR INSERT TO authenticated
          WITH CHECK (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          );
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_update_org_admins"
          ON public.organization_settings FOR UPDATE TO authenticated
          USING (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          )
          WITH CHECK (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          );
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_delete_org_admins"
          ON public.organization_settings FOR DELETE TO authenticated
          USING (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          );
      $sql$;
    ELSE
      EXECUTE $sql$
        CREATE POLICY "organization_settings_select_authenticated"
          ON public.organization_settings FOR SELECT TO authenticated
          USING (auth.uid() IS NOT NULL);
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_insert_staff"
          ON public.organization_settings FOR INSERT TO authenticated
          WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())));
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_update_staff"
          ON public.organization_settings FOR UPDATE TO authenticated
          USING (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())))
          WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())));
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_delete_staff"
          ON public.organization_settings FOR DELETE TO authenticated
          USING (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())));
      $sql$;
    END IF;
  END IF;
END $$;

-- ── ui_customization (singleton-style labels — writes limited to staff) ─────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ui_customization'
  ) THEN
    ALTER TABLE public.ui_customization ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "ui_customization_select_authenticated"
      ON public.ui_customization FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
    CREATE POLICY "ui_customization_insert_staff"
      ON public.ui_customization FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "ui_customization_update_staff"
      ON public.ui_customization FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "ui_customization_delete_staff"
      ON public.ui_customization FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── feature_flags (read for app; mutate only staff) ───────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "feature_flags_select_authenticated"
      ON public.feature_flags FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
    CREATE POLICY "feature_flags_insert_staff"
      ON public.feature_flags FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "feature_flags_update_staff"
      ON public.feature_flags FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "feature_flags_delete_staff"
      ON public.feature_flags FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── system_settings: keep broad read; restrict writes ─────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    EXECUTE 'ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated can upsert system_settings" ON public.system_settings';
    EXECUTE $sql$
      CREATE POLICY "system_settings_insert_staff"
        ON public.system_settings FOR INSERT TO authenticated
        WITH CHECK (public.user_has_fleet_staff_privileges(auth.uid()));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "system_settings_update_staff"
        ON public.system_settings FOR UPDATE TO authenticated
        USING (public.user_has_fleet_staff_privileges(auth.uid()))
        WITH CHECK (public.user_has_fleet_staff_privileges(auth.uid()));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "system_settings_delete_staff"
        ON public.system_settings FOR DELETE TO authenticated
        USING (public.user_has_fleet_staff_privileges(auth.uid()));
    $sql$;
  END IF;
END $$;

-- ── maintenance_logs (via vehicle org) ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'maintenance_logs'
  ) THEN
    ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "maintenance_logs_select_same_org"
      ON public.maintenance_logs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "maintenance_logs_insert_org_admins"
      ON public.maintenance_logs FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "maintenance_logs_update_org_admins"
      ON public.maintenance_logs FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "maintenance_logs_delete_org_admins"
      ON public.maintenance_logs FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── vehicle_handovers ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_handovers'
  ) THEN
    ALTER TABLE public.vehicle_handovers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_handovers_select_same_org"
      ON public.vehicle_handovers FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_handovers_insert_org_participants"
      ON public.vehicle_handovers FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
            AND (
              EXISTS (
                SELECT 1
                FROM public.user_roles ur
                WHERE ur.user_id = auth.uid()
                  AND ur.role::text = 'driver'
              )
              OR public.can_org_admin_write(auth.uid(), v.org_id)
            )
        )
      );
    CREATE POLICY "vehicle_handovers_update_org_admins"
      ON public.vehicle_handovers FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_handovers_delete_org_admins"
      ON public.vehicle_handovers FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── compliance_alerts ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_alerts'
  ) THEN
    ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "compliance_alerts_select_same_org"
      ON public.compliance_alerts FOR SELECT TO authenticated
      USING (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
        )
      );
    CREATE POLICY "compliance_alerts_insert_org_admins"
      ON public.compliance_alerts FOR INSERT TO authenticated
      WITH CHECK (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      );
    CREATE POLICY "compliance_alerts_update_org_admins"
      ON public.compliance_alerts FOR UPDATE TO authenticated
      USING (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      )
      WITH CHECK (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      );
    CREATE POLICY "compliance_alerts_delete_org_admins"
      ON public.compliance_alerts FOR DELETE TO authenticated
      USING (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      );
  END IF;
END $$;

-- ── driver_documents ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_documents'
  ) THEN
    ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "driver_documents_select_same_org"
      ON public.driver_documents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND (
              (d.user_id IS NOT NULL AND d.user_id = auth.uid())
              OR (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
            )
        )
      );
    CREATE POLICY "driver_documents_insert_org_admins"
      ON public.driver_documents FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      );
    CREATE POLICY "driver_documents_update_org_admins"
      ON public.driver_documents FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      );
    CREATE POLICY "driver_documents_delete_org_admins"
      ON public.driver_documents FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      );
  END IF;
END $$;

-- ── driver_vehicle_assignments ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_vehicle_assignments'
  ) THEN
    ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "assignments_select_same_org"
      ON public.driver_vehicle_assignments FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "assignments_insert_org_admins"
      ON public.driver_vehicle_assignments FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "assignments_update_org_admins"
      ON public.driver_vehicle_assignments FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "assignments_delete_org_admins"
      ON public.driver_vehicle_assignments FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── pricing_data (no org column — staff only for writes) ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pricing_data'
  ) THEN
    ALTER TABLE public.pricing_data ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "pricing_data_select_same_org_users"
      ON public.pricing_data FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id IS NOT NULL)
      );
    CREATE POLICY "pricing_data_insert_staff"
      ON public.pricing_data FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "pricing_data_update_staff"
      ON public.pricing_data FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "pricing_data_delete_staff"
      ON public.pricing_data FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── procedure6_complaints ───────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'procedure6_complaints'
  ) THEN
    ALTER TABLE public.procedure6_complaints ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "procedure6_select_org_users"
      ON public.procedure6_complaints FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id IS NOT NULL)
      );
    CREATE POLICY "procedure6_insert_staff"
      ON public.procedure6_complaints FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "procedure6_update_staff"
      ON public.procedure6_complaints FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "procedure6_delete_staff"
      ON public.procedure6_complaints FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── vehicle_expenses / vehicle_incidents ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_expenses'
  ) THEN
    ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_expenses_select_same_org"
      ON public.vehicle_expenses FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_expenses_insert_org_admins"
      ON public.vehicle_expenses FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_expenses_update_org_admins"
      ON public.vehicle_expenses FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_expenses_delete_org_admins"
      ON public.vehicle_expenses FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
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
    ALTER TABLE public.vehicle_incidents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_incidents_select_same_org"
      ON public.vehicle_incidents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_incidents_insert_org_admins"
      ON public.vehicle_incidents FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_incidents_update_org_admins"
      ON public.vehicle_incidents FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_incidents_delete_org_admins"
      ON public.vehicle_incidents FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── vehicle_documents ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_documents'
  ) THEN
    ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_documents_select_same_org"
      ON public.vehicle_documents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_documents_insert_org_admins"
      ON public.vehicle_documents FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_documents_update_org_admins"
      ON public.vehicle_documents FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_documents_delete_org_admins"
      ON public.vehicle_documents FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── driver_family_members / driver_incidents ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_family_members'
  ) THEN
    ALTER TABLE public.driver_family_members ENABLE ROW LEVEL SECURITY;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_select_same_org"
        ON public.driver_family_members FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_insert_org_admins"
        ON public.driver_family_members FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_update_org_admins"
        ON public.driver_family_members FOR UPDATE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_delete_org_admins"
        ON public.driver_family_members FOR DELETE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_incidents'
  ) THEN
    ALTER TABLE public.driver_incidents ENABLE ROW LEVEL SECURITY;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_select_same_org"
        ON public.driver_incidents FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_insert_org_admins"
        ON public.driver_incidents FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_update_org_admins"
        ON public.driver_incidents FOR UPDATE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_delete_org_admins"
        ON public.driver_incidents FOR DELETE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
  END IF;
END $$;

-- ── mileage_logs (align with user_belongs_to_org + vehicle org) ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_logs'
  ) THEN
    ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
    EXECUTE $sql$
      CREATE POLICY "mileage_logs_insert_authenticated"
        ON public.mileage_logs FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND user_id = auth.uid()
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = mileage_logs.vehicle_id
              AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "mileage_logs_select_authenticated"
        ON public.mileage_logs FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = mileage_logs.vehicle_id
              AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
        );
    $sql$;
    EXECUTE 'GRANT SELECT, INSERT ON public.mileage_logs TO authenticated';
  END IF;
END $$;

-- ── user_feature_overrides: same-org staff via can_org_admin_write ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_feature_overrides'
  ) THEN
    DROP POLICY IF EXISTS "user_feature_overrides_same_org_staff" ON public.user_feature_overrides;
    CREATE POLICY "user_feature_overrides_same_org_staff"
      ON public.user_feature_overrides
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles target
          WHERE target.id = user_feature_overrides.user_id
            AND target.org_id IS NOT NULL
            AND public.user_belongs_to_org(auth.uid(), target.org_id)
            AND public.can_org_admin_write(auth.uid(), target.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles target
          WHERE target.id = user_feature_overrides.user_id
            AND target.org_id IS NOT NULL
            AND public.user_belongs_to_org(auth.uid(), target.org_id)
            AND public.can_org_admin_write(auth.uid(), target.org_id)
        )
      );
  END IF;
END $$;

-- ── Anon: remove table/sequence privileges (sensitive data via service role / auth only) ─
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
