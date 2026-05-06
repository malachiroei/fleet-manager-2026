-- Allow platform super admin (is_platform_super_admin) to list all rows in public.organizations
-- for SELECT, in addition to org-scoped selects. Enables org switcher in the app header without
-- requiring org_memberships for every tenant org.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_select_platform_super_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY organizations_select_platform_super_admin
      ON public.organizations FOR SELECT TO authenticated
      USING (public.is_platform_super_admin(auth.uid()));
    $pol$;
  END IF;
END $$;
