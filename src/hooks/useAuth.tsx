import { useState, useEffect, useRef, createContext, useContext, useCallback, ReactNode } from 'react';
import { User, Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/fleet';
import { hasPermission as checkPermission, type PermissionKey } from '@/lib/permissions';
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  isRavidManagerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';
import { FALLBACK_MAIN_FLEET_ORG_ID, RAVID_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';
import { isLikelyUuid } from '@/lib/fleetUuid';
import { toast } from 'sonner';
import { clearFleetProUpdateModalSuppressFlag } from '@/lib/pwaUpdateModalBridge';
import { readViewAsActiveFromSession, setViewAsActiveSession } from '@/lib/viewAsSessionBridge';
import { isFleetManagerProHostname } from '@/lib/versionManifest';

const ACTIVE_ORG_STORAGE_KEY = 'fleet-manager-active-org';
/** מנהל פלטפורמה: צפייה בצי של אדמין אחר (profiles.id) — לא «הצי שלי» */
const PLATFORM_FLEET_VIEW_ADMIN_STORAGE_KEY = 'fleet-manager-platform-fleet-view-admin';

function readStoredPlatformFleetViewAdminId(): string | null {
  try {
    const v = localStorage.getItem(PLATFORM_FLEET_VIEW_ADMIN_STORAGE_KEY)?.trim();
    return v && isLikelyUuid(v) ? v : null;
  } catch {
    return null;
  }
}

function resolveSignUpEmailRedirectUrl(): string {
  if (typeof window === 'undefined') return 'https://fleet-manager-pro.com/auth';
  if (isFleetManagerProHostname()) return 'https://fleet-manager-pro.com/auth';
  return `${window.location.origin}/auth`;
}

/** ארגון פעיל לפי `profiles` + חריג לרביד (זהה לאתחול `activeOrgId`). */
function resolveProfileOrgIdForActiveSession(profile: Profile | null, user: User | null): string | null {
  const rawProfileOrgId = profile?.org_id?.trim() || null;
  const sessionEmailForOrg = resolveSessionEmail(profile, user);
  if (
    isRavidManagerEmail(sessionEmailForOrg) &&
    (!rawProfileOrgId || rawProfileOrgId === FALLBACK_MAIN_FLEET_ORG_ID)
  ) {
    return RAVID_FLEET_ORG_ID;
  }
  return rawProfileOrgId;
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
  /**
   * מנהל פלטפורמה בלבד: כשבוחרים אדמין צי במתג — מזהה profiles.id שלו (או null ל«הצי שלי»).
   */
  platformFleetViewAdminId: string | null;
  setPlatformFleetViewAdminId: (profileId: string | null) => void;
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
  const [platformFleetViewAdminId, setPlatformFleetViewAdminIdState] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readStoredPlatformFleetViewAdminId() : null,
  );
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

  const setPlatformFleetViewAdminId = useCallback((profileId: string | null) => {
    setPlatformFleetViewAdminIdState(profileId);
    try {
      if (profileId && isLikelyUuid(profileId)) {
        localStorage.setItem(PLATFORM_FLEET_VIEW_ADMIN_STORAGE_KEY, profileId);
      } else {
        localStorage.removeItem(PLATFORM_FLEET_VIEW_ADMIN_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const activeOrgId = _activeOrgId ?? null;

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

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
          if (authBootstrapLastUserId !== session.user.id) {
            await Promise.allSettled([
              fetchUserRoles(session.user.id),
              fetchProfileRef.current(session.user.id),
              fetchMemberOrganizations(session.user.id),
            ]);
            authBootstrapLastUserId = session.user.id;
          }
        } else {
          authBootstrapLastUserId = null;
        }
      } finally {
        setLoading(false);
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
        .eq('email', email)
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
      const inviterId = String(inv.invited_by ?? '').trim() || null;
      /** אדמין ארגוני מהזמנת חשבון על — לא נשמר תחת המזמין בהיררכיית צוות */
      const managerFromInvite =
        resolvedRole === 'admin'
          ? { parent_admin_id: null, managed_by_user_id: null }
          : inviterId
            ? { parent_admin_id: inviterId, managed_by_user_id: inviterId }
            : {};
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
            ...managerFromInvite,
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
    const rawProfileOrgId = profile.org_id?.trim() || null;
    const sessionEmailForOrg = resolveSessionEmail(profile, user);
    const profileOrgIdForActive = resolveProfileOrgIdForActiveSession(profile, user);
    if (memberOrganizations.length === 0 && !profileOrgIdForActive) return;

    const orgKnown = (id: string | null | undefined) =>
      Boolean(id) && memberOrganizations.some((o) => o.id === id);
    const profileInMembers =
      Boolean(profileOrgIdForActive) &&
      memberOrganizations.some((o) => o.id === profileOrgIdForActive);
    const delegated = Boolean(profile.parent_admin_id?.trim());

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const storedTrim = (stored ?? '').trim();

    activeOrgInitializedRef.current = true;

    /** חברות יחידה — תמיד הארגון הזה (מנקה localStorage ישן / UUID של צי ראשי). */
    if (memberOrganizations.length === 1) {
      const onlyId = memberOrganizations[0]?.id ?? null;
      if (onlyId) {
        setActiveOrgId(onlyId);
        return;
      }
    }

    /** משתמש תחת מנהל: `profiles.org_id` הוא מקור האמת מול מפתח שמור מארגון אחר. */
    if (delegated && profileInMembers && profileOrgIdForActive && storedTrim !== profileOrgIdForActive) {
      setActiveOrgId(profileOrgIdForActive);
      return;
    }

    /**
     * לא בעלי bootstrap: אם נשמר בדפדפן «צי ראשי» אבל בפרופיל כבר ארגון אחר שהמשתמש חבר בו —
     * לא לבחור את הצי הראשי רק כי הוא עדיין ב־org_members (למשל לפני ניקוי כפילות ב-DB).
     */
    if (
      !isPlatformSuperOwnerEmail(sessionEmailForOrg) &&
      profileInMembers &&
      profileOrgIdForActive &&
      profileOrgIdForActive !== FALLBACK_MAIN_FLEET_ORG_ID &&
      storedTrim === FALLBACK_MAIN_FLEET_ORG_ID
    ) {
      setActiveOrgId(profileOrgIdForActive);
      return;
    }

    const wrongMainStoredForRavid =
      isRavidManagerEmail(sessionEmailForOrg) && stored === FALLBACK_MAIN_FLEET_ORG_ID;
    const validStored =
      !wrongMainStoredForRavid &&
      Boolean(stored) &&
      (orgKnown(stored) || stored === rawProfileOrgId || stored === profileOrgIdForActive);
    if (validStored && stored) {
      setActiveOrgId(stored);
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

  /**
   * אחרי שינוי `org_members` / `profiles.org_id` בשרת — הרשימה בזיכרון מתעדכנת אבל `activeOrgId` עלול
   * להישאר על ארגון שהמשתמש כבר לא חבר בו (localStorage + רשימה ישנה לפני Realtime).
   */
  useEffect(() => {
    if (!user) return;
    if (!activeOrgId) return;
    if (memberOrganizations.length === 0) return;
    const known = memberOrganizations.some((o) => o.id === activeOrgId);
    if (known) return;
    if (readViewAsActiveFromSession()) return;
    const preferredId = resolveProfileOrgIdForActiveSession(profile, user);
    if (
      preferredId &&
      activeOrgId === preferredId &&
      !memberOrganizations.some((o) => o.id === preferredId)
    ) {
      return;
    }
    const preferred =
      preferredId && memberOrganizations.some((o) => o.id === preferredId)
        ? preferredId
        : memberOrganizations[0]?.id ?? null;
    if (preferred && preferred !== activeOrgId) {
      setActiveOrgId(preferred);
    }
  }, [user, profile, activeOrgId, memberOrganizations, setActiveOrgId]);

  /**
   * `activeOrgId` על צי ראשי (localStorage) אבל `profiles.org_id` כבר ארגון אחר — למשל כש־RLS על org_members
   * לא מחזיר את הארגון החדש ו־`profileInMembers` נכשל באתחול הראשי.
   */
  useEffect(() => {
    if (!user || !profile) return;
    if (readViewAsActiveFromSession()) return;
    const sessionEmail = resolveSessionEmail(profile, user);
    if (isPlatformSuperOwnerEmail(sessionEmail)) return;
    const pid = resolveProfileOrgIdForActiveSession(profile, user);
    if (!pid || pid === FALLBACK_MAIN_FLEET_ORG_ID) return;
    if (activeOrgId !== FALLBACK_MAIN_FLEET_ORG_ID) return;
    setActiveOrgId(pid);
  }, [user, profile, activeOrgId, setActiveOrgId]);

  /**
   * משתמש עם חברות בארגון יחיד — מסנכרן localStorage / active שגוי.
   * לא כופים כש־activeOrgId שייך לארגון שלא ברשימה (למשל תצוגה כמשתמש אחר — ארגון המוחלף).
   */
  useEffect(() => {
    if (!user?.id) return;
    if (memberOrganizations.length !== 1) return;
    const onlyId = memberOrganizations[0]?.id;
    if (!onlyId) return;
    if (activeOrgId === onlyId) return;
    if (activeOrgId === RAVID_FLEET_ORG_ID) return;
    if (activeOrgId && !memberOrganizations.some((o) => o.id === activeOrgId)) return;
    setActiveOrgId(onlyId);
  }, [user?.id, memberOrganizations, activeOrgId, setActiveOrgId]);

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
        const { data: inviteRows } = await (supabase as any)
          .from('org_invitations')
          .select('org_id, permissions, invited_by, role')
          .eq('email', userEmail)
          .order('created_at', { ascending: false })
          .limit(1);
        const inv = (inviteRows?.[0] ?? null) as
          | {
              org_id?: string | null;
              permissions?: unknown;
              invited_by?: string | null;
              role?: string | null;
            }
          | null;
        const inviterId = String(inv?.invited_by ?? '').trim() || null;
        const inviteOrgId = String(inv?.org_id ?? '').trim() || null;
        const inviteRole = String(inv?.role ?? '').trim().toLowerCase();
        const resolvedRole = inviteRole === 'admin' ? 'admin' : 'driver';
        const managerFromInvite =
          resolvedRole === 'admin'
            ? { parent_admin_id: null, managed_by_user_id: null }
            : inviterId
              ? { parent_admin_id: inviterId, managed_by_user_id: inviterId }
              : {};

        const profilePayload: Record<string, unknown> = {
          id: userId,
          full_name: fullName,
          email: userEmail,
          status: inviteOrgId ? 'active' : 'pending_approval',
          created_at: now,
          updated_at: now,
          ...(inviteOrgId ? { org_id: inviteOrgId, role: resolvedRole } : {}),
          ...managerFromInvite,
          ...(inv?.permissions != null ? { permissions: inv.permissions } : {}),
        };
        const { error: profileError } = await (supabase as any)
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id' });

        if (profileError) {
          console.error('Failed to create invited profile after signUp', profileError);
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
   * רביד נעול לארגון `RAVID_FLEET_ORG_ID` ב־AppLayout (לא תלוי ב-member/driver בטבלאות).
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
      platformFleetViewAdminId,
      setPlatformFleetViewAdminId,
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
