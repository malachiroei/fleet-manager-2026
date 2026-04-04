-- ─────────────────────────────────────────────────────────────────────────────
-- Add is_visible and group_name to ui_customization
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ui_customization
  ADD COLUMN IF NOT EXISTS is_visible  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS group_name  text    NOT NULL DEFAULT '';

-- Assign groups to existing rows
UPDATE public.ui_customization SET group_name = 'ניווט ראשי'    WHERE key = 'nav.home';
UPDATE public.ui_customization SET group_name = 'רכבים'          WHERE key IN ('nav.vehicles','nav.fleet_management', 'nav.vehicle_delivery', 'nav.compliance');
UPDATE public.ui_customization SET group_name = 'תפעולי'         WHERE key IN ('nav.drivers', 'nav.mileage_update', 'nav.reports');
UPDATE public.ui_customization SET group_name = 'אירועים'        WHERE key IN ('nav.accidents', 'nav.parking', 'nav.complaints');
UPDATE public.ui_customization SET group_name = 'כספים'          WHERE key IN ('nav.accounting', 'nav.fuel');
UPDATE public.ui_customization SET group_name = 'הגדרות'         WHERE key IN ('nav.settings', 'nav.org_settings');
UPDATE public.ui_customization SET group_name = 'שמות ישויות'   WHERE key LIKE 'entity.%';
UPDATE public.ui_customization SET group_name = 'כפתורי פעולה'  WHERE key LIKE 'action.%';

-- Ensure nav.home exists (may have been missing from original seed)
INSERT INTO public.ui_customization (key, default_label, group_name) VALUES
  ('nav.home', 'בית', 'ניווט ראשי')
ON CONFLICT (key) DO UPDATE SET group_name = EXCLUDED.group_name;

-- Ensure all other rows have a fallback group
UPDATE public.ui_customization SET group_name = 'כללי' WHERE group_name = '';
