-- =============================================================================
-- create_vehicle_handover / מסירה: 42703 — column assignment_mode does not exist
-- מיגרציה 20260302093000 לא הורצה בפרו; ה-RPC מכניס ל-assignment_mode.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_handovers'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_handovers'
      AND column_name = 'assignment_mode'
  ) THEN
    ALTER TABLE public.vehicle_handovers
      ADD COLUMN assignment_mode text NOT NULL DEFAULT 'permanent'
      CHECK (assignment_mode IN ('permanent', 'replacement'));
  END IF;
END $$;

COMMENT ON COLUMN public.vehicle_handovers.assignment_mode IS
  'מסירה קבועה מול חליפי — נדרש ל-RPC create_vehicle_handover.';

NOTIFY pgrst, 'reload schema';
