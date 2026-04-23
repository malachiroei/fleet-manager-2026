-- =============================================================================
-- תיקון 403 Forbidden מ-PostgREST על rpc('submit_mileage_report'):
-- role authenticated חייב EXECUTE על הפונקציה. אחרי REVOKE FROM PUBLIC לפעמים
-- נשארים פרויקטים בלי GRANT אם הרצת SQL חלקית.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'submit_mileage_report'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, numeric, text'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.submit_mileage_report(uuid, numeric, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.submit_mileage_report(uuid, numeric, text) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
