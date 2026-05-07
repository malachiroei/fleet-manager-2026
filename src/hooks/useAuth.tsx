import { useState, useEffect, useRef, createContext, useContext, useCallback, ReactNode } from 'react';
import { User, Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/fleet';
import { hasPermission as checkPermission, type PermissionKey } from '@/lib/permissions';
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';
import { isLikelyUuid } from '@/lib/fleetUuid';
import { toast } from 'sonner';
import { clearFleetProUpdateModalSuppressFlag } from '@/lib/pwaUpdateModalBridge';
import { readViewAsActiveFromSession, setViewAsActiveSession } from '@/lib/viewAsSessionBridge';
import { isFleetManagerProHostname } from '@/lib/versionManifest';
import { resolveLockedFleetOrgIdForStaff } from '@/lib/resolveFleetScopeOrg';
import {
  isTransientAuthStorageOrAbortError,
  sleep,
  stableAuthGetSession,
  stableAuthGetUser,
  withAuthLockRetries,
} from '@/lib/authBootstrapRetry';

const ACTIVE_ORG_STORAGE_KEY = 'fleet-manager-active-org';

/** למניעת עדכוני state מתוך הרצת bootstrap ישנה (Strict Mode). */
let authBootstrapEpoch = 0;

function resolveSignUpEmailRedirectUrl(): string {
  if (typeof window === 'undefined') return 'https://fleet-manager-pro.com/auth';
  if (isFleetManagerProHostname()) return 'https://fleet-manager-pro.com/auth';
  return `${window.location.origin}/auth`;
}

/** ארגון ראשי מהפרופיל בלבד — מנהלי צי נעולים ל־`profiles.org_id`; רק בעל הפלטפורמה מחליף ארגון ב־UI. */
function resolveProfileOrgIdForActiveSession(profile: Profile | null): string | null {
  return profile?.org_id?.trim() || null;
}

/** מונע טעינת פרופיל כפולה ב־React Strict Mode (אפקט ×2) לאותו משתמש. */
let authBootstrapLastUserId: string | null = null;
/** מונע לולאת התנתקות כפולה כש־profiles.status = suspended. */
let suspendedSignOutHandledForUserId: string | null = null;

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

  const fetchUserRoles = useCallback(async (userId: string) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await (supabase as any)
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (!error) {
        if (data) {
          setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
        } else {
          setRoles([]);
        }
        return;
      }
      const retryable =
        isTransientAuthStorageOrAbortError(error) || /lock broken|abort/i.test(String(error.message ?? ''));
      if (!retryable || attempt === 4) {
        console.warn('[Auth] user_roles fetch failed', { message: (error as { message?: string }).message });
        setRoles([]);
        return;
      }
      await sleep(50 * (attempt + 1) * (attempt + 1));
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
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Auth] personal profile snapshot (profiles.id = auth uid)', {
          id: next.id,
          status: next.status,
          email: next.email,
          org_id: next.org_id,
          allowed_features: next.allowed_features ?? null,
          denied_features: next.denied_features ?? null,
        });
      }
    };

    let res:
      | {
          data: Profile | null;
          error: { message?: string; code?: string } | null;
        }
      | null = null;
    try {
      const queryRes = await withAuthLockRetries(async () => {
        const qr = await supabase
          .from('profiles')
          .select(PROFILE_SELECT_STAR)
          .eq('id', userId)
          .single();
        const e = qr.error as { message?: string; code?: string } | null | undefined;
        if (e != null && isTransientAuthStorageOrAbortError(e)) {
          throw new Error(String(e.message ?? 'profiles transient'));
        }
        return qr;
      }, 5);
      res = {
        data: (queryRes?.data as Profile | null) ?? null,
        error: (queryRes?.error as { message?: string; code?: string } | null) ?? null,
      };
    } catch (e) {
      const msg = String((e as Error)?.message ?? e ?? '');
      if (isTransientAuthStorageOrAbortError(e) || /lock broken|abort/i.test(msg)) {
        const authData = await stableAuthGetUser(supabase);
        const email =
          authData?.data?.user?.id === userId ? (authData.data.user.email ?? null) : null;
        applyPersonalRow(buildPersonalProfilePlaceholder(userId, email, 'profile_fetch_error'));
        return;
      }
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
      const row = res.data as Profile;
      if (String(row.id ?? '').trim() !== userId) {
        console.error('[Auth] profiles.id mismatches auth uid — refusing row', {
          authUid: userId,
          rowId: row.id,
        });
        const { data: authData } = await stableAuthGetUser(supabase);
        const email =
          authData?.user?.id === userId ? (authData.user.email ?? null) : null;
        applyPersonalRow(buildPersonalProfilePlaceholder(userId, email, 'profile_identity_mismatch'));
        return;
      }
      applyPersonalRow(row);
      return;
    }

    const err = res?.error;
    const msg = err?.message ?? '';
    const code = err?.code ?? '';
    const noRow =
      code === 'PGRST116' || /no rows|0 rows/i.test(msg) || /multiple rows/i.test(msg);

    if (noRow) {
      const { data: authData } = await stableAuthGetUser(supabase);
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
    const { data: authData } = await stableAuthGetUser(supabase);
    const email =
      authData?.user?.id === userId ? (authData.user.email ?? null) : null;
    applyPersonalRow(buildPersonalProfilePlaceholder(userId, email, 'profile_fetch_error'));
  }, []);

  const fetchProfileRef = useRef(fetchProfile);
  fetchProfileRef.current = fetchProfile;

  const fetchMemberOrganizations = useCallback(async (userId: string, fallbackOrgId?: string | null) => {
    const { data: authSelf } = await stableAuthGetUser(supabase);
    if (authSelf?.user?.id === userId && isPlatformSuperOwnerEmail(resolveSessionEmail(null, authSelf.user))) {
      const catalog = (await withAuthLockRetries(
        () => (supabase as any).from('organizations').select('id, name').order('name'),
        4,
      )) as { data: unknown; error: { message?: string } | null };
      const catRows = (catalog?.data as Array<{ id: string; name: string }> | null) ?? null;
      if (!catalog.error && catRows && catRows.length > 0) {
        setMemberOrganizations(
          catRows.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
        );
        return;
      }
    }

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
    let orgIds =
      memError || !rows?.length
        ? []
        : rows.map((r: { org_id: string }) => r.org_id).filter((id) => isLikelyUuid(id));
    if (orgIds.length === 0 && fallbackOrgId && isLikelyUuid(fallbackOrgId)) {
      orgIds = [fallbackOrgId];
    }
    if (orgIds.length === 0) {
      setMemberOrganizations([]);
      return;
    }
    let orgs: Array<{ id: string; name: string }> | null = null;
    let orgError: { message?: string } | null = null;
    try {
      const orgRes = await (supabase as any)
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

  const fetchMemberOrganizationsRef = useRef(fetchMemberOrganizations);
  fetchMemberOrganizationsRef.current = fetchMemberOrganizations;

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
          void (async () => {
            await fetchProfileRef.current(uid);
            await fetchMemberOrganizationsRef.current(uid);
          })();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (!session?.user) {
          authBootstrapLastUserId = null;
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

        // כבר רץ יחד עם getSession() — כפילות יוצרת שליפות כפולות, 400 מיותרים וקפיצות בפריסה
        if (event === 'INITIAL_SESSION') {
          return;
        }

        // User metadata updates: refresh in the background without the full-screen auth gate.
        if (event === 'USER_UPDATED') {
          void (async () => {
            await fetchUserRoles(session.user.id);
            await fetchProfileRef.current(session.user.id);
            await fetchMemberOrganizations(session.user.id);
          })();
          return;
        }

        setLoading(true);
        setTimeout(() => {
          void (async () => {
            try {
              await fetchUserRoles(session.user.id);
              await fetchProfileRef.current(session.user.id);
              await fetchMemberOrganizations(session.user.id);
            } finally {
              setLoading(false);
            }
          })();
        }, 0);
      }
    );

    void (async () => {
      const epoch = ++authBootstrapEpoch;
      try {
        const sessionRes = await stableAuthGetSession(supabase);
        const session = sessionRes?.data?.session ?? null;
        if (epoch !== authBootstrapEpoch) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          if (authBootstrapLastUserId !== session.user.id) {
            await fetchUserRoles(session.user.id);
            if (epoch !== authBootstrapEpoch) return;
            await fetchProfileRef.current(session.user.id);
            if (epoch !== authBootstrapEpoch) return;
            await fetchMemberOrganizations(session.user.id);
            if (epoch !== authBootstrapEpoch) return;
            authBootstrapLastUserId = session.user.id;
          }
        } else {
          authBootstrapLastUserId = null;
        }
      } finally {
        if (epoch === authBootstrapEpoch) {
          setLoading(false);
        }
      }
    })();

    return () => subscription.unsubscribe();
  }, [fetchUserRoles, fetchMemberOrganizations]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await fetchProfile(user.id);
    await fetchMemberOrganizations(user.id);
  }, [user?.id, fetchProfile, fetchMemberOrganizations]);

  useEffect(() => {
    if (!user?.email || inviteCheckDoneRef.current) return;
    inviteCheckDoneRef.current = true;
    (async () => {
      const email = user.email?.trim().toLowerCase();
      if (!email) return;
      const { data: invitations, error: listError } = await (supabase as any)
        .from('org_invitations')
        .select('id, org_id, permissions, invited_by, role')
        .ilike('email', email)
        .order('created_at', { ascending: false })
        .limit(1);
      if (listError || !invitations?.length) return;
      const inv = invitations[0] as {
        id: string;
        org_id: string;
        permissions: unknown;
        invited_by?: string | null;
        role?: string | null;
      };
      const inviteRole = String(inv.role ?? '').trim().toLowerCase();
      const resolvedRole = inviteRole === 'admin' ? 'admin' : 'driver';
      const { error: upsertError } = await (supabase as any)
        .from('profiles')
        .upsert(
          {
            id: user.id,
            full_name: user.user_metadata?.full_name ?? '',
            email,
            org_id: inv.org_id,
            role: resolvedRole,
            permissions: inv.permissions ?? {},
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
      if (upsertError) return;
      const { data: existingMember } = await (supabase as any)
        .from('org_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', inv.org_id)
        .maybeSingle();
      if (!existingMember) {
        await (supabase as any).from('org_members').insert({ user_id: user.id, org_id: inv.org_id });
      }
      await (supabase as any).from('user_roles').delete().eq('user_id', user.id);
      await (supabase as any).from('user_roles').insert({ user_id: user.id, role: resolvedRole });
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
    const sessionEmailForOrg = resolveSessionEmail(profile, user);
    const profileOrgIdForActive = resolveProfileOrgIdForActiveSession(profile);

    if (!isPlatformSuperOwnerEmail(sessionEmailForOrg)) {
      if (memberOrganizations.length === 0 && !profileOrgIdForActive) return;
      activeOrgInitializedRef.current = true;
      setActiveOrgId(profileOrgIdForActive ?? memberOrganizations[0]?.id ?? null);
      return;
    }

    if (memberOrganizations.length === 0 && !profileOrgIdForActive) return;

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const storedTrim = (stored ?? '').trim();

    const orgKnown = (id: string | null | undefined) =>
      Boolean(id) && memberOrganizations.some((o) => o.id === id);

    activeOrgInitializedRef.current = true;

    if (memberOrganizations.length === 1) {
      const onlyId = memberOrganizations[0]?.id ?? null;
      if (onlyId) {
        setActiveOrgId(onlyId);
        return;
      }
    }

    if (storedTrim && orgKnown(storedTrim)) {
      setActiveOrgId(storedTrim);
      return;
    }
    if (profileOrgIdForActive && orgKnown(profileOrgIdForActive)) {
      setActiveOrgId(profileOrgIdForActive);
      return;
    }
    if (profileOrgIdForActive) {
      setActiveOrgId(profileOrgIdForActive);
      return;
    }
    if (memberOrganizations.length > 0) {
      setActiveOrgId(memberOrganizations[0]?.id ?? null);
    }
  }, [user, profile, memberOrganizations, profile?.org_id, setActiveOrgId]);

  /** מנהלי צי: `activeOrgId` נעול לארגון הצי (פרופיל או org_members), לא רק ל־profiles.org_id כשהם חרגו. */
  useEffect(() => {
    if (!user || !profile) return;
    if (readViewAsActiveFromSession()) return;
    if (isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user))) return;
    const target = resolveLockedFleetOrgIdForStaff(profile, memberOrganizations);
    if (!target) return;
    if (activeOrgId !== target) {
      setActiveOrgId(target);
    }
  }, [user, profile, activeOrgId, memberOrganizations, setActiveOrgId]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = resolveSignUpEmailRedirectUrl();
      const emailNorm = email.trim().toLowerCase();

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
      const userEmail = (data.user?.email ?? emailNorm).toLowerCase();

      if (userId) {
        const now = new Date().toISOString();
        /**
         * Unified invitation flow:
         *   • Look up the most recent open invitation for this email.
         *   • If found, link the new profile to the invitation's org_id + role
         *     (pre-allocated by `resolveOrgIdForTeamInvite`, which already creates
         *     a brand-new org for platform-admin invites).
         *   • Whether invited or self-signup, the profile starts with
         *     `is_approved = false` + `status = 'pending_approval'`. The responsible
         *     admin (platform owner for new tenant admins, regular admin for team
         *     members) approves later via `useApproveMember`.
         */
        const { data: inviteRows } = await (supabase as any)
          .from('org_invitations')
          .select('id, org_id, permissions, role, creates_new_org')
          .ilike('email', userEmail)
          .order('created_at', { ascending: false })
          .limit(1);
        const inv = (inviteRows?.[0] ?? null) as
          | {
              id?: string;
              org_id?: string | null;
              permissions?: unknown;
              role?: string | null;
              creates_new_org?: boolean | null;
            }
          | null;
        const inviteOrgId = String(inv?.org_id ?? '').trim() || null;
        const inviteRole = String(inv?.role ?? '').trim().toLowerCase();
        const resolvedRole = inviteRole === 'admin' ? 'admin' : 'driver';
        const createsNewOrg = inv?.creates_new_org === true;

        const profilePayload: Record<string, unknown> = {
          id: userId,
          full_name: fullName,
          email: userEmail,
          /** Approval gate — every new account waits for admin approval. */
          status: 'pending_approval',
          is_approved: false,
          created_at: now,
          updated_at: now,
          ...(inviteOrgId ? { org_id: inviteOrgId, role: resolvedRole } : {}),
          ...(inv?.permissions != null ? { permissions: inv.permissions } : {}),
        };
        const { error: profileError } = await (supabase as any)
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id' });

        if (profileError) {
          console.error('Failed to create invited profile after signUp', profileError);
        }

        if (!profileError && inviteOrgId && inv?.id) {
          const { error: inviteDeleteError } = await (supabase as any)
            .from('org_invitations')
            .delete()
            .eq('id', inv.id);
          if (inviteDeleteError) {
            console.warn('Failed to delete org_invitation after signUp', inviteDeleteError);
          }
        }

        if (inviteOrgId) {
          const { data: existingMember } = await (supabase as any)
            .from('org_members')
            .select('id')
            .eq('user_id', userId)
            .eq('org_id', inviteOrgId)
            .maybeSingle();
          if (!existingMember) {
            await (supabase as any).from('org_members').insert({ user_id: userId, org_id: inviteOrgId });
          }
          await (supabase as any).from('user_roles').delete().eq('user_id', userId);
          await (supabase as any).from('user_roles').insert({ user_id: userId, role: resolvedRole });

          if (createsNewOrg) {
            console.info('[signUp] linked profile to freshly-allocated tenant org', {
              org_id: inviteOrgId,
              user_id: userId,
            });
          }
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

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem('fleet-version-heartbeat');
      setViewAsActiveSession(false);
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    authBootstrapLastUserId = null;
    suspendedSignOutHandledForUserId = null;
    setRoles([]);
    setProfile(null);
    setMemberOrganizations([]);
    setActiveOrgIdState(null);
    activeOrgInitializedRef.current = false;
  }, []);

  useEffect(() => {
    if (!user?.id) {
      suspendedSignOutHandledForUserId = null;
      return;
    }
    if (profile?.status !== 'suspended') return;
    if (suspendedSignOutHandledForUserId === user.id) return;
    suspendedSignOutHandledForUserId = user.id;
    toast.error('החשבון הושבת. פנה למנהל המערכת.');
    void signOut();
  }, [user?.id, profile?.status, signOut]);

  const roleLower = (r: string) => String(r).toLowerCase();
  const isAdmin = roles.some((r) => roleLower(r) === 'admin');
  const isManager = roles.some((r) => roleLower(r) === 'admin' || roleLower(r) === 'fleet_manager');
  const isDriver = roles.some((r) => {
    const lower = roleLower(r);
    return lower === 'driver' || lower === 'employee' || lower === 'viewer';
  });

  /**
   * כש־user_roles ריק בפרו: חשבון על (מלכי) או מנהל צי רביד — תמיד כ-admin ל-UI.
   * מנהלי צי נשענים על `profiles.org_id` + RLS; מתג ארגון בכותרת רק לבעל הפלטפורמה.
   */
  const sessionEmailResolved = resolveSessionEmail(profile, user);
  const isAdminEffective =
    isAdmin ||
    profile?.is_system_admin === true ||
    isPlatformSuperOwnerEmail(sessionEmailResolved) ||
    isFleetOrgAdminFallbackEmail(sessionEmailResolved);
  const isManagerEffective = isManager || isAdminEffective;

  const hasPermission = useCallback(
    (permission: PermissionKey) => {
      // Primary: use profile permissions (may be partially populated).
      const allowed = checkPermission(profile, permission, {
        isAdmin: isAdminEffective,
        isManager: isManagerEffective,
      });
      if (allowed) return true;

      // Fallback for common driver scenario: allow "handover" when role is driver/viewer/employee
      // but the profile.permissions JSON doesn't include the key.
      if (!isAdminEffective && !isManagerEffective && permission === 'handover') {
        const roleLowerSet = roles.map((r) => roleLower(r));
        if (roleLowerSet.some((r) => r === 'driver' || r === 'employee' || r === 'viewer')) return true;
      }

      return false;
    },
    [profile, isAdminEffective, isManagerEffective, roles, sessionEmailResolved]
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
