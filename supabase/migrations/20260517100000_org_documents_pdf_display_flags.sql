-- עמודות בחירה: מה להציג בכותרת ובסוף PDF מובנה לכל טופס ב-org_documents
ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS show_date boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_time boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_driver_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_license_plate boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_employee_id boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_id_number boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_signature_block boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.org_documents.show_date IS 'הצגת תאריך הדפסה בכותרת PDF';
COMMENT ON COLUMN public.org_documents.show_time IS 'הצגת שעת הדפסה בכותרת PDF';
COMMENT ON COLUMN public.org_documents.show_driver_name IS 'הצגת שם נהג/עובד בכותרת PDF';
COMMENT ON COLUMN public.org_documents.show_license_plate IS 'הצגת מספר רישוי בכותרת PDF';
COMMENT ON COLUMN public.org_documents.show_employee_id IS 'הצגת מספר עובד בכותרת PDF';
COMMENT ON COLUMN public.org_documents.show_id_number IS 'הצגת מספר ת.ז בכותרת PDF';
COMMENT ON COLUMN public.org_documents.show_signature_block IS 'הצגת בלוק תחתית חתימה ב-PDF';
