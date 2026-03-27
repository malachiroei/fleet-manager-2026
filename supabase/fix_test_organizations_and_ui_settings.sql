-- =============================================================================
-- תיקון סכימת טסט: organizations + ui_settings — תואם OrgSettings / hooks
-- =============================================================================
-- להריץ ב-Supabase SQL Editor על פרויקט הטסט בלבד.
--
-- מה הסקריפט עושה:
-- 1. מוחק ui_settings ו-organization_settings (שמות/סכימה ישנים מול הקוד).
-- 2. מנקה org_members / org_invitations ואז מוחק organizations (CASCADE מסיר FKים).
-- 3. בונה מחדש organizations עם כל העמודות שהאפליקציה שולפת (כולל custom_labels, settings).
-- 4. בונה ui_settings עם אותן עמודות כמו ב-useOrgSettings (OrgSettings).
-- 5. מזריע ארגון ברירת מחדל + שורת ui_settings.
-- 6. מעדכן profiles.org_id, vehicles/drivers.org_id, וממלא org_members.
--
-- אזהרה: org_invitations ו-org_members מתרוקנים. יש להזמין מחדש במידת הצורך.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public.ui_settings CASCADE;
DROP TABLE IF EXISTS public.organization_settings CASCADE;

DELETE FROM public.org_members;
DELETE FROM public.org_invitations;

DROP TABLE IF EXISTS public.organizations CASCADE;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'ארגון ברירת מחדל',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  release_snapshot_ack_version text NOT NULL DEFAULT '0.0.0',
  custom_labels jsonb,
  settings jsonb
);

COMMENT ON COLUMN public.organizations.custom_labels IS 'תוויות UI (useUiLabels)';
COMMENT ON COLUMN public.organizations.settings IS 'מטא־דאטה; useUiLabels: settings.custom_labels';

CREATE TABLE public.ui_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_name text NOT NULL DEFAULT '',
  org_id_number text NOT NULL DEFAULT '',
  admin_email text NOT NULL DEFAULT '',
  health_statement_text text NOT NULL DEFAULT '',
  vehicle_policy_text text NOT NULL DEFAULT '',
  health_statement_pdf_url text,
  vehicle_policy_pdf_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_settings_org_id_unique UNIQUE (org_id)
);

CREATE INDEX ui_settings_org_id_idx ON public.ui_settings (org_id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_org_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE SET NULL;

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_org_id_fkey;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE CASCADE;

ALTER TABLE public.org_invitations DROP CONSTRAINT IF EXISTS org_invitations_org_id_fkey;
ALTER TABLE public.org_invitations
  ADD CONSTRAINT org_invitations_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_org_id_fkey;
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_org_id_fkey;
    ALTER TABLE public.drivers
      ADD CONSTRAINT drivers_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO public.organizations (id, name, email, release_snapshot_ack_version)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'ארגון ברירת מחדל',
  NULL,
  '0.0.0'
);

INSERT INTO public.ui_settings (
  org_id,
  org_name,
  org_id_number,
  admin_email,
  health_statement_text,
  vehicle_policy_text
) VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'ארגון ברירת מחדל',
  '',
  '',
  E'אינני סובל/ת ממחלת עצבים, אפילפסיה או מחלה העלולה לגרום לאובדן הכרה בזמן נהיגה.\nכושר הראייה שלי תקין (עם תיקון אופטי אם נדרש) ואני מחזיק/ה משקפי ראייה/עדשות בעת הצורך.\nכושר השמיעה שלי תקין ואינני סובל/ת מלקות שמיעה משמעותית.\nאינני נוטל/ת תרופות הגורמות לנמנום, ירידת ריכוז או פגיעה בכושר הנהיגה.\nמצב בריאותי הכללי מאפשר נהיגה בטוחה, ואני כשיר/ה פיזית לנהוג ברכב זה.\nאני מצהיר/ה כי כל הפרטים לעיל נכונים ומדויקים, ואני מודע/ת לאחריותי בנהיגה.',
  E'הרכב ישמש לצרכי עבודה בלבד, לנסיעות מוסמכות על-פי תפקיד המחזיק.\nחל איסור מוחלט על נהיגה תחת השפעת אלכוהול, סמים או תרופות המשפיעות על הנהיגה.\nחל איסור על נהיגה במצב עייפות. הנהג חייב להפסיק לנסוע ולנוח.\nהנהג חייב לציית לכל חוקי התנועה ולשמור על בטיחות הנסיעה בכל עת.'
);

UPDATE public.profiles
SET org_id = '00000000-0000-4000-8000-000000000001'::uuid
WHERE user_id IS NOT NULL;

INSERT INTO public.org_members (user_id, org_id)
SELECT p.user_id, '00000000-0000-4000-8000-000000000001'::uuid
FROM public.profiles p
WHERE p.user_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'org_id'
  ) THEN
    UPDATE public.vehicles SET org_id = '00000000-0000-4000-8000-000000000001'::uuid;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'org_id'
  ) THEN
    UPDATE public.drivers SET org_id = '00000000-0000-4000-8000-000000000001'::uuid;
  END IF;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read organizations" ON public.organizations;
CREATE POLICY "authenticated read organizations"
  ON public.organizations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated write organizations" ON public.organizations;
CREATE POLICY "authenticated write organizations"
  ON public.organizations FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated read ui_settings" ON public.ui_settings;
CREATE POLICY "authenticated read ui_settings"
  ON public.ui_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated write ui_settings" ON public.ui_settings;
CREATE POLICY "authenticated write ui_settings"
  ON public.ui_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO service_role;

COMMIT;

-- אחרי ההרצה: ב-Supabase → Project Settings → API — רענון סכימה (או המתן עד דקה).
