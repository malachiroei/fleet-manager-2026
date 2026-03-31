-- ui_settings: טבלת טפסי הצהרת בריאות / מדיניות רכב וכו׳ (ממופה ב-useOrgSettings → ui_settings).
-- בפרודקשן לעיתים חסרות מדיניות RLS או הטבלה עצמה — מתקבל 403 מ-PostgREST בעת שמירה.
--
-- מדיניות:
-- · קריאה: משתמש מחובר השייך לארגון (org_members או profiles.org_id).
-- · כתיבה: אותו תנאי שייכות + (תפקיד מנהל ב-user_roles או admin_access/manage_team ב-profiles.permissions).

-- ── טבלה (אם עדיין לא קיימת בסביבה) ─────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS ui_settings_org_id_idx ON public.ui_settings (org_id);

-- עמודות PDF — אם הטבלה כבר הייתה מגרסה ישנה בלי העמודות
ALTER TABLE public.ui_settings
  ADD COLUMN IF NOT EXISTS health_statement_pdf_url text;
ALTER TABLE public.ui_settings
  ADD COLUMN IF NOT EXISTS vehicle_policy_pdf_url text;

ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;

-- הסרת מדיניות ישנות/פתוחות מסקריפטי תיקון (כדי שלא תישאר רק "כתיבה לכולם" ללא סינון, או כפילויות)
DROP POLICY IF EXISTS "authenticated read ui_settings" ON public.ui_settings;
DROP POLICY IF EXISTS "authenticated write ui_settings" ON public.ui_settings;

-- ── פונקציות עזר (SECURITY DEFINER — עוקף RLS על טבלאות המשנה) ──────────────
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = _user_id
      AND om.org_id = _org_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.org_id IS NOT NULL
      AND p.org_id = _org_id
  );
$$;

COMMENT ON FUNCTION public.user_belongs_to_org(uuid, uuid) IS
  'True if the user is linked to the org via org_members or profiles.org_id (legacy).';

CREATE OR REPLACE FUNCTION public.can_edit_org_ui_settings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_belongs_to_org(_user_id, _org_id)
    AND (
      public.is_manager(_user_id)
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

COMMENT ON FUNCTION public.can_edit_org_ui_settings(uuid, uuid) IS
  'Fleet/org admins: user_roles admin|fleet_manager OR profiles admin_access|manage_team.';

GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_org_ui_settings(uuid, uuid) TO authenticated;

-- ── מדיניות RLS על ui_settings ──────────────────────────────────────────────
DROP POLICY IF EXISTS "ui_settings_select_org_member" ON public.ui_settings;
CREATE POLICY "ui_settings_select_org_member"
  ON public.ui_settings
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), org_id));

DROP POLICY IF EXISTS "ui_settings_insert_org_admin" ON public.ui_settings;
CREATE POLICY "ui_settings_insert_org_admin"
  ON public.ui_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_org_ui_settings(auth.uid(), org_id));

DROP POLICY IF EXISTS "ui_settings_update_org_admin" ON public.ui_settings;
CREATE POLICY "ui_settings_update_org_admin"
  ON public.ui_settings
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_org_ui_settings(auth.uid(), org_id))
  WITH CHECK (public.can_edit_org_ui_settings(auth.uid(), org_id));

DROP POLICY IF EXISTS "ui_settings_delete_org_admin" ON public.ui_settings;
CREATE POLICY "ui_settings_delete_org_admin"
  ON public.ui_settings
  FOR DELETE
  TO authenticated
  USING (public.can_edit_org_ui_settings(auth.uid(), org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO service_role;

-- ── system_settings: לוודא שמדיניות כתיבה ל-authenticated קיימת (יישום העלאת JSON וכו׳) ──
-- אם כבר קיימת — DROP/CREATE יחליפו באותו אופן.
DROP POLICY IF EXISTS "authenticated can select system_settings" ON public.system_settings;
CREATE POLICY "authenticated can select system_settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated can upsert system_settings" ON public.system_settings;
CREATE POLICY "authenticated can upsert system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
