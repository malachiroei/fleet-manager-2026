-- Optional display name for org forms (app uses COALESCE(name, title))
ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.org_documents.name IS 'שם תצוגה לטפסים; אם NULL — משתמשים ב-title';
