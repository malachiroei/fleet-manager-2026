-- =============================================================================
-- Production fix: דיווח קילומטראז' — העלאת תמונה ל-mileage-reports נכשלת עם
-- "new row violates row-level security policy" כשחסרות מדיניות Storage או bucket.
-- בנוסף: mileage_logs — לאפשר INSERT גם לנהג משויך לרכב (assigned_driver_id)
-- גם כש־user_belongs_to_org לא מחזיר true (למשל אחרי סנכרון / פרופיל).
-- =============================================================================

-- ── Bucket ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('mileage-reports', 'mileage-reports', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ── Storage: mileage-reports policies (idempotent) ──────────────────────────
DROP POLICY IF EXISTS "mileage_reports_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "mileage_reports_select_public_bucket" ON storage.objects;
DROP POLICY IF EXISTS "mileage_reports_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "mileage_reports_update_authenticated" ON storage.objects;

-- קריאה: bucket ציבורי — גם anon (תצוגת תמונה ב-public URL)
CREATE POLICY "mileage_reports_select_public_bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mileage-reports');

-- העלאה / עדכון (כולל upsert): משתמש מחובר
CREATE POLICY "mileage_reports_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mileage-reports');

CREATE POLICY "mileage_reports_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mileage-reports' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'mileage-reports' AND auth.uid() IS NOT NULL);

-- ── mileage_logs: org או נהג משויך לרכב ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_logs'
  ) THEN
    ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "mileage_logs_insert_authenticated" ON public.mileage_logs;
    DROP POLICY IF EXISTS "mileage_logs_select_authenticated" ON public.mileage_logs;

    CREATE POLICY "mileage_logs_insert_authenticated"
      ON public.mileage_logs FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = mileage_logs.vehicle_id
            AND (
              v.org_id IS NULL
              OR public.user_belongs_to_org(auth.uid(), v.org_id)
              OR EXISTS (
                SELECT 1
                FROM public.drivers d
                WHERE d.id = v.assigned_driver_id
                  AND d.user_id = auth.uid()
              )
            )
        )
      );

    CREATE POLICY "mileage_logs_select_authenticated"
      ON public.mileage_logs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = mileage_logs.vehicle_id
            AND (
              v.org_id IS NULL
              OR public.user_belongs_to_org(auth.uid(), v.org_id)
              OR EXISTS (
                SELECT 1
                FROM public.drivers d
                WHERE d.id = v.assigned_driver_id
                  AND d.user_id = auth.uid()
              )
            )
        )
      );

    GRANT SELECT, INSERT ON public.mileage_logs TO authenticated;
  END IF;
END $$;
