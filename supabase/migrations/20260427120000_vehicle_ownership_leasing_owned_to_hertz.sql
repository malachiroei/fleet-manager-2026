-- נרמול בעלות: leasing / owned -> הרץ (עברית)
UPDATE public.vehicles
SET ownership_type = 'הרץ'
WHERE ownership_type IS NOT NULL
  AND lower(trim(ownership_type)) IN ('leasing', 'owned');
