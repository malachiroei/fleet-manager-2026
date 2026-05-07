-- תקנה 585: public-compliance-submit משתמש ב־file_kind שלא היה ברשימה
ALTER TABLE public.compliance_docs DROP CONSTRAINT IF EXISTS compliance_docs_file_kind_check;

ALTER TABLE public.compliance_docs
  ADD CONSTRAINT compliance_docs_file_kind_check
  CHECK (file_kind IN ('signature', 'license_photo', 'regulation_585_scan'));

NOTIFY pgrst, 'reload schema';
