-- ─────────────────────────────────────────────────────────────────────────────
-- ui_customization — white-label overrides for button / menu labels
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ui_customization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text UNIQUE NOT NULL,
  default_label text NOT NULL,
  custom_label  text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ui_customization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read ui_customization"
  ON public.ui_customization FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write ui_customization"
  ON public.ui_customization FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default navigation labels (Hebrew)
INSERT INTO public.ui_customization (key, default_label) VALUES
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
ON CONFLICT (key) DO NOTHING;
