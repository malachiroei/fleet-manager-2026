-- =============================================================================
-- Fix: "permission denied for table mileage_logs" בפרו
-- PostgREST משתמש ב-role authenticated; חייב GRANT על הטבלה (בנפרד מ-RLS).
-- מיגרציה קודמת השאירה GRANT רגיל בתוך בלוק DO — לא תמיד מתבצע; כאן GRANT ישיר.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_logs'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.mileage_logs TO authenticated';
    EXECUTE 'GRANT ALL ON public.mileage_logs TO service_role';
  END IF;
END $$;
