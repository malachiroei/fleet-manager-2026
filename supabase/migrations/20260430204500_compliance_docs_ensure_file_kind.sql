-- תיקון פרויקטים שבהם compliance_docs נוצרה בלי עמודת file_kind (פוסטגרסט/ schema cache PGRST204)
ALTER TABLE public.compliance_docs
  ADD COLUMN IF NOT EXISTS file_kind text DEFAULT 'signature',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.compliance_docs
SET file_kind = 'signature'
WHERE file_kind IS NULL OR btrim(file_kind) = '';

UPDATE public.compliance_docs
SET file_kind = 'signature'
WHERE file_kind NOT IN ('signature', 'license_photo');

ALTER TABLE public.compliance_docs
  ALTER COLUMN file_kind SET DEFAULT 'signature',
  ALTER COLUMN file_kind SET NOT NULL;

ALTER TABLE public.compliance_docs DROP CONSTRAINT IF EXISTS compliance_docs_file_kind_check;
ALTER TABLE public.compliance_docs
  ADD CONSTRAINT compliance_docs_file_kind_check
  CHECK (file_kind IN ('signature', 'license_photo'));
