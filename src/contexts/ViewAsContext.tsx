import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Profile } from '@/types/fleet';

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
  const { activeOrgId } = useAuth();
  const [viewAsProfile, setViewAsProfile] = useState<Profile | null>(null);
  const [viewAsLoading, setViewAsLoading] = useState(false);

  const normalizedEmail = useMemo(() => (viewAsEmail ?? '').trim().toLowerCase(), [viewAsEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!normalizedEmail || !activeOrgId) {
        setViewAsProfile(null);
        setViewAsLoading(false);
        return;
      }

      setViewAsLoading(true);
      try {
        // IMPORTANT: keep org silo — only resolve a profile within the active org
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, org_id, permissions, status, is_system_admin, created_at, updated_at')
          .eq('org_id', activeOrgId)
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn('[ViewAs] failed to resolve profile', { message: error.message });
          setViewAsProfile(null);
          return;
        }
        setViewAsProfile((data as Profile | null) ?? null);
      } finally {
        if (!cancelled) setViewAsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedEmail, activeOrgId]);

  return (
    <ViewAsContext.Provider value={{ viewAsEmail, setViewAsEmail, viewAsProfile, viewAsLoading }}>
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

