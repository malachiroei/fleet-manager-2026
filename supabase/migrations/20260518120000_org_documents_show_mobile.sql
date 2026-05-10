-- הצגת מספר נייד בפרטי חתימה ב-PDF (טפסים מובנים / אשף מסירה)
ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS show_mobile boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.org_documents.show_mobile IS 'הצגת מספר נייד בפרטי חתימה ב-PDF';
