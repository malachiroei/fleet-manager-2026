-- =============================================================================
-- Security Advisor hardening:
-- Enable RLS on public tables that exist but have RLS disabled (common after
-- restoring / creating a new Supabase project without replaying migrations).
--
-- Also creates baseline org-scoped policies for legacy/admin tables that may
-- exist in the project but are not defined in this repo migrations.
--
-- Design goals:
-- - Default: org_id isolation via user_belongs_to_org()
-- - Delegate hierarchy: allow read via managed_by_user_id only for NON fleet-staff
--   users (prevents peer-admin leakage), matching yesterday's fleet logic.
-- - Writes: only via can_org_admin_write() (or self row for user_id tables).
-- - Platform owner: cross-org read via user_may_cross_org_fleet_read()
-- =============================================================================

DO $$
DECLARE
  t text;
  has_org_id boolean;
  has_user_id boolean;
  has_managed_by boolean;
  has_parent_admin boolean;
  select_policy_name text;
  insert_policy_name text;
  update_policy_name text;
  delete_policy_name text;
  using_sql text;
  with_check_sql text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships',
    'org_members',
    'org_invitations',
    'maintenance_records',
    'user_feature_overrides',
    'org_documents_backup',
    'org_documents_backup_main',
    'org_documents_old'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Enable RLS (idempotent).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Column capabilities (for generating safe policies).
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='org_id'
    ) INTO has_org_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_user_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='managed_by_user_id'
    ) INTO has_managed_by;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='parent_admin_id'
    ) INTO has_parent_admin;

    -- Only create baseline policies when the table has no SELECT policy yet.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='SELECT'
    ) THEN
      CONTINUE;
    END IF;

    select_policy_name := t || '_select_org_scope';
    insert_policy_name := t || '_insert_org_scope';
    update_policy_name := t || '_update_org_scope';
    delete_policy_name := t || '_delete_org_scope';

    -- Build SELECT USING clause.
    using_sql := 'public.user_may_cross_org_fleet_read(auth.uid())';

    IF has_user_id THEN
      using_sql := using_sql || ' OR (user_id IS NOT NULL AND user_id = auth.uid())';
    END IF;

    IF has_org_id THEN
      using_sql := using_sql || ' OR public.user_belongs_to_org(auth.uid(), org_id)';
    END IF;

    -- Delegate hierarchy (if table is managed_by-scoped): only for non staff.
    IF has_managed_by THEN
      using_sql := using_sql ||
        ' OR (managed_by_user_id IS NULL' ||
        ' OR managed_by_user_id = auth.uid()' ||
        ' OR (public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)' ||
        ' AND NOT public.user_has_fleet_staff_privileges(auth.uid())))';
    END IF;

    -- Some legacy tables may model ownership directly as parent_admin_id.
    IF has_parent_admin THEN
      using_sql := using_sql || ' OR (parent_admin_id IS NOT NULL AND parent_admin_id = auth.uid())';
    END IF;

    -- Drop if exists (safe if re-applied).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', select_policy_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      select_policy_name,
      t,
      using_sql
    );

    -- Writes: prefer org-scoped admin writes when org_id exists.
    IF has_org_id THEN
      with_check_sql := 'public.can_org_admin_write(auth.uid(), org_id)';
      -- Self-owned insert/update for user_id tables is also ok (keeps invites/memberships usable).
      IF has_user_id THEN
        with_check_sql := with_check_sql || ' OR (user_id IS NOT NULL AND user_id = auth.uid())';
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', insert_policy_name, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        insert_policy_name,
        t,
        with_check_sql
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', update_policy_name, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        update_policy_name,
        t,
        using_sql,
        with_check_sql
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', delete_policy_name, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
        delete_policy_name,
        t,
        using_sql
      );
    END IF;
  END LOOP;
END $$;

-- Ensure core tables mentioned by Advisor at least have RLS enabled.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'user_roles',
    'compliance_alerts'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

