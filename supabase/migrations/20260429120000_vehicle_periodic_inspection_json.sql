-- תבנית ביקורת תקופתית (שורות דינמיות) + תוצאת ביקורת אחרונה (סימונים וכו׳)
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS periodic_inspection_json jsonb;

COMMENT ON COLUMN public.vehicles.periodic_inspection_json IS 'ביקורת תקופתית: items (מפתח/תווית), last (תאריך, ק״מ, בוחן, marks)';
