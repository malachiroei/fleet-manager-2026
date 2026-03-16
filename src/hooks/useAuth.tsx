import { useState, useEffect, useRef, createContext, useContext, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/fleet';
import { hasPermission as checkPermission, type PermissionKey } from '@/lib/permissions';

const ACTIVE_ORG_STORAGE_KEY = 'fleet-manager-active-org';

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

  const fetchUserRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (!error && data) {
      setRoles(data.map(r => r.role as AppRole));
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, phone, org_id, permissions, status, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
    } else {
      setProfile(null);
    }
  };

  const fetchMemberOrganizations = useCallback(async (userId: string, fallbackOrgId?: string | null) => {
    const { data: rows, error: memError } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId);
    let orgIds = memError || !rows?.length ? [] : rows.map((r: { org_id: string }) => r.org_id);
    if (orgIds.length === 0 && fallbackOrgId) {
      orgIds = [fallbackOrgId];
    }
    if (orgIds.length === 0) {
      setMemberOrganizations([]);
      return;
    }
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);
    if (orgError || !orgs?.length) {
      setMemberOrganizations([]);
      return;
    }
    setMemberOrganizations((orgs as { id: string; name: string }[]).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchUserRoles(session.user.id);
            fetchProfile(session.user.id);
            fetchMemberOrganizations(session.user.id);
          }, 0);
        } else {
          setRoles([]);
          setProfile(null);
          setMemberOrganizations([]);
          setActiveOrgIdState(null);
          activeOrgInitializedRef.current = false;
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchUserRoles(session.user.id);
        fetchProfile(session.user.id);
        fetchMemberOrganizations(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id]);

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
        .eq('user_id', user.id);
      if (updateError) return;
      await supabase.from('org_members').insert({ user_id: user.id, org_id: inv.org_id });
      setActiveOrgId(inv.org_id);
      await (supabase as any).from('org_invitations').delete().eq('id', inv.id);
      await fetchProfile(user.id);
      await fetchMemberOrganizations(user.id);
    })();
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) {
      inviteCheckDoneRef.current = false;
      activeOrgInitializedRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user || memberOrganizations.length === 0) return;
    if (activeOrgInitializedRef.current) return;
    activeOrgInitializedRef.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const validStored = stored && memberOrganizations.some((o) => o.id === stored);
    if (validStored) {
      setActiveOrgIdState(stored);
    } else {
      // Default to "personal" dashboard (no active org) when nothing was stored
      setActiveOrgIdState(null);
    }
  }, [user, memberOrganizations]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
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

    try {
      const userId = data.user?.id;
      const userEmail = (data.user?.email ?? email).toLowerCase();

      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            user_id: userId,
            full_name: fullName,
            email: userEmail,
            phone: null,
            org_id: null,
            permissions: {},
            status: 'pending_approval',
          });

        if (profileError) {
          console.error('Failed to create pending profile after signUp', profileError);
        }
      }
    } catch (e) {
      console.error('Unexpected error while creating profile after signUp', e);
    }

    return { error: null };
  };

  const signOut = async () => {
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
    (permission: PermissionKey) =>
      checkPermission(profile, permission, { isAdmin, isManager }),
    [profile, isAdmin, isManager]
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
