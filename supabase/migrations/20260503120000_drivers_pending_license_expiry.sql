-- תאריך תוקף שהנהג הצהיר בטופס הציבורי לפני אישור מנהל (מנורמל YYYY-MM-DD)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS pending_license_expiry date;

COMMENT ON COLUMN public.drivers.pending_license_expiry IS
  'License expiry date declared by the driver on the public /update form; applied to license_expiry after manager approval.';
