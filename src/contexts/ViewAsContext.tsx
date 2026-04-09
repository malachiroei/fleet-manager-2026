import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Profile } from '@/types/fleet';
import { RAVID_MANAGER_EMAIL } from '@/lib/fleetBootstrapEmails';
import { RAVID_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';

interface ViewAsContextValue {
  viewAsEmail: string | null;
  setViewAsEmail: (email: string | null) => void;
  /** Resolved profile for the impersonated email within the active org (when available). */
  viewAsProfile: Profile | null;
  viewAsLoading: boolean;
}

const ViewAsContext = createContext<ViewAsContextValue | undefined>(undefined);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [viewAsEmail, setViewAsEmail] = useState<string | null>(null);
  const { activeOrgId, isDriver, isAdmin, isManager } = useAuth();
  /** נהג/עובד בלי תפקיד מנהל — אסור להשאיר תצוגת-מנהל (View-As) פעילה */
  const isDriverOnlySession = Boolean(isDriver && !isManager && !isAdmin);
  const [viewAsProfile, setViewAsProfile] = useState<Profile | null>(null);
  const [viewAsLoading, setViewAsLoading] = useState(false);

  const normalizedEmail = useMemo(() => (viewAsEmail ?? '').trim().toLowerCase(), [viewAsEmail]);

  useEffect(() => {
    if (!isDriverOnlySession) return;
    if (!viewAsEmail?.trim()) return;
    setViewAsEmail(null);
  }, [isDriverOnlySession, viewAsEmail, setViewAsEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!normalizedEmail) {
        setViewAsProfile(null);
        setViewAsLoading(false);
        return;
      }

      setViewAsLoading(true);
      try {
        // First try active org (if present), then fallback to global email lookup.
        // This prevents "orange bar active but profile null" when org context is out of sync.
        let row: Profile | null = null;
        let error: { message: string } | null = null;

        if (activeOrgId) {
          const scoped = await supabase
            .from('profiles')
            .select('*')
            .eq('org_id', activeOrgId)
            .ilike('email', normalizedEmail)
            .maybeSingle();
          if (scoped.error) {
            error = { message: scoped.error.message };
          } else {
            row = (scoped.data as Profile | null) ?? null;
          }
        }

        if (!row) {
          const globalLookup = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', normalizedEmail)
            .limit(25);
          if (globalLookup.error) {
            error = { message: globalLookup.error.message };
          } else {
            const matches = (globalLookup.data ?? []) as Profile[];
            const exact = matches.filter(
              (p) => (p.email ?? '').trim().toLowerCase() === normalizedEmail
            );
            const pool = exact.length > 0 ? exact : matches;
            let preferred =
              (activeOrgId ? pool.find((p) => p.org_id === activeOrgId) : null) ??
              pool[0] ??
              null;
            if (
              normalizedEmail === RAVID_MANAGER_EMAIL &&
              pool.some((p) => p.org_id === RAVID_FLEET_ORG_ID)
            ) {
              preferred = pool.find((p) => p.org_id === RAVID_FLEET_ORG_ID) ?? preferred;
            }
            row = preferred;
          }
        }
        if (cancelled) return;
        if (error) {
          console.warn('[ViewAs] failed to resolve profile', { message: error.message });
          setViewAsProfile(null);
          return;
        }
        if (!row) {
          console.warn('[ViewAs] no profile found for email', {
            email: normalizedEmail,
            activeOrgId,
          });
          setViewAsProfile(null);
          return;
        }
        const resolvedProfile: Profile = {
          ...row,
          user_id: row.user_id ?? row.id,
        };
        setViewAsProfile(resolvedProfile);
      } finally {
        if (!cancelled) setViewAsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedEmail, activeOrgId]);

  const contextValue = useMemo(
    () => ({ viewAsEmail, setViewAsEmail, viewAsProfile, viewAsLoading }),
    [viewAsEmail, setViewAsEmail, viewAsProfile, viewAsLoading],
  );

  return (
    <ViewAsContext.Provider value={contextValue}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return ctx;
}

