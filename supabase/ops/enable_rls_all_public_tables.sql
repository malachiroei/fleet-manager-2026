-- הרצה ידנית ב-SQL Editor (או אחרי יצירת טבלה חדשה בלי מיגרציה):
-- כל טבלאות public ללא RLS → ENABLE ROW LEVEL SECURITY

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname::text AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
      RAISE NOTICE 'RLS enabled: %', r.tbl;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'skip %: %', r.tbl, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
