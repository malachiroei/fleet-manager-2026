-- ─────────────────────────────────────────────────────────────────────────────
-- org_documents — dynamic extra forms managed by the fleet admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  file_url            text,
  include_in_handover boolean NOT NULL DEFAULT false,
  is_standalone       boolean NOT NULL DEFAULT false,
  requires_signature  boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read org_documents"
  ON public.org_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write org_documents"
  ON public.org_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.org_documents IS 'מסמכים נוספים מוגדרים על ידי מנהל הצי';
COMMENT ON COLUMN public.org_documents.include_in_handover IS 'האם לכלול בתהליך האשף';
COMMENT ON COLUMN public.org_documents.is_standalone IS 'האם מסמך עצמאי עם קישור ייעודי לנהג';
COMMENT ON COLUMN public.org_documents.requires_signature IS 'האם הנהג חייב לחתום על מסמך זה';
