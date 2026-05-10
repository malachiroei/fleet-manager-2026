-- ════════════════════════════════════════════════════════════════════════════
-- org_documents — fix DELETE/UPDATE RLS for platform owner + system admins,
-- and hard-delete broken/empty form rows that show "אין טופס" in the UI.
--
-- Symptom we are fixing:
--   The platform owner (malachiroei@gmail.com) clicks "מחיקה לצמיתות" in the
--   forms folder, the request returns 0 rows changed and the UI surfaces
--   "המחיקה לא בוצעה — ייתכן שאין לך הרשאה (RLS)". Either the prod DB still
--   carries the legacy can_org_admin_write() that lacked a platform-owner
--   short-circuit, or the user's `profiles.org_id` is NULL/foreign and the
--   policy's `user_belongs_to_org()` resolves to false. Either way we want
--   the policy to *also* accept platform owner directly, independent of the
--   helper function chain.
--
-- Cleanup in this migration:
--   - Hard-delete rows in `public.org_documents` whose `file_url` is NULL,
--     blank, or "obviously broken" (literal text 'undefined' / 'null' /
--     pointing to non-bundled local placeholders that were never shipped).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Re-assert can_org_admin_write so platform owner is *always* allowed ──
CREATE OR REPLACE FUNCTION public.can_org_admin_write(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.user_may_cross_org_fleet_read(_user_id) THEN
      true
    WHEN _org_id IS NULL THEN
      public.user_has_fleet_staff_privileges(_user_id)
    ELSE
      public.user_belongs_to_org(_user_id, _org_id)
      AND public.user_has_fleet_staff_privileges(_user_id)
  END;
$$;

COMMENT ON FUNCTION public.can_org_admin_write(uuid, uuid) IS
  'Org-scoped write: platform owner cross-org OR (in org + fleet staff). NULL org_id => staff only.';

REVOKE ALL ON FUNCTION public.can_org_admin_write(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

-- ── 2) Re-create org_documents RLS policies with explicit platform-owner   ──
--      bypass on every write/delete path, so this no longer depends on the   
--      helper chain being up-to-date.                                        
DO $$
DECLARE pol text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_documents'
  ) THEN
    RAISE NOTICE 'org_documents table missing — skipping RLS fix';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY';

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'org_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.org_documents', pol);
  END LOOP;

  EXECUTE $sql$
    CREATE POLICY "org_documents_select_authenticated"
      ON public.org_documents
      FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL)
  $sql$;

  EXECUTE $sql$
    CREATE POLICY "org_documents_insert_staff"
      ON public.org_documents
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.can_org_admin_write(
          auth.uid(),
          (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY "org_documents_update_staff"
      ON public.org_documents
      FOR UPDATE TO authenticated
      USING (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.can_org_admin_write(
          auth.uid(),
          (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
      WITH CHECK (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.can_org_admin_write(
          auth.uid(),
          (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY "org_documents_delete_staff"
      ON public.org_documents
      FOR DELETE TO authenticated
      USING (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.can_org_admin_write(
          auth.uid(),
          (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
  $sql$;
END $$;

-- ── 3) One-shot cleanup of "broken" form rows ───────────────────────────────
--      These are rows that the UI shows but cannot open because file_url is
--      missing/garbage. We log what we are about to delete (RAISE NOTICE)
--      then perform the DELETE.
DO $$
DECLARE r record;
DECLARE deleted_count int := 0;
BEGIN
  FOR r IN
    SELECT id, title, file_url
    FROM public.org_documents
    WHERE
      is_active = true
      AND (
        file_url IS NULL
        OR length(btrim(file_url)) = 0
        OR lower(btrim(file_url)) IN ('null', 'undefined', '#', 'about:blank')
      )
  LOOP
    RAISE NOTICE 'cleanup org_documents: id=% title=% file_url=%', r.id, r.title, r.file_url;
  END LOOP;

  DELETE FROM public.org_documents
  WHERE
    is_active = true
    AND (
      file_url IS NULL
      OR length(btrim(file_url)) = 0
      OR lower(btrim(file_url)) IN ('null', 'undefined', '#', 'about:blank')
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'org_documents cleanup deleted % broken rows', deleted_count;
END $$;

NOTIFY pgrst, 'reload schema';
