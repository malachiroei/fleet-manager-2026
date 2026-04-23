-- =============================================================================
-- הרצה ידנית ב-Supabase SQL Editor (Production)
-- אחרי כשלון מיגרציה בגלל חוסר org_members — גרסה ללא JOIN ל-org_members.
--
-- יש שתי אפשרויות; הרץ **אחת** בלבד (לא את שתיהן).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- אפשרות א׳ — מינימלית (פתוח לכל authenticated)
-- משתמשים כשצריך תיקון 403 מיידי; האכיפה נשארת בשכבת האפליקציה.
-- -----------------------------------------------------------------------------
/*
ALTER TABLE IF EXISTS public.ui_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read ui_settings" ON public.ui_settings;
DROP POLICY IF EXISTS "authenticated write ui_settings" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_select_org_member" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_insert_org_admin" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_update_org_admin" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_delete_org_admin" ON public.ui_settings;
DROP POLICY IF EXISTS "auth_all_ui_settings" ON public.ui_settings;

CREATE POLICY "auth_all_ui_settings"
  ON public.ui_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "authenticated can select system_settings" ON public.system_settings;
    DROP POLICY IF EXISTS "authenticated can upsert system_settings" ON public.system_settings;
    CREATE POLICY "authenticated can select system_settings"
      ON public.system_settings FOR SELECT TO authenticated USING (true);
    CREATE POLICY "authenticated can upsert system_settings"
      ON public.system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
  END IF;
END $$;
*/

-- -----------------------------------------------------------------------------
-- אפשרות ב׳ — מומלץ: שייכות לפי profiles.org_id בלבד + “מנהלים”
-- דורש: טבלאות public.profiles, public.ui_settings, public.organizations
-- אופציונלי: public.user_roles — אם אין, מחק את בלוק ה-EXISTS מ-user_roles ושמור רק הרשאות JSON
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ui_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_name text NOT NULL DEFAULT '',
  org_id_number text NOT NULL DEFAULT '',
  admin_email text NOT NULL DEFAULT '',
  health_statement_text text NOT NULL DEFAULT '',
  vehicle_policy_text text NOT NULL DEFAULT '',
  health_statement_pdf_url text,
  vehicle_policy_pdf_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ui_settings_org_id_key ON public.ui_settings (org_id);

ALTER TABLE public.ui_settings
  ADD COLUMN IF NOT EXISTS health_statement_pdf_url text;
ALTER TABLE public.ui_settings
  ADD COLUMN IF NOT EXISTS vehicle_policy_pdf_url text;

ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read ui_settings" ON public.ui_settings;
DROP POLICY IF EXISTS "authenticated write ui_settings" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_select_org_member" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_insert_org_admin" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_update_org_admin" ON public.ui_settings;
DROP POLICY IF EXISTS "ui_settings_delete_org_admin" ON public.ui_settings;
DROP POLICY IF EXISTS "auth_all_ui_settings" ON public.ui_settings;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.org_id IS NOT NULL
      AND p.org_id = _org_id
  );
$$;

-- אם אין טבלת user_roles — החלף את גוף הפונקציה לגרסה שמסתמכת רק על permissions ב-profiles (ראו הערה בתחתית)
CREATE OR REPLACE FUNCTION public.can_edit_org_ui_settings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_belongs_to_org(_user_id, _org_id)
    AND (
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
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_org_ui_settings(uuid, uuid) TO authenticated;

CREATE POLICY "ui_settings_select_org_member"
  ON public.ui_settings FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "ui_settings_insert_org_admin"
  ON public.ui_settings FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org_ui_settings(auth.uid(), org_id));

CREATE POLICY "ui_settings_update_org_admin"
  ON public.ui_settings FOR UPDATE TO authenticated
  USING (public.can_edit_org_ui_settings(auth.uid(), org_id))
  WITH CHECK (public.can_edit_org_ui_settings(auth.uid(), org_id));

CREATE POLICY "ui_settings_delete_org_admin"
  ON public.ui_settings FOR DELETE TO authenticated
  USING (public.can_edit_org_ui_settings(auth.uid(), org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO authenticated;

-- system_settings (אם קיים)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "authenticated can select system_settings" ON public.system_settings;
    DROP POLICY IF EXISTS "authenticated can upsert system_settings" ON public.system_settings;
    CREATE POLICY "authenticated can select system_settings"
      ON public.system_settings FOR SELECT TO authenticated USING (true);
    CREATE POLICY "authenticated can upsert system_settings"
      ON public.system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
  END IF;
END $$;

/*
-- אם אין public.user_roles: החלף את can_edit_org_ui_settings ב:

CREATE OR REPLACE FUNCTION public.can_edit_org_ui_settings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_belongs_to_org(_user_id, _org_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _user_id
        AND (
          COALESCE((p.permissions ->> 'admin_access')::boolean, false)
          OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        )
    );
$$;
*/