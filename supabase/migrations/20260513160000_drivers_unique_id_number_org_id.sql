-- Replace the single-column UNIQUE(id_number) with UNIQUE(id_number, org_id)
-- so different orgs can have drivers with the same id_number,
-- and upsert ON CONFLICT (id_number, org_id) works correctly.

-- Step 1: Remove duplicate (id_number, org_id) rows, keeping the most recently updated one.
DELETE FROM public.drivers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY id_number, org_id
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id ASC
           ) AS rn
    FROM public.drivers
  ) ranked
  WHERE rn > 1
);

-- Step 2: Drop old single-column unique constraint (name varies by env)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drivers'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 1
      AND conkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.drivers'::regclass AND attname = 'id_number'
      )
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.drivers DROP CONSTRAINT %I',
      (
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.drivers'::regclass
          AND contype = 'u'
          AND array_length(conkey, 1) = 1
          AND conkey[1] = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.drivers'::regclass AND attname = 'id_number'
          )
        LIMIT 1
      )
    );
  END IF;
END $$;

-- Step 3: Create the compound unique constraint
ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_id_number_org_id_key;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_id_number_org_id_key UNIQUE (id_number, org_id);

NOTIFY pgrst, 'reload schema';
