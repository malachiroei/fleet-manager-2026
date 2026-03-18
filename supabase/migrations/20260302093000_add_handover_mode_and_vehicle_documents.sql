-- Add assignment mode for delivery handovers
ALTER TABLE public.vehicle_handovers
ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'permanent'
CHECK (assignment_mode IN ('permanent', 'replacement'));

-- Create vehicle documents table for archived handover forms
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    handover_id uuid REFERENCES public.vehicle_handovers(id) ON DELETE SET NULL,
    title text NOT NULL,
    file_url text NOT NULL,
    document_type text NOT NULL DEFAULT 'handover',
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage vehicle documents"
ON public.vehicle_documents
FOR ALL
USING (is_manager(auth.uid()));

CREATE POLICY "Authenticated users can view vehicle documents"
ON public.vehicle_documents
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Update assignment trigger logic:
-- delivery with replacement mode should NOT update assigned_driver_id
CREATE OR REPLACE FUNCTION public.handle_handover_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.handover_type = 'delivery' THEN
        IF COALESCE(NEW.assignment_mode, 'permanent') = 'permanent' THEN
            UPDATE public.vehicles
            SET assigned_driver_id = NEW.driver_id, updated_at = now()
            WHERE id = NEW.vehicle_id;

            UPDATE public.driver_vehicle_assignments
            SET unassigned_at = now()
            WHERE vehicle_id = NEW.vehicle_id AND unassigned_at IS NULL;

            INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes)
            VALUES (NEW.vehicle_id, NEW.driver_id, NEW.created_by, 'שיוך אוטומטי ממסירת רכב קבועה');
        ELSE
            INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes, unassigned_at)
            VALUES (NEW.vehicle_id, NEW.driver_id, NEW.created_by, 'מסירת רכב חליפי (ללא שיוך קבוע)', now());
        END IF;

    ELSIF NEW.handover_type = 'return' THEN
        UPDATE public.vehicles
        SET assigned_driver_id = NULL, updated_at = now()
        WHERE id = NEW.vehicle_id;

        UPDATE public.driver_vehicle_assignments
        SET unassigned_at = now()
        WHERE vehicle_id = NEW.vehicle_id AND driver_id = NEW.driver_id AND unassigned_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;
