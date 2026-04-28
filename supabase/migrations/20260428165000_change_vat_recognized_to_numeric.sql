-- Convert VAT recognized field from boolean to numeric percentage/value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'vat_recognized'
  ) THEN
    ALTER TABLE public.vehicles
    ALTER COLUMN vat_recognized TYPE numeric
    USING (
      CASE
        WHEN vat_recognized IS NULL THEN NULL
        WHEN vat_recognized::text = 'true' THEN 1
        WHEN vat_recognized::text = 'false' THEN 0
        ELSE NULL
      END
    );
  END IF;
END $$;
