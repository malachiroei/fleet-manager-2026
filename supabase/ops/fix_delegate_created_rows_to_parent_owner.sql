-- Fix existing rows created by delegated users (e.g., Eric under Ravid) so that
-- manager-scoped visibility is consistent for peers/delegates under the same admin.

-- Vehicles: move managed_by_user_id from delegate to parent admin.
UPDATE public.vehicles v
SET managed_by_user_id = p.parent_admin_id
FROM public.profiles p
WHERE p.id = v.managed_by_user_id
  AND p.parent_admin_id IS NOT NULL
  AND p.parent_admin_id <> v.managed_by_user_id;

-- Drivers: same ownership normalization.
UPDATE public.drivers d
SET managed_by_user_id = p.parent_admin_id
FROM public.profiles p
WHERE p.id = d.managed_by_user_id
  AND p.parent_admin_id IS NOT NULL
  AND p.parent_admin_id <> d.managed_by_user_id;
