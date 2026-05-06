-- =============================================================================
-- כל טבלה ב-schema public חייבת Row Level Security (גם טבלאות עתידיות שלא נוספו
-- למיגרציה ייעודית). לולאה זו מאפשרת RLS על כל טבלת בסיס שעדיין ללא relrowsecurity.
-- לאחר מכן חובה להגדיר מדיניות SELECT/INSERT (מיגרציות נפרדות או Security Advisor).
-- =============================================================================

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
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'enable_rls_skip %: %', r.tbl, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
