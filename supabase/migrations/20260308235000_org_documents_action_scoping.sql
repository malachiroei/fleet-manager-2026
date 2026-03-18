-- Scope org_documents by handover action (delivery/return)

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS include_in_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_in_return boolean NOT NULL DEFAULT false;

-- Backfill sensible defaults for existing rows
UPDATE public.org_documents
SET include_in_delivery = include_in_handover
WHERE include_in_handover = true
  AND include_in_delivery = false;

UPDATE public.org_documents
SET include_in_return = true,
    include_in_handover = true
WHERE (
  title ILIKE '%החזרת רכב%'
  OR title ILIKE '%החזרה%'
  OR description ILIKE '%החזרה%'
)
AND include_in_return = false;
