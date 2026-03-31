import { useState, useEffect, useRef, createContext, useContext, useCallback, ReactNode } from 'react';
import { User, Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/fleet';
import { hasPermission as checkPermission, type PermissionKey } from '@/lib/permissions';
import { clearFleetProUpdateModalSuppressFlag } from '@/lib/pwaUpdateModalBridge';

const ACTIVE_ORG_STORAGE_KEY = 'fleet-manager-active-org';

/**
 * Personal profile row: `profiles.id` = Supabase Auth `user.id` (auth.users.id).
 * Use `select('*')` — do NOT list `user_id` (many DBs have no such column; it caused PostgREST errors).
 * Global UI flags live in `version_manifest` (see useFleetManifestUiGates); personal overrides in this row.
 */
const PROFILE_SELECT_STAR = '*';

function buildPersonalProfilePlaceholder(userId: string, email: string | null, status: string): Profile {
  const now = new Date().toISOString();
  return {
    id: userId,
    user_id: userId,
    full_name: '',
    email,
    phone: null,
    org_id: null,
    permissions: null,
    status,
    created_at: now,
    updated_at: now,
    allowed_features: null,
    denied_features: null,
    ui_denied_features_anchor_version: null,
    parent_admin_id: null,
  };
}

export interface MemberOrganization {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  isManager: boolean;
  isDriver: boolean;
  /** All organizations the user is a member of (from org_members). */
  memberOrganizations: MemberOrganization[];
  /** Currently active org for dashboard data (selected switcher or profile.org_id). */
  activeOrgId: string | null;
  setActiveOrgId: (orgId: string | null) => void;
  hasPermission: (permission: PermissionKey) => boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [memberOrganizations, setMemberOrganizations] = useState<MemberOrganization[]>([]);
  const [_activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const inviteCheckDoneRef = useRef(false);
  const activeOrgInitializedRef = useRef(false);
  const profileRef = useRef<Profile | null>(null);

  const setActiveOrgId = useCallback((orgId: string | null) => {
    setActiveOrgIdState(orgId);
    if (orgId != null) {
      try {
        localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const activeOrgId = _activeOrgId ?? null;

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const channel = supabase
      .channel(`profile-hard-sync-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        () => {
          clearFleetProUpdateModalSuppressFlag();
          void fetchProfileRef.current(uid);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchUserRoles = useCallback(async (userId: string) => {
    // Roles are defined globally in `user_roles`.
    const { data, error } = await (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.warn('[Auth] user_roles fetch failed', { message: error.message });
      setRoles([]);
      return;
    }

    if (data) {
      setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
    } else {
      setRoles([]);
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const applyPersonalRow = (row: Profile) => {
      const raw = row as Profile & { organization_id?: string | null };
      const orgIdFromDb = row.org_id ?? raw.organization_id ?? null;
      const next: Profile = {
        ...row,
        org_id: orgIdFromDb,
        /** App-level mirror of auth uid — never read from missing DB column */
        user_id: userId,
        status: row.status && String(row.status).trim() ? row.status : 'active',
        allowed_features: row.allowed_features ?? null,
        denied_features: row.denied_features ?? null,
        ui_denied_features_anchor_version: row.ui_denied_features_anchor_version ?? null,
      };
      setProfile(next);
      // eslint-disable-next-line no-console
      console.log('[Auth] personal profile snapshot (profiles.id = auth uid)', {
        id: next.id,
        status: next.status,
        email: next.email,
        org_id: next.org_id,
        allowed_features: next.allowed_features ?? null,
        denied_features: next.denied_features ?? null,
      });
    };

    let res:
      | {
          data: Profile | null;
          error: { message?: string; code?: string } | null;
        }
      | null = null;
    try {
      const queryRes = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_STAR)
        .eq('id', userId)
        .single();
      res = {
        data: (queryRes?.data as Profile | null) ?? null,
        error: (queryRes?.error as { message?: string; code?: string } | null) ?? null,
      };
    } catch (e) {
      const err = e as { message?: string; code?: string } | null;
      res = {
        data: null,
        error: {
          message: err?.message ?? 'Unexpected profile fetch failure',
          code: err?.code,
        },
      };
    }

    if (!res?.error && res?.data) {
      applyPersonalRow(res.data as Profile);
      return;
    }

    const err = res?.error;
    const msg = err?.message ?? '';
    const code = err?.code ?? '';
    const noRow =
      code === 'PGRST116' || /no rows|0 rows/i.test(msg) || /multiple rows/i.test(msg);

    if (noRow) {
      const { data: authData } = await supabase.auth.getUser();
      const email =
        authData?.user?.id === userId ? (authData.user.email ?? null) : null;
      console.warn('[Auth] no profiles row for auth uid — using placeholder until row exists', { userId });
      applyPersonalRow(buildPersonalProfilePlaceholder(userId, email, 'no_profile_row'));
      return;
    }

    console.error('[Auth] fetchProfile failed', { message: msg, code });
    const prev = profileRef.current;
    if (prev?.id === userId) {
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    const email =
      authData?.user?.id === userId ? (authData.user.email ?? null) : null;
    applyPersonalRow(buildPersonalProfilePlaceholder(userId, email, 'profile_fetch_error'));
  }, []);

  const fetchProfileRef = useRef(fetchProfile);
  fetchProfileRef.current = fetchProfile;

  const fetchMemberOrganizations = useCallback(async (userId: string, fallbackOrgId?: string | null) => {
    let rows: Array<{ org_id: string }> | null = null;
    let memError: { message?: string } | null = null;
    try {
      const res = await (supabase as any)
        .from('org_members')
        .select('org_id')
        .eq('user_id', userId);
      rows = (res?.data as Array<{ org_id: string }> | null) ?? null;
      memError = (res?.error as { message?: string } | null) ?? null;
    } catch (e) {
      memError = e as { message?: string } | null;
    }
    let orgIds = memError || !rows?.length ? [] : rows.map((r: { org_id: string }) => r.org_id);
    if (orgIds.length === 0 && fallbackOrgId) {
      orgIds = [fallbackOrgId];
    }
    if (orgIds.length === 0) {
      setMemberOrganizations([]);
      return;
    }
    let orgs: Array<{ id: string; name: string }> | null = null;
    let orgError: { message?: string } | null = null;
    try {
      const orgRes = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      orgs = (orgRes?.data as Array<{ id: string; name: string }> | null) ?? null;
      orgError = (orgRes?.error as { message?: string } | null) ?? null;
    } catch (e) {
      orgError = e as { message?: string } | null;
    }
    if (orgError || !orgs?.length) {
      setMemberOrganizations([]);
      return;
    }
    setMemberOrganizations((orgs as { id: string; name: string }[]).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (!session?.user) {
          setRoles([]);
          setProfile(null);
          setMemberOrganizations([]);
          setActiveOrgIdState(null);
          activeOrgInitializedRef.current = false;
          setLoading(false);
          return;
        }

        // Token refresh often fires when the app returns from the camera / file picker.
        // Toggling global `loading` here unmounts `ProtectedRoute` content and wipes in-memory form state.
        if (event === 'TOKEN_REFRESHED') {
          return;
        }

        // User metadata updates: refresh in the background without the full-screen auth gate.
        if (event === 'USER_UPDATED') {
          void (async () => {
            await Promise.allSettled([
              fetchUserRoles(session.user.id),
              fetchProfileRef.current(session.user.id),
              fetchMemberOrganizations(session.user.id),
            ]);
          })();
          return;
        }

        setLoading(true);
        setTimeout(() => {
          void (async () => {
            await Promise.allSettled([
              fetchUserRoles(session.user.id),
              fetchProfileRef.current(session.user.id),
              fetchMemberOrganizations(session.user.id),
            ]);
            setLoading(false);
          })();
        }, 0);
      }
    );

    void (async () => {
      try {
        const sessionRes = await supabase.auth.getSession();
        const session = sessionRes?.data?.session ?? null;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await Promise.allSettled([
            fetchUserRoles(session.user.id),
            fetchProfileRef.current(session.user.id),
            fetchMemberOrganizations(session.user.id),
          ]);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => subscription.unsubscribe();
  }, [fetchUserRoles, fetchMemberOrganizations]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    if (!user?.email || inviteCheckDoneRef.current) return;
    inviteCheckDoneRef.current = true;
    (async () => {
      const email = user.email?.trim().toLowerCase();
      if (!email) return;
      const { data: invitations, error: listError } = await (supabase as any)
        .from('org_invitations')
        .select('id, org_id, permissions')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);
      if (listError || !invitations?.length) return;
      const inv = invitations[0] as { id: string; org_id: string; permissions: unknown };
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          org_id: inv.org_id,
          permissions: inv.permissions ?? {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (updateError) return;
      await (supabase as any).from('org_members').insert({ user_id: user.id, org_id: inv.org_id });
      setActiveOrgId(inv.org_id);
      await (supabase as any).from('org_invitations').delete().eq('id', inv.id);
      await fetchProfileRef.current(user.id);
      await fetchMemberOrganizations(user.id);
    })();
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) {
      inviteCheckDoneRef.current = false;
      activeOrgInitializedRef.current = false;
    }
  }, [user]);

  /**
   * אם org_members ריק (RLS / לא מולא אחרי תיקון DB) אבל profiles.org_id קיים — משכפלים את רשימת
   * הארגונים עם fallback, כדי ש-activeOrgId יוכל להיאתחל מ-memberOrganizations או מ-profile.
   */
  useEffect(() => {
    if (!user?.id) return;
    const pid = profile?.org_id?.trim() || null;
    if (!pid) return;
    if (memberOrganizations.length > 0) return;
    void fetchMemberOrganizations(user.id, pid);
  }, [user?.id, profile?.org_id, memberOrganizations.length, fetchMemberOrganizations]);

  useEffect(() => {
    if (!user) return;
    if (profile === null) return;
    if (activeOrgInitializedRef.current) return;
    const profileOrgId = profile.org_id?.trim() || null;
    if (memberOrganizations.length === 0 && !profileOrgId) return;

    activeOrgInitializedRef.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const orgKnown = (id: string | null | undefined) =>
      Boolean(id) && memberOrganizations.some((o) => o.id === id);
    const validStored =
      stored && (orgKnown(stored) || stored === profileOrgId);
    if (validStored) {
      setActiveOrgIdState(stored);
      return;
    }
    if (profileOrgId) {
      setActiveOrgIdState(profileOrgId);
      return;
    }
    if (memberOrganizations.length > 0) {
      setActiveOrgIdState(memberOrganizations[0]?.id ?? null);
    }
  }, [user, profile, memberOrganizations, profile?.org_id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { full_name: fullName },
        },
      });

      if (error) {
        return { error };
      }

      const userId = data.user?.id;
      const userEmail = (data.user?.email ?? email).toLowerCase();

      if (userId) {
        const now = new Date().toISOString();
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            full_name: fullName,
            email: userEmail,
            status: 'pending_approval',
            created_at: now,
            updated_at: now,
          });

        if (profileError) {
          console.error('Failed to create pending profile after signUp', profileError);
        }
      }

      return { error: null };
    } catch (e) {
      const details = e instanceof Error ? e.message : String(e);
      const wrappedError = new Error(`SignUp API failed: ${details}`);
      console.error('Unexpected SignUp API error', e);
      return { error: wrappedError };
    }
  };

  const signOut = async () => {
    try {
      sessionStorage.removeItem('fleet-version-heartbeat');
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    setRoles([]);
    setProfile(null);
    setMemberOrganizations([]);
    setActiveOrgIdState(null);
    activeOrgInitializedRef.current = false;
  };

  const roleLower = (r: string) => String(r).toLowerCase();
  const isAdmin = roles.some((r) => roleLower(r) === 'admin');
  const isManager = roles.some((r) => roleLower(r) === 'admin' || roleLower(r) === 'fleet_manager');
  const isDriver = roles.some((r) => {
    const lower = roleLower(r);
    return lower === 'driver' || lower === 'employee' || lower === 'viewer';
  });

  const hasPermission = useCallback(
    (permission: PermissionKey) => {
      // Primary: use profile permissions (may be partially populated).
      const allowed = checkPermission(profile, permission, { isAdmin, isManager });
      if (allowed) return true;

      // Fallback for common driver scenario: allow "handover" when role is driver/viewer/employee
      // but the profile.permissions JSON doesn't include the key.
      if (!isAdmin && !isManager && permission === 'handover') {
        const roleLowerSet = roles.map((r) => roleLower(r));
        if (roleLowerSet.some((r) => r === 'driver' || r === 'employee' || r === 'viewer')) return true;
      }

      return false;
    },
    [profile, isAdmin, isManager, roles]
  );

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      roles,
      isAdmin,
      isManager,
      isDriver,
      memberOrganizations,
      activeOrgId,
      setActiveOrgId,
      hasPermission,
      refreshProfile,
      signIn,
      signUp,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

