-- Optional fields from public submit (declared expiry / license number until OCR exists)
ALTER TABLE public.compliance_docs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
