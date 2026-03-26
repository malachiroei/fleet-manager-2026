-- Per-tire replacement dates + periodic inspection form URL
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tire_change_date_front_right date,
  ADD COLUMN IF NOT EXISTS tire_change_date_front_left  date,
  ADD COLUMN IF NOT EXISTS tire_change_date_rear_right  date,
  ADD COLUMN IF NOT EXISTS tire_change_date_rear_left   date,
  ADD COLUMN IF NOT EXISTS inspection_form_url          text;

COMMENT ON COLUMN public.vehicles.tire_change_date_front_right IS 'תאריך החלפת צמיג קדמי ימין';
COMMENT ON COLUMN public.vehicles.tire_change_date_front_left  IS 'תאריך החלפת צמיג קדמי שמאל';
COMMENT ON COLUMN public.vehicles.tire_change_date_rear_right  IS 'תאריך החלפת צמיג אחורי ימין';
COMMENT ON COLUMN public.vehicles.tire_change_date_rear_left   IS 'תאריך החלפת צמיג אחורי שמאל';
COMMENT ON COLUMN public.vehicles.inspection_form_url          IS 'קישור לטופס ביקורת תקופתית שהועלה';
