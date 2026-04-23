import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Profile } from '@/types/fleet';
import { RAVID_MANAGER_EMAIL, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import { RAVID_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';
import { invalidateFleetScopedQueries } from '@/lib/invalidateFleetQueryScope';
import { setViewAsActiveSession } from '@/lib/viewAsSessionBridge';

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
  const { activeOrgId, profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [viewAsProfile, setViewAsProfile] = useState<Profile | null>(null);
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const viewAsEmailInitRef = useRef(false);
  const prevNormalizedViewAsRef = useRef<string | null>(null);

  const normalizedEmail = useMemo(() => (viewAsEmail ?? '').trim().toLowerCase(), [viewAsEmail]);

  /** מאפשר ל־useAuth לדלג על כפיית org לפי חברות המנהל בזמן תצוגה כמשתמש אחר. */
  useEffect(() => {
    setViewAsActiveSession(Boolean((viewAsEmail ?? '').trim()));
  }, [viewAsEmail]);

  /**
   * מעבר View-As — רענון ממוקד (לא `clear()`): `clear` גרם לכל ה-hooks לשלוף בבת אחת
   * ול־ERR_INSUFFICIENT_RESOURCES / ריצוד כש־activeOrgId התנגש עם אפקט «ארגון יחיד» ב-useAuth.
   */
  useEffect(() => {
    const next = normalizedEmail || null;
    if (!viewAsEmailInitRef.current) {
      viewAsEmailInitRef.current = true;
      prevNormalizedViewAsRef.current = next;
      return;
    }
    if (prevNormalizedViewAsRef.current === next) return;
    prevNormalizedViewAsRef.current = next;
    invalidateFleetScopedQueries(queryClient);
  }, [normalizedEmail, queryClient]);

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
        const viewerNorm = resolveSessionEmail(profile, user);
        const orgTryOrder: string[] = [];
        if (viewerNorm === RAVID_MANAGER_EMAIL) {
          orgTryOrder.push(RAVID_FLEET_ORG_ID);
        }
        if (activeOrgId && !orgTryOrder.includes(activeOrgId)) {
          orgTryOrder.push(activeOrgId);
        }

        let row: Profile | null = null;
        let error: { message: string } | null = null;

        for (const oid of orgTryOrder) {
          const scoped = await supabase
            .from('profiles')
            .select('*')
            .eq('org_id', oid)
            .ilike('email', normalizedEmail)
            .maybeSingle();
          if (scoped.error) {
            error = { message: scoped.error.message };
          } else if (scoped.data) {
            row = scoped.data as Profile;
            error = null;
            break;
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
  }, [normalizedEmail, activeOrgId, profile?.email, user?.email]);

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

