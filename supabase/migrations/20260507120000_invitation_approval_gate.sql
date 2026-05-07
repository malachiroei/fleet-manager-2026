-- =====================================================================================
-- Unified invitation logic + admin approval gate
-- =====================================================================================
-- Adds two columns idempotently (safe to re-run):
--   1. public.profiles.is_approved BOOLEAN DEFAULT false
--      - false ⇒ user blocked from dashboard (gate enforced in app + RLS).
--      - true  ⇒ approved by responsible admin (platform owner OR org admin).
--   2. public.org_invitations.creates_new_org BOOLEAN DEFAULT false
--      - true  ⇒ invitation issued by platform super admin; signup should result in a
--                 brand-new organization (already created by `resolveOrgIdForTeamInvite`).
--      - false ⇒ invitee joins inviter's existing org_id.
--
-- Backfill: existing 'active' / 'suspended' rows are pre-approved (so we don't lock out
-- everyone the moment the column lands). 'pending_approval' rows stay false.
-- =====================================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS creates_new_org BOOLEAN NOT NULL DEFAULT false;

-- Backfill: anyone whose status was already 'active' is treated as approved.
-- We *do* approve 'suspended' rows because the suspension itself is the block
-- (we don't want a suspended user to be re-approved silently if status flips).
UPDATE public.profiles
   SET is_approved = true
 WHERE is_approved = false
   AND status IN ('active', 'suspended');

CREATE INDEX IF NOT EXISTS idx_profiles_is_approved ON public.profiles (is_approved);
CREATE INDEX IF NOT EXISTS idx_org_invitations_creates_new_org ON public.org_invitations (creates_new_org);

COMMENT ON COLUMN public.profiles.is_approved IS
  'Approval gate. False ⇒ user blocked from dashboard until the responsible admin (platform owner for new org admins, regular admin for team members) approves.';
COMMENT ON COLUMN public.org_invitations.creates_new_org IS
  'True when the invitation was issued by the platform super admin to create a new tenant organization for the invitee.';
