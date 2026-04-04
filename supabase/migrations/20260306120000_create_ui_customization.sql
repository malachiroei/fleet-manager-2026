-- ─────────────────────────────────────────────────────────────────────────────
-- ui_customization — white-label overrides for button / menu labels
-- פרו: הטבלה כבר קיימת לפעמים במבנה org_id/config בלי עמודות key/default_label —
-- CREATE TABLE IF NOT EXISTS מדלג, ולכן מוסיפים עמודות + אינדקס לפני ה-INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ui_customization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text UNIQUE NOT NULL,
  default_label text NOT NULL,
  custom_label  text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ui_customization
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS default_label text,
  ADD COLUMN IF NOT EXISTS custom_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ui_customization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read ui_customization" ON public.ui_customization;
DROP POLICY IF EXISTS "authenticated write ui_customization" ON public.ui_customization;

CREATE POLICY "authenticated read ui_customization"
  ON public.ui_customization FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write ui_customization"
  ON public.ui_customization FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default navigation labels (Hebrew); idempotent without relying on ON CONFLICT
INSERT INTO public.ui_customization (key, default_label)
SELECT v.k, v.d
FROM (
  VALUES
    ('nav.home',              'בית'),
    ('nav.vehicles',          'רכבים'),
    ('nav.fleet_management',  'ניהול צי רכבים'),
    ('nav.vehicle_delivery',  'מסירת רכב'),
    ('nav.compliance',        'התראות חריגה'),
    ('nav.drivers',           'נהגים'),
    ('nav.mileage_update',    'עדכון קילומטראז'),
    ('nav.reports',           'הפקת דוחות'),
    ('nav.accidents',         'תאונות'),
    ('nav.parking',           'דוחות חניה'),
    ('nav.complaints',        'תלונות נוהל 6'),
    ('nav.accounting',        'הנהלת חשבונות'),
    ('nav.fuel',              'דלק'),
    ('nav.settings',          'הגדרות'),
    ('nav.org_settings',      'הגדרות ארגון'),
    ('entity.driver',         'נהג'),
    ('entity.drivers',        'נהגים'),
    ('entity.vehicle',        'רכב'),
    ('entity.vehicles',       'רכבים'),
    ('action.add_driver',     'הוסף נהג'),
    ('action.add_vehicle',    'הוסף רכב'),
    ('action.handover',       'מסירת רכב'),
    ('action.return',         'החזרת רכב')
) AS v(k, d)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_customization u WHERE u.key = v.k
);
