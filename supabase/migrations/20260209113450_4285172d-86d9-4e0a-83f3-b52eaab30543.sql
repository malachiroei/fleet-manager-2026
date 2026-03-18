
-- Create trigger to auto-update vehicle assigned_driver_id on handover delivery
CREATE OR REPLACE FUNCTION public.handle_handover_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.handover_type = 'delivery' THEN
        -- Assign driver to vehicle
        UPDATE public.vehicles
        SET assigned_driver_id = NEW.driver_id, updated_at = now()
        WHERE id = NEW.vehicle_id;
        
        -- Close previous assignment for this vehicle (if any)
        UPDATE public.driver_vehicle_assignments
        SET unassigned_at = now()
        WHERE vehicle_id = NEW.vehicle_id AND unassigned_at IS NULL;
        
        -- Create new assignment record
        INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes)
        VALUES (NEW.vehicle_id, NEW.driver_id, NEW.created_by, 'שיוך אוטומטי ממסירת רכב');
        
    ELSIF NEW.handover_type = 'return' THEN
        -- Unassign driver from vehicle
        UPDATE public.vehicles
        SET assigned_driver_id = NULL, updated_at = now()
        WHERE id = NEW.vehicle_id;
        
        -- Close assignment record
        UPDATE public.driver_vehicle_assignments
        SET unassigned_at = now()
        WHERE vehicle_id = NEW.vehicle_id AND driver_id = NEW.driver_id AND unassigned_at IS NULL;
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_handover_created
AFTER INSERT ON public.vehicle_handovers
FOR EACH ROW
EXECUTE FUNCTION public.handle_handover_assignment();
