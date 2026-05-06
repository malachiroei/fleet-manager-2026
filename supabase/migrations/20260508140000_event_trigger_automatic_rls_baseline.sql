-- =============================================================================
-- Automatic RLS baseline for NEW tables in public (SQL Editor / migrations).
-- Event trigger on CREATE TABLE / CREATE TABLE AS:
--   1) ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--   2) CREATE POLICY fleet_auto_baseline_select FOR SELECT TO authenticated:
--      - אם קיימת עמודת org_id: Super Admin OR user_belongs_to_org(auth.uid(), org_id)
--      - אחרת: רק Super Admin (עד שתוסיפו org_id או מדיניות ידנית)
--
-- דורש: public.is_platform_super_admin, public.user_belongs_to_org (מיגרציית flat tenant).
-- לא פועל על אובייקטים שנוצרים כחלק מהתקנת extension (in_extension).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_fleet_rls_baseline()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cmd record;
  sch name;
  tbl name;
  rk "char";
  has_org_id boolean;
  using_clause text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_platform_super_admin'
  ) THEN
    RAISE WARNING 'trg_fn_fleet_rls_baseline: public.is_platform_super_admin missing — skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_belongs_to_org'
  ) THEN
    RAISE WARNING 'trg_fn_fleet_rls_baseline: public.user_belongs_to_org missing — skipped';
    RETURN;
  END IF;

  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
      AND COALESCE(in_extension, false) = false
  LOOP
    BEGIN
      IF cmd.objid IS NULL THEN
        CONTINUE;
      END IF;

      SELECT n.nspname::name, c.relname::name, c.relkind
        INTO sch, tbl, rk
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = cmd.objid;

      IF sch IS NULL OR tbl IS NULL THEN
        CONTINUE;
      END IF;
      IF sch <> 'public' THEN
        CONTINUE;
      END IF;
      IF rk NOT IN ('r', 'p') THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = tbl
          AND column_name = 'org_id'
      ) INTO has_org_id;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      IF has_org_id THEN
        using_clause :=
          '(public.is_platform_super_admin(auth.uid()) OR (org_id IS NOT NULL AND public.user_belongs_to_org(auth.uid(), org_id)))';
      ELSE
        using_clause := '(public.is_platform_super_admin(auth.uid()))';
      END IF;

      EXECUTE format(
        'DROP POLICY IF EXISTS fleet_auto_baseline_select ON public.%I',
        tbl
      );
      EXECUTE format(
        'CREATE POLICY fleet_auto_baseline_select ON public.%I FOR SELECT TO authenticated USING %s',
        tbl,
        using_clause
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'fleet_rls_baseline failed for objid=%: %', cmd.objid, SQLERRM;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_fleet_rls_baseline() IS
  'ddl_command_end: ENABLE RLS + fleet_auto_baseline_select on new public tables.';

DROP EVENT TRIGGER IF EXISTS trg_fleet_rls_baseline_on_create;

CREATE EVENT TRIGGER trg_fleet_rls_baseline_on_create
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
  EXECUTE PROCEDURE public.trg_fn_fleet_rls_baseline();

COMMENT ON EVENT TRIGGER trg_fleet_rls_baseline_on_create IS
  'Fleet Manager: auto RLS + org-scoped SELECT baseline for new public tables.';

NOTIFY pgrst, 'reload schema';
