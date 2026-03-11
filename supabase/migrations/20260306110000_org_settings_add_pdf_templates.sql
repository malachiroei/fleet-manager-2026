-- Add PDF template URL columns to organization_settings
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS health_statement_pdf_url  text,
  ADD COLUMN IF NOT EXISTS vehicle_policy_pdf_url   text;

COMMENT ON COLUMN public.organization_settings.health_statement_pdf_url IS 'URL לקובץ PDF תבנית להצהרת בריאות';
COMMENT ON COLUMN public.organization_settings.vehicle_policy_pdf_url   IS 'URL לקובץ PDF תבנית לנוהל שימוש ברכב';
