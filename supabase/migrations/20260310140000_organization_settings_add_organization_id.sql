-- Add organization_id FK to organization_settings (DB uses organization_id, not org_id)
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_organization_settings_organization_id
  ON public.organization_settings(organization_id);

COMMENT ON COLUMN public.organization_settings.organization_id IS 'FK to organizations; used to scope settings per org.';
