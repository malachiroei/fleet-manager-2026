import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
 import { Link } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Globe,
  Loader2,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Shield,
  Sun,
  UserCog,
  Users,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_UPDATED_EVENT,
  version as codeVersion,
} from '@/constants/version';
import {
  commitFleetProAcknowledgedVersionAndHardReload,
  triggerServiceWorkerUpdateCheck,
} from '@/lib/pwaServiceWorkerControl';
import {
  clearFleetProUpdateModalSuppressFlag,
  hidePwaUpdateModal,
  showPwaUpdateModal,
} from '@/lib/pwaUpdateModalBridge';
import { parseManifestChanges } from '@/lib/pwaManifest';
import {
  pickLatestVersionManifest,
  fetchPendingChangesFromDb,
  fetchVersionManifestFromDb,
  formatPrivateUiAnchorVersion,
  getTestStaticManifestUrl,
  normalizeVersion,
  compareSemver,
  computeNextPatchVersion,
  parseSemverParts,
  parseSemverSegments,
  toCanonicalThreePartVersion,
  versionNotOlderThanBundle,
  isFleetManagerProHostname,
} from '@/lib/versionManifest';
import { isFleetManagerTestHost, isFleetProductionHost } from '@/lib/pwaPromptRegister';
import { upsertSystemSettingsRows, verifyPublishWrittenToSupabase } from '@/lib/systemSettingsUpsert';
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import {
  buildPendingOnlyPublishCandidates,
  getFleetStagingOnlyUiInfoLines,
  FLEET_UI_DEFAULT_PUBLISH_CANDIDATES,
  getFleetUiPermissionModalEditableCandidates,
  getFleetUiTokensExcludedFromProPublishDefaults,
  globalManifestUiFeatureTokenSet,
  isFleetStagingOnlyUiTokenId,
  mergeProfilePermissionModalPayload,
  mergeUniquePendingChangeLines,
  parseProfileAllowedFeatureTokens,
  parseProfileUiFeatureDenylist,
  removePendingLinesPublishedInChanges,
  stripFleetStagingOnlyLinesForProHostname,
} from '@/lib/fleetPublishedUiFeatures';

/** רשימת מידע סטטית במודאל פרסום — פיצ'רי staging/debug (ללא צ'קבוקס) */
const FLEET_STAGING_DEBUG_INFO_LINES = getFleetStagingOnlyUiInfoLines();
import { useFleetManifestUiGates } from '@/hooks/useFleetManifestUiGates';
 
type UserVersionRow = {
  id: string;
  email: string | null;
  current_app_version: string | null;
  target_version: string | null;
  updated_at: string;
  allowed_features?: unknown;
  denied_features?: unknown;
};

function isUserVersionBehindManifest(userVer: string | null | undefined, manifestVer: string): boolean {
  const m = normalizeVersion(String(manifestVer ?? '').trim());
  if (!parseSemverParts(m)) return false;
  if (!userVer?.trim()) return true;
  const u = normalizeVersion(userVer.trim());
  if (!parseSemverParts(u)) return true;
  return compareSemver(m, u) > 0;
}

export default function AdminSettingsPage() {
    const { theme, setTheme } = useTheme();
    const { isAdmin, profile, refreshProfile } = useAuth();
    const canViewUserVersions = isAdmin || Boolean(profile?.is_system_admin);
    const manifestUiGates = useFleetManifestUiGates();
    /** ייצור (apex + www): הטבלה מוסתרת לחלוטין אלא אם טוקן הדיבוג במניפסט */
    const isFleetProDomain = isFleetManagerProHostname();
    const showUserVersionsTable =
      canViewUserVersions &&
      manifestUiGates.ready &&
      (!isFleetProDomain || manifestUiGates.adminUserVersionsTable);
    const [lastPricingUpload, setLastPricingUpload] = useState<string | null>(localStorage.getItem('last_pricing_upload'));
    const lastVehicleUpload = localStorage.getItem('last_vehicle_upload');
    const lastDriverUpload = localStorage.getItem('last_driver_upload');
    const showDevTools = (() => {
      if (typeof window === 'undefined') return false;
      const host = (window.location.hostname || '').toLowerCase();
      const isAllowedHost =
        host.includes('localhost') ||
        host.includes('127.0.0.1') ||
        (host.includes('vercel.app') && (host.includes('dev') || host.includes('staging')));

      // Safety: never show dev/admin tools in production hostnames.
      // (Prevents enabling via localStorage flag in prod.)
      if (!isAllowedHost) return false;

      try {
        const flag = localStorage.getItem('fleet-manager-dev-tools');
        if (flag === '1' || flag === 'true') return true;
      } catch {
        // ignore
      }

      return true;
    })();

    // ── notification_emails — stored in system_settings ───────────────────────
    const [notificationEmailsRaw, setNotificationEmailsRaw] = useState('malachiroei@gmail.com');
    const [isSavingEmails, setIsSavingEmails] = useState(false);
    const [isLoadingEmails, setIsLoadingEmails] = useState(true);

    useEffect(() => {
      (async () => {
        try {
          const { data, error } = await (supabase as any)
            .from(FLEET_KV_TABLE)
            .select('value')
            .eq('key', 'notification_emails')
            .maybeSingle();
          if (error) throw error;
          const arr: string[] = Array.isArray(data?.value) ? data.value : [];
          if (arr.length > 0) setNotificationEmailsRaw(arr.join(', '));
        } catch {
          // fallback to localStorage value if table not yet migrated
          const saved = localStorage.getItem('handover_notification_email');
          if (saved) setNotificationEmailsRaw(saved);
        } finally {
          setIsLoadingEmails(false);
        }
      })();
    }, []);

    // ── last_pricing_upload_date — stored in system_settings (shared for all users)
    useEffect(() => {
      const handlePricingUploaded = (event: Event) => {
        const detail = (event as CustomEvent<{ iso?: string }>).detail;
        if (detail?.iso && typeof detail.iso === 'string') {
          setLastPricingUpload(detail.iso);
          localStorage.setItem('last_pricing_upload', detail.iso);
        }
      };

      window.addEventListener('pricing-uploaded', handlePricingUploaded);

      (async () => {
        try {
          const { data, error } = await (supabase as any)
            .from(FLEET_KV_TABLE)
            .select('key,value')
            .in('key', ['last_pricing_upload_date', 'last_pricing_upload']);

          if (error) throw error;
          const rows = Array.isArray(data) ? data : [];
          const picked =
            rows.find((r: any) => r?.key === 'last_pricing_upload_date')?.value ??
            rows.find((r: any) => r?.key === 'last_pricing_upload')?.value;

          if (typeof picked === 'string' && picked.trim()) {
            setLastPricingUpload(picked);
            localStorage.setItem('last_pricing_upload', picked);
          }
        } catch (e) {
          // best-effort; localStorage fallback already exists
        }
      })();

      return () => {
        window.removeEventListener('pricing-uploaded', handlePricingUploaded);
      };
    }, []);

    const formatDateTimeForUi = (d: Date) => {
      const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${date} ${time}`;
    };

    const saveNotificationEmails = async () => {
      const emails = notificationEmailsRaw
        .split(/[\n,]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0 && e.includes('@'));

      if (emails.length === 0) {
        toast.error('נא להזין לפחות כתובת מייל תקינה אחת');
        return;
      }

      setIsSavingEmails(true);
      try {
        const { error } = await (supabase as any)
          .from(FLEET_KV_TABLE)
          .upsert({ key: 'notification_emails', value: emails }, { onConflict: 'key' });
        if (error) throw error;
        setNotificationEmailsRaw(emails.join(', '));
        toast.success(`נשמרו ${emails.length} כתובות מייל להתראות`);
      } catch (err) {
        console.error(err);
        toast.error('שמירה נכשלה — ודא שטבלת settings קיימת ב-Supabase');
      } finally {
        setIsSavingEmails(false);
      }
    };

    // ── legacy single-email field (kept for test-email button) ────────────────
    const [notificationEmail, setNotificationEmail] = useState(
      localStorage.getItem('handover_notification_email') || 'malachiroei@gmail.com'
    );
    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [isBackingUpSettings, setIsBackingUpSettings] = useState(false);
    const [isRestoringSettings, setIsRestoringSettings] = useState(false);
    // ── Version Release System (Admin) ───────────────────────────────────────────
    const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
    const [isPublishProgressOpen, setIsPublishProgressOpen] = useState(false);
    const [publishNextVersion, setPublishNextVersion] = useState<string>('');
    const [publishVersionInput, setPublishVersionInput] = useState<string>('');
    const [publishProgressValue, setPublishProgressValue] = useState<number>(0);
    const [publishProgressStage, setPublishProgressStage] = useState<string>('');
    const [isPublishing, setIsPublishing] = useState(false);
    /** השוואת גרסאות + בחירת pending — מודאל פרסום (בעיקר בטסט) */
    const [publishDiffSupabaseVersion, setPublishDiffSupabaseVersion] = useState<string>('');
    /** שורות מ־version_manifest.changes — ממוזגות אוטומטית לפרסום (ללא צ'קבוקס) */
    const [publishManifestCarryLines, setPublishManifestCarryLines] = useState<string[]>([]);
    /** רק pending / ברירות מחדל שעדיין לא פורסמו */
    const [publishPendingCandidates, setPublishPendingCandidates] = useState<string[]>([]);
    const [publishCandidateSelected, setPublishCandidateSelected] = useState<boolean[]>([]);
    const [publishExtraChangelogLines, setPublishExtraChangelogLines] = useState<string>('');

    const DEFAULT_APP_VERSION = codeVersion;
    const [appVersion, setAppVersion] = useState<string>(() => {
      try {
        return versionNotOlderThanBundle(localStorage.getItem('fleet-manager-app_version'), codeVersion);
      } catch {
        return codeVersion;
      }
    });
    // Default visible timestamp for the last update (updated by the "עדכן" flow)
    const [lastUpdateDate, setLastUpdateDate] = useState<string>(() => {
      try {
        const iso = localStorage.getItem('fleet-manager-last_update_date_iso');
        if (iso) {
          const ms = Date.parse(iso);
          if (!Number.isNaN(ms)) return formatDateTimeForUi(new Date(ms));
        }
      } catch {
        // ignore
      }
      return formatDateTimeForUi(new Date(2026, 2, 18, 13, 0, 0));
    });

    const [latestManifestVersion, setLatestManifestVersion] = useState<string>(codeVersion);

    const [userVersionRows, setUserVersionRows] = useState<UserVersionRow[]>([]);
    const [userVersionLoading, setUserVersionLoading] = useState(false);

    /** מודאל ניהול טוקני UI למשתמש — profiles.allowed_features */
    const [userPermissionsRow, setUserPermissionsRow] = useState<UserVersionRow | null>(null);
    const [userPermissionsSelections, setUserPermissionsSelections] = useState<Record<string, boolean>>({});
    const [userPermissionsSaving, setUserPermissionsSaving] = useState(false);
    /** רענון allowed_features מ-Supabase בעת פתיחת המודאל */
    const [userPermissionsLoadingFresh, setUserPermissionsLoadingFresh] = useState(false);
    const [userPermissionsFreshHint, setUserPermissionsFreshHint] = useState<string | null>(null);
    /** טוקנים פעילים מהמניפסט הגלובלי (למודאל הרשאות — V נעול + אי שמירה ב־profile) */
    const [permissionModalGlobalTokens, setPermissionModalGlobalTokens] = useState<string[]>([]);

    const permissionModalGlobalTokenSet = useMemo(
      () => new Set(permissionModalGlobalTokens),
      [permissionModalGlobalTokens]
    );

    const permissionModalEditableCandidates = useMemo(() => getFleetUiPermissionModalEditableCandidates(), []);

    /** טסט בלבד: טוקני staging במודאל הרשאות — מוצגים כ-disabled */
    const permissionModalStagingDisabledOnTest = useMemo(
      () =>
        isFleetProDomain
          ? []
          : FLEET_UI_DEFAULT_PUBLISH_CANDIDATES.filter((c) => isFleetStagingOnlyUiTokenId(c.token)),
      [isFleetProDomain]
    );

    const loadUserVersions = useCallback(async () => {
      if (!showUserVersionsTable) return;
      setUserVersionLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id, email, current_app_version, target_version, allowed_features, denied_features, updated_at')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        setUserVersionRows(Array.isArray(data) ? (data as UserVersionRow[]) : []);
      } catch (e) {
        console.warn('[AdminSettings] user versions', e);
        toast.error('טעינת סטטוס משתמשים נכשלה — ודא עמודות current_app_version ב-profiles ו-RLS למנהלים');
        setUserVersionRows([]);
      } finally {
        setUserVersionLoading(false);
      }
    }, [showUserVersionsTable]);

    useEffect(() => {
      void loadUserVersions();
    }, [loadUserVersions]);

    /** מצב צ'קבוקסים: גלובלי ∪ הרשאה חיובית; חסימה מ־denied_features (או ! legacy ב-allowed) */
    const computePermissionModalCheckedFromProfile = useCallback(
      (allowedRaw: unknown, deniedRaw: unknown, globalTokens: Set<string>) => {
        const allowed = parseProfileAllowedFeatureTokens(allowedRaw);
        const denied = parseProfileUiFeatureDenylist(allowedRaw, deniedRaw);
        const next: Record<string, boolean> = {};
        for (const { token } of permissionModalEditableCandidates) {
          next[token] = !denied.has(token) && (globalTokens.has(token) || allowed.has(token));
        }
        return next;
      },
      [permissionModalEditableCandidates]
    );

    const openUserPermissionsModal = useCallback(
      async (row: UserVersionRow) => {
        setUserPermissionsFreshHint(null);
        setUserPermissionsSelections({});
        setUserPermissionsRow(row);
        setPermissionModalGlobalTokens([]);
        setUserPermissionsLoadingFresh(true);

        const applyMerged = (allowedRaw: unknown, deniedRaw: unknown, globalSet: Set<string>) => {
          setPermissionModalGlobalTokens([...globalSet].sort());
          setUserPermissionsSelections(
            computePermissionModalCheckedFromProfile(allowedRaw, deniedRaw, globalSet)
          );
        };

        let globalSet = new Set<string>();
        let allowedRaw: unknown = row.allowed_features;
        let deniedRaw: unknown = row.denied_features;

        try {
          const [picked, profileRes] = await Promise.all([
            pickLatestVersionManifest(supabase as any, getTestStaticManifestUrl()),
            (supabase as any)
              .from('profiles')
              .select('allowed_features, denied_features')
              .eq('id', row.id)
              .maybeSingle(),
          ]);
          const lines = parseManifestChanges(picked?.manifest ?? {});
          globalSet = globalManifestUiFeatureTokenSet(lines, isFleetProDomain);

          const { data, error } = profileRes;
          if (error) throw error;
          if (data && data.allowed_features !== undefined) {
            allowedRaw = data.allowed_features;
          }
          if (data && data.denied_features !== undefined) {
            deniedRaw = data.denied_features;
          }
          applyMerged(allowedRaw, deniedRaw, globalSet);
          setUserPermissionsRow({ ...row, allowed_features: allowedRaw, denied_features: deniedRaw });
        } catch (e) {
          console.warn('[AdminSettings] permissions modal load', e);
          setUserPermissionsFreshHint(
            'לא ניתן לטעון מניפסט/הרשאות מהשרת — מוצגים לפי הנתונים בטבלה בלבד (ללא מיזוג מניפסט גלובלי).'
          );
          globalSet = new Set<string>();
          applyMerged(row.allowed_features, row.denied_features, globalSet);
        } finally {
          setUserPermissionsLoadingFresh(false);
        }
      },
      [computePermissionModalCheckedFromProfile, isFleetProDomain]
    );

    const closeUserPermissionsModal = useCallback(() => {
      if (userPermissionsSaving || userPermissionsLoadingFresh) return;
      setUserPermissionsRow(null);
      setUserPermissionsSelections({});
      setPermissionModalGlobalTokens([]);
      setUserPermissionsFreshHint(null);
    }, [userPermissionsSaving, userPermissionsLoadingFresh]);

    const submitUserPermissions = useCallback(async () => {
      if (!userPermissionsRow) return;
      const globalSet = new Set<string>(permissionModalGlobalTokens);
      const managed = permissionModalEditableCandidates.map(({ token }) => token);
      const payload = mergeProfilePermissionModalPayload(
        userPermissionsRow.allowed_features,
        userPermissionsRow.denied_features,
        managed,
        globalSet,
        userPermissionsSelections
      );
      setUserPermissionsSaving(true);
      try {
        /**
         * עוגן פרטי בלבד — ללא שינוי system_settings / גרסה גלובלית.
         * פורמט: `CurrentGlobal-p<timestamp>`; המשתמש מקבל מודאל «עדכן עכשיו» שמאשר ב־localStorage.
         */
        const manifestRow = await fetchVersionManifestFromDb(supabase as any);
        const globalRaw =
          manifestRow && typeof manifestRow.version === 'string' ? manifestRow.version.trim() : '';
        let globalBase =
          toCanonicalThreePartVersion(normalizeVersion(globalRaw)) || normalizeVersion(globalRaw).trim();
        if (!globalBase || !parseSemverParts(globalBase)) {
          globalBase =
            toCanonicalThreePartVersion(normalizeVersion(codeVersion)) ||
            normalizeVersion(codeVersion).trim() ||
            '0.0.0';
        }
        const privateAnchor = formatPrivateUiAnchorVersion(globalBase);
        const { error } = await (supabase as any)
          .from('profiles')
          .update({
            allowed_features: payload.allowed_features,
            denied_features: payload.denied_features,
            ui_denied_features_anchor_version: privateAnchor,
          })
          .eq('id', userPermissionsRow.id);
        if (error) throw error;
        const targetId = userPermissionsRow.id;
        const isSelfSave = profile?.id === targetId;
        const who = userPermissionsRow.email ?? targetId.slice(0, 8);
        const a = payload.allowed_features.length
          ? `allowed:\n${payload.allowed_features.map((t) => `• ${t}`).join('\n')}`
          : 'allowed: —';
        const d = payload.denied_features.length
          ? `denied:\n${payload.denied_features.map((t) => `• ${t}`).join('\n')}`
          : 'denied: —';
        const tokenList = `${a}\n\n${d}`;
        toast.success(`הרשאות UI עודכנו עבור ${who} · עוגן פרטי (גרסה גלובלית ${globalBase})`, {
          description: tokenList,
          duration: 6500,
        });
        setUserPermissionsRow(null);
        setUserPermissionsSelections({});
        void loadUserVersions();
        /** רענון קשיח רק כשהמנהל עדכן את עצמו — סנכרון ack + עוגן פרטי */
        if (isSelfSave) {
          void commitFleetProAcknowledgedVersionAndHardReload(globalBase, {
            privateAnchorFull: privateAnchor,
          });
        }
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה';
        toast.error(`שמירה נכשלה: ${msg}`);
      } finally {
        setUserPermissionsSaving(false);
      }
    }, [
      userPermissionsRow,
      userPermissionsSelections,
      permissionModalGlobalTokens,
      permissionModalEditableCandidates,
      loadUserVersions,
      codeVersion,
      profile?.id,
    ]);

    const restoreInputRef = useRef<HTMLInputElement | null>(null);

    const formatDate = (iso: string | null) => {
      if (!iso) return 'לא בוצעה';
      const d = new Date(iso);
      const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${date} ${time}`;
    };

    // Load persisted version + last update timestamp (best-effort).
    useEffect(() => {
      (async () => {
        try {
          // Prefer local persistence (prevents resetting to older versions after simplified update).
          try {
            const localVersion = localStorage.getItem('fleet-manager-app_version');
            const localLastIso = localStorage.getItem('fleet-manager-last_update_date_iso');
            if (localVersion && localLastIso) {
              const v = versionNotOlderThanBundle(localVersion, codeVersion);
              setAppVersion(v);
              if (v !== localVersion) {
                try {
                  localStorage.setItem('fleet-manager-app_version', v);
                } catch {
                  // ignore
                }
              }
              const ms = Date.parse(localLastIso);
              if (!Number.isNaN(ms)) {
                setLastUpdateDate(formatDateTimeForUi(new Date(ms)));
              } else {
                setLastUpdateDate(localLastIso);
              }
              return;
            }
          } catch {
            // ignore localStorage issues
          }

          const [versionRes, lastUpdateRes] = await Promise.all([
            (supabase as any).from(FLEET_KV_TABLE).select('value').eq('key', 'app_version').maybeSingle(),
            (supabase as any).from(FLEET_KV_TABLE).select('value').eq('key', 'last_update_date').maybeSingle(),
          ]);

          if (!versionRes?.error) {
            const versionValue = versionRes?.data?.value;
            if (typeof versionValue === 'string' && versionValue.trim()) {
              const v = versionNotOlderThanBundle(versionValue, codeVersion);
              setAppVersion(v);
            }
          }

          if (!lastUpdateRes?.error) {
            const lastUpdateValue = lastUpdateRes?.data?.value;
            if (typeof lastUpdateValue === 'string' && lastUpdateValue.trim()) {
              const ms = Date.parse(lastUpdateValue);
              if (!Number.isNaN(ms)) {
                setLastUpdateDate(formatDateTimeForUi(new Date(ms)));
              } else {
                setLastUpdateDate(lastUpdateValue);
              }
            }
          }
        } catch {
          // ignore (RLS/migration not ready yet)
        }
      })();
    }, []);

    // Load latest version manifest for "latest version" coloring (DB או v-dev-only.json בטסט)
    useEffect(() => {
      (async () => {
        try {
          const picked = await pickLatestVersionManifest(supabase as any, getTestStaticManifestUrl());
          const v = picked?.manifest?.version;
          if (typeof v === 'string' && v.trim()) setLatestManifestVersion(v.trim());
        } catch {
          // best-effort only
        }
      })();
    }, []);

    const sendTestEmail = async () => {
      if (!notificationEmail.trim() || !notificationEmail.includes('@')) {
        toast.error('נא להזין כתובת מייל תקינה לפני בדיקה');
        return;
      }

      setIsSendingTestEmail(true);
      try {
        localStorage.setItem('handover_notification_email', notificationEmail.trim());

        const { error } = await supabase.functions.invoke('send-handover-notification', {
          body: {
            to: notificationEmail.trim(),
            subject: 'בדיקת מייל - Fleet Manager 2026',
            payload: {
              handoverType: 'delivery',
              assignmentMode: 'permanent',
              vehicleLabel: 'בדיקת מערכת',
              driverLabel: 'בדיקת מערכת',
              odometerReading: 12345,
              fuelLevel: 4,
              notes: 'מייל בדיקה ממסך הגדרות',
              reportUrl: window.location.origin,
              sentAt: new Date().toISOString(),
            },
          },
        });

        if (error) {
          throw error;
        }

        toast.success('מייל בדיקה נשלח בהצלחה');
      } catch (error) {
        let message = 'שגיאה לא ידועה';

        if (error instanceof FunctionsHttpError) {
          try {
            const response = error.context;
            const data = await response.json() as { error?: string; message?: string; details?: string };
            message = data?.error || data?.message || data?.details || `HTTP ${response.status}`;
          } catch {
            message = error.message;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }

        if (message.includes('Missing RESEND_API_KEY')) {
          message = 'חסר RESEND_API_KEY בפרויקט Supabase של הטסט';
        }

        toast.error(`שליחת מייל בדיקה נכשלה: ${message}`);
      } finally {
        setIsSendingTestEmail(false);
      }
    };

    const runPrintTest = () => {
      const printWindow = window.open('', '_blank', 'width=900,height=700');

      if (!printWindow) {
        toast.error('חלון ההדפסה נחסם על ידי הדפדפן. יש לאפשר חלונות קופצים ולנסות שוב');
        return;
      }

      const generatedAt = new Date().toLocaleString('he-IL');

      printWindow.document.write(`
        <!doctype html>
        <html lang="he" dir="rtl">
          <head>
            <meta charset="utf-8" />
            <title>בדיקת הדפסה - Fleet Manager 2026</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
              h1 { margin: 0 0 12px; font-size: 24px; }
              p { margin: 4px 0; font-size: 16px; }
              .box { margin-top: 16px; border: 1px solid #d1d5db; border-radius: 10px; padding: 16px; }
            </style>
          </head>
          <body>
            <h1>בדיקת הדפסה</h1>
            <p>המערכת פתחה בהצלחה חלון הדפסה.</p>
            <p>תאריך יצירה: ${generatedAt}</p>
            <div class="box">
              <p>אם המסמך הודפס או הופיע בתצוגה מקדימה, בדיקת ההדפסה עברה בהצלחה.</p>
            </div>
          </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 150);
    };
 
    const fetchBackupPayload = async () => {
      const appIdentifier = 'fleet-manager-pro';
      const version = '2.0';

      const backupPayload: any = {
        metadata: { appIdentifier, version },
        exportedAt: new Date().toISOString(),
        lastUpdateDate,
        theme,
      };

      const includedParts: string[] = [];
      const skippedParts: string[] = [];
      const failures: Record<string, string> = {};

      // Tables that we KNOW exist and are used in this app:
      // - vehicles, drivers (core entities)
      // - maintenance_logs (contains odometer_reading; treated as "odometer_logs" in backup)
      // - organizations (fleet/org name used in AppLayout)
      const tableStrategies: Array<{
        tableName: string;
        jsonKey: string;
        selectVariants: string[];
        // Conflict target suggestion for restore (not used during backup)
        conflictTarget?: string;
      }> = [
        {
          tableName: 'vehicles',
          jsonKey: 'vehicles',
          selectVariants: ['*'],
        },
        {
          tableName: 'drivers',
          jsonKey: 'drivers',
          selectVariants: ['*'],
        },
        {
          tableName: 'maintenance_logs',
          // Backup key name requested by the user
          jsonKey: 'odometer_logs',
          selectVariants: ['*', 'id,vehicle_id,service_date,service_type,odometer_reading,garage_name,cost,notes,invoice_url,created_by,created_at'],
        },
        {
          tableName: 'organizations',
          jsonKey: 'organizations',
          selectVariants: ['id,name,updated_at', 'id,name'],
        },
      ];

      const fetchTable = async (tableName: string, jsonKey: string, selectVariants: string[]) => {
        console.log(`[Backup] Start table '${tableName}' (jsonKey='${jsonKey}')`);
        let lastErrorMessage = '';

        for (const select of selectVariants) {
          console.log(`[Backup] Attempt fetch '${tableName}' with select(${select})`);
          try {
            const { data, error } = await (supabase as any).from(tableName).select(select);
            if (error) {
              lastErrorMessage = typeof error?.message === 'string' ? error.message : JSON.stringify(error);
              console.log(`[Backup] Failed '${tableName}' select(${select})`, error);
              continue;
            }

            const rows = Array.isArray(data) ? data : data ? [data] : [];
            backupPayload[jsonKey] = rows;
            includedParts.push(jsonKey);
            console.log(`[Backup] Success '${tableName}' rows=${rows.length}`);
            return;
          } catch (e) {
            lastErrorMessage = e instanceof Error ? e.message : String(e);
            console.log(`[Backup] Exception '${tableName}' select(${select})`, e);
            continue;
          }
        }

        const reason = lastErrorMessage
          ? `All select variants failed. Last error: ${lastErrorMessage}`
          : `All select variants failed: ${selectVariants.join(' | ')}`;

        failures[tableName] = reason;
        skippedParts.push(jsonKey);
        console.log(`[Backup] Giving up '${tableName}' (jsonKey='${jsonKey}'):`, reason);
      };

      for (const s of tableStrategies) {
        await fetchTable(s.tableName, s.jsonKey, s.selectVariants);
      }

      return { backupPayload, includedParts, skippedParts, failures };
    };

    const backupSettings = async () => {
      setIsBackingUpSettings(true);
      try {
        const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        const { backupPayload, includedParts, skippedParts, failures } = await fetchBackupPayload();
        const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `fleet_manager_backup_${dateStr}.json`;
        a.click();

        URL.revokeObjectURL(url);

        if (includedParts.length === 0) {
          const failedList = Object.entries(failures)
            .map(([tableName, reason]) => `${tableName}: ${reason}`)
            .join(' | ');
          toast.error(`Error: גיבוי נכשל (לא ניתן לקרוא אף טבלה). ${failedList}`);
        } else if (skippedParts.length > 0) {
          toast.success(`Success: גיבוי ירד למחשב. הושמטו: ${skippedParts.join(', ')}`);
          const failedList = Object.entries(failures)
            .map(([tableName, reason]) => `${tableName}: ${reason}`)
            .join(' | ');
          if (failedList) toast.error(`Failures: ${failedList}`);
        } else {
          toast.success('Success: גיבוי ירד למחשב');
        }
      } catch (err) {
        console.error(err);
        toast.error('Error: גיבוי ההגדרות נכשל');
      } finally {
        setIsBackingUpSettings(false);
      }
    };

    const checkForUpdates = async () => {
      setIsCheckingUpdates(true);
      try {
        type VersionManifest = { version: string; releaseDate?: string; changes?: unknown };

        // חייב להתאים לגרסה שבאמת רצה בדפדפן (מהבילד), לא ל-appVersion מ-localStorage —
        // אחרת מופיע מודאל עדכון למרות שהמסך כבר מציג את codeVersion מהבילד.
        const picked = await pickLatestVersionManifest(supabase as any, getTestStaticManifestUrl());
        if (!picked) throw new Error('לא ניתן לטעון מניפסט גרסה (ענן או v-dev-only.json)');

        const latestManifest = picked.manifest as Partial<VersionManifest>;
        const manifestChanges = parseManifestChanges(latestManifest);

        const latestVersion = latestManifest?.version ? String(latestManifest.version) : '';
        if (!latestVersion) throw new Error('Latest manifest missing "version"');

        const latestNormalized = normalizeVersion(latestVersion);
        const currentNormalized = normalizeVersion(codeVersion);

        // אם הגרסה מהשרת זהה לגרסה הנוכחית בבילד — לסגור את מודאל ה-PWA.
        if (latestNormalized === currentNormalized) {
          hidePwaUpdateModal();
          toast.success("אין עדכונים זמינים כרגע");
        } else {
          const cmp = compareSemver(latestNormalized, currentNormalized);
          if (cmp > 0) {
            try {
              showPwaUpdateModal({
                targetVersion: latestNormalized,
                changes: manifestChanges,
              });
            } catch (e) {
              console.warn("showPwaUpdateModal failed", e);
            }
            toast.success(`זמינה גרסה ${latestNormalized}. אשר עדכון בחלון שמופיע`);
          } else {
            hidePwaUpdateModal();
            toast.success("אין עדכונים זמינים כרגע");
          }
        }
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
        toast.error(`בדיקת עדכונים נכשלה: ${message}`);
      } finally {
        // במקור (ייצור): רק מודאל + אישור "עדכן עכשיו" — לא מושכים עדכון SW ברקע מכפתור זה
        if (!isFleetProductionHost()) {
          try {
            await triggerServiceWorkerUpdateCheck();
          } catch (swErr) {
            console.warn('triggerServiceWorkerUpdateCheck:', swErr);
          }
        }
        setIsCheckingUpdates(false);
      }
    };

    const formatReleaseDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const formatReleaseTime = (d: Date) => {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    };

    /** שורות צ׳יינג׳לוג מהטקסט במודאל — ללא שורות ריקות */
    const parseChangelogLines = (raw: string): string[] =>
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    /**
     * מניפסט מלא ל-Supabase (jsonb) — שדות קבועים בלבד כדי למנוע 400 / ערכים לא צפויים ממיזוג ישן.
     * כולל: version, changes, releaseDate, releaseTime, publishedAt, timestamp, description, changelog
     */
    const buildManifestForPublish = (
      versionInput: string,
      changesLines: string[],
      releaseDate: string,
      releaseTime: string,
      description: string,
      publishedAtIso: string
    ): Record<string, unknown> => {
      const version =
        normalizeVersion(versionInput).trim() || String(versionInput).trim();
      const changes = changesLines
        .map((c) => String(c).trim())
        .filter((c) => c.length > 0);
      const changelogFull = changes.join('\n');
      const payload = {
        version,
        changes,
        releaseDate,
        releaseTime,
        publishedAt: publishedAtIso,
        /** מזהה זמן פרסום (מקור אמת לעדכון) */
        timestamp: publishedAtIso,
        description: String(description),
        changelog: changelogFull,
      };
      return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    };

    const openPublishModal = async () => {
      setIsPublishing(false);
      try {
        const staticManifestUrl = getTestStaticManifestUrl();

        const fromDbOnly = await fetchVersionManifestFromDb(supabase as any);
        const dbVer =
          typeof fromDbOnly?.version === 'string' && fromDbOnly.version.trim()
            ? fromDbOnly.version.trim()
            : '';
        setPublishDiffSupabaseVersion(dbVer);

        const picked = await pickLatestVersionManifest(supabase as any, staticManifestUrl);
        const manifestJson = picked?.manifest ?? {};

        // רק Supabase — ללא pending_changes.json מקומי
        const changes = (await fetchPendingChangesFromDb(supabase as any)) ?? [];

        const publishedLinesRaw = parseManifestChanges(manifestJson);
        const pendingLines = Array.isArray(changes) ? changes.map((x) => String(x).trim()).filter(Boolean) : [];
        const isProHost = isFleetManagerProHostname();
        const publishedLines = stripFleetStagingOnlyLinesForProHostname(publishedLinesRaw, isProHost);
        const omitProDefaults = isProHost ? getFleetUiTokensExcludedFromProPublishDefaults() : undefined;
        setPublishManifestCarryLines(publishedLines);
        const pendingOnly = buildPendingOnlyPublishCandidates(pendingLines, publishedLines, {
          omitDefaultTokens: omitProDefaults,
          isProPublishHost: isProHost,
        });
        /** ברירת מחדל: תמיד patch+1 על גרסת הבנדל (לא גרסת הבנדל עצמה) */
        const bundleCanonical =
          toCanonicalThreePartVersion(normalizeVersion(codeVersion)) ||
          normalizeVersion(codeVersion).trim() ||
          codeVersion.trim();
        const versionDefault = computeNextPatchVersion(bundleCanonical || '0.0.0');
        setPublishNextVersion(versionDefault);
        setPublishVersionInput(versionDefault);
        setPublishPendingCandidates(pendingOnly);
        setPublishCandidateSelected(pendingOnly.map(() => true));
        setPublishExtraChangelogLines('');

        if (pendingOnly.length === 0 && publishedLines.length === 0) {
          toast.message('אין pending ואין מניפסט קודם — השתמש בשדה «שורות נוספות» או פרסם לאחר הוספת שורות.');
        }

        if (isProHost && publishedLinesRaw.length > publishedLines.length) {
          toast.message('שורות דיבוג/staging הוסרו מרשימת הפרסום — בפרודקשן אי אפשר לפרסם אותן.');
        }

        setIsPublishConfirmOpen(true);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
        toast.error(`שגיאה בטעינת נתוני הפרסום: ${message}`);
      }
    };

    const publishRelease = async () => {
      const versionFinal = publishVersionInput.trim() || publishNextVersion.trim();
      const isProPublish = isFleetManagerProHostname();

      const carried = publishManifestCarryLines
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0);
      const selectedNew = publishPendingCandidates
        .filter((_line, i) => publishCandidateSelected[i] === true)
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0);
      const extra = parseChangelogLines(publishExtraChangelogLines);
      /** בפרודקשן: מסננים ידנית שורות DEBUG/staging — לא נכנסות למניפסט */
      const mergedBeforeProStrip = mergeUniquePendingChangeLines(
        mergeUniquePendingChangeLines(carried, selectedNew),
        extra
      );
      const changesFinal = stripFleetStagingOnlyLinesForProHostname(mergedBeforeProStrip, isProPublish);

      if (isProPublish && mergedBeforeProStrip.length > changesFinal.length) {
        toast.message('שורות דיבוג / staging הוסרו — בפרודקשן לא נשמרות במניפסט.');
      }

      if (!String(versionFinal).trim()) {
        toast.error('נא להזין מספר גרסה (כל מחרוזת לא ריקה, למשל 2.6.2).');
        return;
      }
      if (changesFinal.length === 0) {
        toast.error('חסרה רשימת שינויים — סמן לפחות שורה אחת או הזן טקסט בצ׳יינג׳לוג.');
        return;
      }

      setIsPublishConfirmOpen(false);
      setIsPublishProgressOpen(true);
      setIsPublishing(true);
      setPublishProgressValue(0);
      setPublishProgressStage('מכין פרסום...');

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        setPublishProgressStage('מכין מניפסט גרסה...');
        setPublishProgressValue(35);
        await sleep(200);

        const now = new Date();
        const publishedAtIso = now.toISOString();
        const releaseDate = formatReleaseDate(now);
        const releaseTime = formatReleaseTime(now);
        const description = `Release: ${versionFinal}. ${changesFinal.slice(0, 5).join(' | ')}${changesFinal.length > 5 ? '...' : ''}`;

        const newManifest = buildManifestForPublish(
          versionFinal,
          changesFinal,
          releaseDate,
          releaseTime,
          description,
          publishedAtIso
        );

        if (
          typeof newManifest.version !== 'string' ||
          !String(newManifest.version).trim() ||
          !Array.isArray(newManifest.changes) ||
          newManifest.changes.length === 0
        ) {
          throw new Error('Missing version or changes');
        }

        const versionCanonical = String(newManifest.version).trim();

        const existingPendingRaw = (await fetchPendingChangesFromDb(supabase as any)) ?? [];
        const existingPending = existingPendingRaw.map((x) => String(x).trim()).filter((s) => s.length > 0);
        const prunedPublishedTokens = removePendingLinesPublishedInChanges(existingPending, changesFinal);

        /** pending: מסירים שורות שטוקן שלהן פורסם; ממזגים עם פריטים שלא סומנו במודאל (טסט) */
        let pendingChangesPayload: { changes: string[] };
        if (isFleetManagerTestHost()) {
          const uncheckedFromModal = publishPendingCandidates
            .filter((_line, i) => publishCandidateSelected[i] !== true)
            .map((s) => String(s).trim())
            .filter((s) => s.length > 0);
          pendingChangesPayload = {
            changes: mergeUniquePendingChangeLines(prunedPublishedTokens, uncheckedFromModal),
          };
        } else {
          pendingChangesPayload = { changes: prunedPublishedTokens };
        }

        setPublishProgressStage('שומר מניפסט בענן (Supabase)...');
        setPublishProgressValue(45);
        await sleep(150);

        // פרסום → רק system_settings (ללא הורדות קבצים)
        const rows = [
          { key: 'version_manifest', value: newManifest },
          { key: 'app_version', value: versionCanonical },
          { key: 'last_update_date', value: publishedAtIso },
          { key: 'pending_changes', value: pendingChangesPayload },
        ];

        await upsertSystemSettingsRows(supabase as any, rows);
        const verify = await verifyPublishWrittenToSupabase(supabase as any, versionCanonical);
        if (!verify.ok) {
          console.error('verifyPublishWrittenToSupabase', verify.message);
          throw new Error(verify.message);
        }

        try {
          localStorage.setItem('fleet-manager-app_version', versionCanonical);
          localStorage.setItem('fleet-manager-last_update_date_iso', publishedAtIso);
          const ackCanon =
            toCanonicalThreePartVersion(normalizeVersion(versionCanonical)) ||
            normalizeVersion(versionCanonical);
          localStorage.setItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY, ackCanon);
          window.dispatchEvent(new Event(FLEET_PRO_ACK_VERSION_UPDATED_EVENT));
        } catch {
          // ignore quota / private mode
        }
        clearFleetProUpdateModalSuppressFlag();
        hidePwaUpdateModal();
        setAppVersion(versionCanonical);
        setLatestManifestVersion(versionCanonical);

        setPublishProgressStage('מסיים...');
        setPublishProgressValue(90);
        await sleep(200);

        setPublishProgressStage('בוצע!');
        setPublishProgressValue(100);
        toast.success(
          isFleetManagerTestHost()
            ? `הגרסה ${versionCanonical} נשמרה ב-Supabase (version_manifest). הדף יתרענן.`
            : `הגרסה ${versionCanonical} נשמרה ב-Supabase תחת version_manifest — מקור האמת בענן.`
        );

        setIsPublishProgressOpen(false);
        setPublishExtraChangelogLines('');
        setPublishManifestCarryLines([]);
        setPublishPendingCandidates([]);
        setPublishCandidateSelected([]);

        if (isFleetManagerTestHost()) {
          window.setTimeout(() => {
            window.location.reload();
          }, 600);
        }
      } catch (e) {
        console.error(e);
        let message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
        if (message === 'Missing version or changes') {
          message = 'חסרה גרסה או רשימת שינויים — נא למלא את השדות במודאל.';
        }
        toast.error(`פרסום נכשל: ${message}`);
        setIsPublishProgressOpen(false);
      } finally {
        setIsPublishing(false);
      }
    };

    const isValidFleetManagerBackup = (value: unknown): value is { metadata: { appIdentifier: string } } => {
      if (!value || typeof value !== 'object') return false;
      const obj = value as any;
      return obj?.metadata?.appIdentifier === 'fleet-manager-pro';
    };

    const inferOnConflict = (rows: any[] | null | undefined): string | undefined => {
      if (!rows || rows.length === 0) return undefined;
      const first = rows[0];
      if (!first || typeof first !== 'object') return undefined;
      const keys = Object.keys(first);
      if (keys.includes('id')) return 'id';
      if (keys.includes('key')) return 'key';
      return undefined;
    };

    const restoreSettingsFromFile = async (file: File) => {
      setIsRestoringSettings(true);
      try {
        const raw = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          toast.error('Error: קובץ ה-JSON אינו תקין');
          return;
        }

        if (!isValidFleetManagerBackup(parsed)) {
          toast.error('Error: קובץ הגיבוי אינו תקין (metadata.appIdentifier לא תקין). בצע גיבוי חדש מהמערכת.');
          return;
        }

        const backup = parsed as any;

        const restoredParts: string[] = [];
        const failedParts: string[] = [];

        const tryUpsertTable = async (tableName: string, rows: unknown) => {
          if (!Array.isArray(rows) || rows.length === 0) return;
          try {
            const rowsArr = rows as any[];
            let conflictTarget: string | undefined;
            if (tableName === 'maintenance_logs') conflictTarget = 'id';
            if (tableName === 'organizations') conflictTarget = 'id';
            if (tableName === 'vehicles') conflictTarget = 'id';
            if (tableName === 'drivers') conflictTarget = 'id';
            if (!conflictTarget) conflictTarget = inferOnConflict(rowsArr) ?? undefined;

            const upsertResult = conflictTarget
              ? await (supabase as any).from(tableName).upsert(rowsArr, { onConflict: conflictTarget })
              : await (supabase as any).from(tableName).upsert(rowsArr);

            if ((upsertResult as any)?.error) throw (upsertResult as any).error;
            restoredParts.push(tableName);
          } catch (e) {
            console.error(`restoreSettingsFromFile: failed ${tableName}`, e);
            failedParts.push(tableName);
          }
        };

        // Restore only the tables that Backup exports.
        await tryUpsertTable('vehicles', backup.vehicles);
        await tryUpsertTable('drivers', backup.drivers);
        await tryUpsertTable('maintenance_logs', backup.odometer_logs);
        await tryUpsertTable('organizations', backup.organizations);

        if (restoredParts.length > 0) {
          toast.success('ההגדרות שוחזרו בהצלחה! מרענן את העמוד...');
          toast.success(`שוחזרו בהצלחה: ${restoredParts.join(', ')}`);
          setTimeout(() => window.location.reload(), 700);
        } else {
          toast.error('Error: לא שוחזרו נתונים');
        }

        if (failedParts.length > 0) {
          toast.error(`שגיאה בשחזור עבור: ${failedParts.join(', ')}`);
        }
      } catch (err) {
        console.error(err);
        toast.error('Error: שחזור ההגדרות נכשל');
      } finally {
        setIsRestoringSettings(false);
      }
    };

    const handleRestoreButtonClick = () => {
      restoreInputRef.current?.click();
    };

    const handleRestoreFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Clear value so picking the same file again triggers change event.
      e.target.value = '';
      await restoreSettingsFromFile(file);
    };

   return (
     <div className="min-h-screen bg-[#020617] text-white">
       <header className="bg-card border-b border-border sticky top-0 z-10">
         <div className="container py-4">
           <div className="flex items-center gap-3">
             <Link to="/">
               <Button variant="ghost" size="icon">
                 <ArrowRight className="h-5 w-5" />
               </Button>
             </Link>
             <div className="flex items-center gap-2">
               <Settings className="h-5 w-5" />
               <h1 className="font-bold text-xl">הגדרות מנהל</h1>
             </div>
           </div>
         </div>
       </header>
 
       <main className="container py-6 space-y-6">
         {/* Pricing Data Uploader */}
          <PricingDataUploader />

          {/* Fleet Data Importer */}
          <FleetDataImporter />

          {/* Notification Emails — system_settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Mail className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <CardTitle>כתובות מייל לקבלת התראות</CardTitle>
                  <CardDescription>
                    כל הכתובות ברשימה יקבלו עותק של הודעות מסירת רכב, החזרה ואשף המסירה הדיגיטלי.
                    הפרד בין כתובות בפסיק או שורה חדשה.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingEmails ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  טוען הגדרות...
                </div>
              ) : (
                <>
                  <Textarea
                    value={notificationEmailsRaw}
                    onChange={(e) => setNotificationEmailsRaw(e.target.value)}
                    placeholder={"admin@company.com, fleet@company.com"}
                    dir="ltr"
                    rows={3}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    כתובות תקינות זוהו:{' '}
                    <strong>
                      {notificationEmailsRaw
                        .split(/[\n,]+/)
                        .map((e) => e.trim())
                        .filter((e) => e.includes('@')).length}
                    </strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={saveNotificationEmails} disabled={isSavingEmails}>
                      {isSavingEmails ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />שומר...</> : 'שמור רשימת מיילים'}
                    </Button>
                    <Button variant="outline" onClick={sendTestEmail} disabled={isSendingTestEmail}>
                      {isSendingTestEmail ? 'שולח...' : 'בדיקת שליחה'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Display Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Monitor className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <CardTitle>הגדרות תצוגה</CardTitle>
                  <CardDescription>בחר בין מצב כהה (קיימי) למצב בהיר. הבחירה נשמרת בקשיית הדפדפן.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    theme === 'dark'
                      ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300'
                      : 'border-border bg-secondary/50 text-muted-foreground hover:border-cyan-400/50'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  מצב כהה
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    theme === 'light'
                      ? 'border-amber-400 bg-amber-500/15 text-amber-400'
                      : 'border-border bg-secondary/50 text-muted-foreground hover:border-amber-400/50'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  מצב בהיר
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                מצב פעיל כעת: <strong>{theme === 'dark' ? 'כהה 🌙' : 'בהיר ☀️'}</strong>
              </p>
            </CardContent>
          </Card>

          {showUserVersionsTable ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                      <Users className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <CardTitle>User Status &amp; Versions</CardTitle>
                      <CardDescription>
                        גרסת בנדל אחרונה שדווחה (heartbeat) מול מניפסט נוכחי:{' '}
                        <code className="text-xs">{latestManifestVersion}</code>. אזהרה צהובה אם המשתמש מאחור.
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          «ניהול הרשאות»: טוקנים ב־<code className="text-[10px]">profiles.allowed_features</code> — בנוסף
                          למניפסט הגלובלי, בלי לשנות גרסה או מודאל עדכון לאחרים.
                        </span>
                        {isFleetProDomain ? (
                          <span className="mt-1 block text-[11px] text-amber-600/90">
                            בייצור (fleet-manager-pro.com / www): מוצג רק כשהטוקן
                            UI_FEATURE_DEBUG_ADMIN_USER_VERSIONS_TABLE מופיע במניפסט.
                          </span>
                        ) : null}
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadUserVersions()}
                    disabled={userVersionLoading}
                  >
                    {userVersionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 ml-2" />
                    )}
                    רענן
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto px-1 sm:px-2">
                {userVersionLoading && userVersionRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-4 py-2">טוען…</p>
                ) : userVersionRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-4 py-2">אין רשומות או אין הרשאת צפייה בכל ה-profiles.</p>
                ) : (
                  <Table className="w-full min-w-[880px] table-fixed border-collapse text-sm caption-bottom [&_th]:h-auto [&_th]:py-3 [&_td]:py-3">
                    <colgroup>
                      <col style={{ width: '26%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '200px' }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className="px-3 sm:px-4 text-start align-bottom font-semibold whitespace-normal min-w-0">
                          אימייל
                        </TableHead>
                        <TableHead className="px-3 sm:px-4 text-start align-bottom font-semibold whitespace-normal min-w-0">
                          גרסה נוכחית
                        </TableHead>
                        <TableHead className="px-3 sm:px-4 text-start align-bottom font-semibold whitespace-normal min-w-0">
                          יעד עדכון (אופציונלי)
                        </TableHead>
                        <TableHead className="px-3 sm:px-4 text-start align-bottom font-semibold whitespace-nowrap min-w-0">
                          עדכון אחרון (seen)
                        </TableHead>
                        <TableHead className="px-2 sm:px-3 text-center align-bottom font-semibold whitespace-nowrap min-w-0 w-[200px]">
                          פעולות
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userVersionRows.map((row) => {
                        const warn = isUserVersionBehindManifest(row.current_app_version, latestManifestVersion);
                        return (
                          <TableRow key={row.id} className="border-b">
                            <TableCell className="px-3 sm:px-4 text-start align-top font-medium min-w-0">
                              <span className="block truncate" title={row.email ?? row.id}>
                                {row.email ?? row.id.slice(0, 8)}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 sm:px-4 text-start align-top min-w-0">
                              <span className="inline-flex items-start gap-1.5 min-w-0">
                                {warn ? (
                                  <AlertTriangle
                                    className="h-4 w-4 shrink-0 text-amber-500 mt-0.5"
                                    aria-label="גרסה מיושנת מול המניפסט"
                                  />
                                ) : null}
                                <span className="min-w-0 break-all text-xs sm:text-sm">
                                  {row.current_app_version?.trim() || '—'}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="px-3 sm:px-4 text-start align-top text-muted-foreground text-xs min-w-0 break-words">
                              {row.target_version?.trim() || '—'}
                            </TableCell>
                            <TableCell className="px-3 sm:px-4 text-start align-top text-muted-foreground text-xs whitespace-nowrap min-w-0">
                              {row.updated_at
                                ? formatDateTimeForUi(new Date(row.updated_at))
                                : '—'}
                            </TableCell>
                            <TableCell className="px-2 sm:px-3 align-top w-[200px] max-w-[200px]">
                              <div className="flex flex-col gap-2 items-stretch">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled
                                  title="מומלץ «ניהול הרשאות»: שמירה שם מקפיצה גרסה גלובלית (+1) ומפעילה עדכון אצל המשתמש. כפתור זה מנוטרל כדי למנוע כפילות."
                                  className="h-auto min-h-8 py-2 gap-1.5 text-[11px] sm:text-xs font-medium inline-flex items-center justify-center text-center leading-snug px-2 opacity-55 cursor-not-allowed"
                                >
                                  <Send className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                                  <span className="break-words">גרסה ממוקדת (לא בשימוש)</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-auto min-h-8 py-2 gap-1.5 text-[11px] sm:text-xs font-medium inline-flex items-center justify-center text-center leading-snug border-primary/25 hover:bg-primary/5 px-2"
                                  onClick={() => void openUserPermissionsModal(row)}
                                >
                                  <UserCog className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                  <span className="break-words">ניהול הרשאות</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Dialog
            key={userPermissionsRow?.id ?? 'fleet-permissions-closed'}
            open={userPermissionsRow !== null}
            onOpenChange={(open) => {
              if (!open) {
                if (userPermissionsSaving || userPermissionsLoadingFresh) return;
                closeUserPermissionsModal();
              }
            }}
          >
            <DialogContent
              dir="rtl"
              className="sm:max-w-lg max-h-[85vh] flex flex-col"
              onPointerDownOutside={(e) => {
                if (userPermissionsSaving || userPermissionsLoadingFresh) e.preventDefault();
              }}
              onEscapeKeyDown={(e) => {
                if (userPermissionsSaving || userPermissionsLoadingFresh) e.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>ניהול הרשאות UI</DialogTitle>
                <DialogDescription className="text-start">
                  <strong>V (מסומן)</strong> = פעיל לפי מניפסט גלובלי או <code className="text-xs">allowed_features</code>.
                  ביטול על טוקן Globe נשמר ב־<code className="text-xs">denied_features</code> (jsonb). תאימות לאחור: גם{' '}
                  <code className="text-xs">!TOKEN</code> ב־allowed נקרא כחסימה. טעינה: מניפסט + פרופיל מ-Supabase.
                </DialogDescription>
                <p className="text-[11px] text-start rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-950 dark:text-cyan-100/95 px-3 py-2 mt-2 leading-snug">
                  <strong>שמור הרשאות</strong> מעדכן רק את המשתמש ב־<code className="text-[10px]">profiles</code> —{' '}
                  <strong>ללא שינוי גרסה גלובלית</strong> ב־<code className="text-[10px]">system_settings</code>. נשמר
                  עוגן פרטי ב־<code className="text-[10px]">ui_denied_features_anchor_version</code> (פורמט{' '}
                  <code className="text-[10px]">גרסה_גלובלית-p…</code>) עד שהמשתמש מאשר «עדכן עכשיו». אם שמרת על{' '}
                  <strong>עצמך</strong>, הדף יתרענן אוטומטית לאחר הסנכרון.
                </p>
              </DialogHeader>
              {userPermissionsRow ? (
                <div className="space-y-3 text-sm overflow-y-auto flex-1 pe-1 relative min-h-[120px]">
                  {userPermissionsLoadingFresh ? (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md bg-background/80 backdrop-blur-[2px]"
                      aria-busy="true"
                      aria-live="polite"
                    >
                      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                      <span className="text-xs text-muted-foreground">טוען הרשאות נוכחיות מהשרת…</span>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">משתמש</span>
                    <span className="font-medium break-all">{userPermissionsRow.email ?? userPermissionsRow.id}</span>
                  </div>
                  {userPermissionsFreshHint ? (
                    <p className="text-[11px] text-amber-800/95 dark:text-amber-400/95 rounded-md border border-amber-500/35 bg-amber-500/10 p-2">
                      {userPermissionsFreshHint}
                    </p>
                  ) : null}
                  {!userPermissionsLoadingFresh &&
                  !isFleetProDomain &&
                  permissionModalStagingDisabledOnTest.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        טוקני Staging / debug (צפייה בלבד בטסט — לא נשמרים מכאן)
                      </p>
                      <ul className="space-y-2.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/25 p-3">
                        {permissionModalStagingDisabledOnTest.map(({ token, line }) => {
                          const inDb = parseProfileAllowedFeatureTokens(
                            userPermissionsRow.allowed_features
                          ).has(token);
                          const fromGlobal = permissionModalGlobalTokenSet.has(token);
                          const stagingChecked = fromGlobal || inDb;
                          return (
                            <li key={`perm-staging-${token}`} className="flex gap-2 items-start opacity-80">
                              <Checkbox
                                id={`perm-ui-staging-${token}`}
                                checked={stagingChecked}
                                disabled
                                aria-readonly
                              />
                              <label
                                htmlFor={`perm-ui-staging-${token}`}
                                className="text-sm leading-snug flex-1 min-w-0 cursor-not-allowed"
                              >
                                <span className="block break-words">{line}</span>
                                <span className="block text-[10px] text-muted-foreground mt-1">
                                  מופעל רק דרך מניפסט בפרו / טסט; לא ניתן לעדכן מכאן.
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {!userPermissionsLoadingFresh ? (
                    <>
                      <p className="text-xs font-semibold text-foreground">טוקנים הניתנים לעריכה</p>
                      <ul className="space-y-2.5 rounded-md border border-border bg-muted/20 p-3">
                        {permissionModalEditableCandidates.map(({ token, line }) => {
                          const isGlobal = permissionModalGlobalTokenSet.has(token);
                          const checked = userPermissionsSelections[token] ?? false;
                          return (
                            <li key={token} className="flex gap-2 items-start">
                              <div className="flex items-start gap-1 shrink-0 pt-0.5">
                                <Checkbox
                                  id={`perm-ui-${token}`}
                                  checked={checked}
                                  disabled={false}
                                  onCheckedChange={(v) => {
                                    setUserPermissionsSelections((prev) => ({
                                      ...prev,
                                      [token]: v === true,
                                    }));
                                  }}
                                />
                                {isGlobal ? (
                                  <span title="קיים במניפסט הגלובלי — ניתן לחסום למשתמש זה" className="inline-flex mt-0.5">
                                    <Globe
                                      className="h-3.5 w-3.5 shrink-0 text-primary/85"
                                      aria-hidden
                                    />
                                  </span>
                                ) : null}
                              </div>
                              <label
                                htmlFor={`perm-ui-${token}`}
                                className="text-sm leading-snug flex-1 min-w-0 cursor-pointer"
                              >
                                <span className="block break-words">{line}</span>
                                {isGlobal ? (
                                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                                    מניפסט גלובלי — ביטול סימון מוסיף את הטוקן ל־<code className="text-[10px]">denied_features</code>.
                                  </span>
                                ) : null}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-0 mt-2 shrink-0">
                <Button
                  variant="outline"
                  type="button"
                  onClick={closeUserPermissionsModal}
                  disabled={userPermissionsSaving || userPermissionsLoadingFresh}
                >
                  ביטול
                </Button>
                <Button
                  type="button"
                  onClick={() => void submitUserPermissions()}
                  disabled={userPermissionsSaving || userPermissionsLoadingFresh}
                  className="gap-2"
                >
                  {userPermissionsSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                      שומר…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      שמור הרשאות
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* System Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>מידע מערכת</CardTitle>
                  <CardDescription>
                    Fleet Manager Pro — גרסת בנדל (מהקוד המפורסם){' '}
                    <span className={codeVersion === latestManifestVersion ? 'text-[#10b981]' : undefined}>
                      {codeVersion}
                    </span>
                    <span className="text-muted-foreground text-xs block mt-1">
                      מניפסט אחרון (ענן / v-dev-only): {latestManifestVersion}
                    </span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">טעינת קובץ משרד התחבורה אחרונה:</span>
                  <span className="font-medium">{formatDate(lastPricingUpload)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">טעינת רכבים אחרונה:</span>
                  <span className="font-medium">{formatDate(lastVehicleUpload)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">טעינת נהגים אחרונה:</span>
                  <span className="font-medium">{formatDate(lastDriverUpload)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">תאריך עדכון אחרון:</span>
                  <span className="font-medium">{lastUpdateDate}</span>
                </div>
              </div>
              <div className="pt-3 border-t border-border mt-3 space-y-3">
                <Button variant="outline" size="sm" onClick={runPrintTest}>
                  בדיקת הדפסה
                </Button>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={backupSettings} disabled={isBackingUpSettings}>
                    {isBackingUpSettings ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Download className="h-4 w-4 ml-2" />
                    )}
                    גיבוי הגדרות
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestoreButtonClick}
                    disabled={isRestoringSettings || isBackingUpSettings}
                  >
                    {isRestoringSettings ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <RotateCcw className="h-4 w-4 ml-2" />
                    )}
                    שחזור הגדרות
                  </Button>
                  <Button variant="outline" size="sm" onClick={checkForUpdates} disabled={isCheckingUpdates}>
                    {isCheckingUpdates ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 ml-2" />
                    )}
                    בדוק עדכונים
                  </Button>
                  {showDevTools && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openPublishModal}
                      disabled={
                        isCheckingUpdates ||
                        isBackingUpSettings ||
                        isRestoringSettings ||
                        isPublishing
                      }
                    >
                      פרסם גרסה חדשה
                    </Button>
                  )}
                </div>

                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleRestoreFilePicked}
                />
              </div>
            </CardContent>
          </Card>

          {showDevTools && (
            <>
              {/* Publish Version Confirm Modal */}
              <Dialog open={isPublishConfirmOpen} onOpenChange={setIsPublishConfirmOpen}>
                <DialogContent dir="rtl" className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>פרסום גרסה חדשה</DialogTitle>
                    <DialogDescription className="space-y-2">
                      <span className="block">
                        נשמר ב־<code className="text-xs">system_settings</code>. כל השורות שכבר ב־
                        <code className="text-xs">version_manifest.changes</code> ממוזגות אוטומטית לגרסה החדשה (ללא צ'קבוקס).
                        סמן כאן רק <strong>שינויים ממתינים (pending)</strong> שטרם פורסמו. לאחר פרסום, מה שנבחר עובר למניפסט
                        ונמחק מ־pending.
                      </span>
                      {isFleetManagerProHostname() ? (
                        <span className="block text-xs text-amber-700/90 dark:text-amber-400/90">
                          בייצור: טוקני דיבוג/staging לא נכנסים למניפסט — מוצגים למטה כמידע בלבד.
                        </span>
                      ) : null}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 max-h-[70vh] overflow-y-auto pe-1">
                    {isFleetManagerTestHost() ? (
                      <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-sm">
                        <p className="font-semibold text-foreground">השוואת גרסאות (Diff)</p>
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-muted-foreground">גרסת בנדל (הפריסה הנוכחית)</span>
                          <code className="font-mono text-xs bg-background px-2 py-0.5 rounded">{codeVersion}</code>
                        </div>
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-muted-foreground">גרסה אחרונה ב־Supabase</span>
                          <code className="font-mono text-xs bg-background px-2 py-0.5 rounded">
                            {publishDiffSupabaseVersion || '— אין מניפסט'}
                          </code>
                        </div>
                        {publishDiffSupabaseVersion ? (
                          <p className="text-xs text-muted-foreground">
                            {compareSemver(codeVersion, publishDiffSupabaseVersion) > 0
                              ? 'הבנדל חדש יותר מהרשומה בענן — פרסום יעדכן את מקור האמת.'
                              : compareSemver(codeVersion, publishDiffSupabaseVersion) < 0
                                ? 'בענן רשומה גרסה גבוהה מהבנדל — ודא שהפריסה מסונכרנת.'
                                : 'מספרי גרסה תואמים בין בנדל לענן (semver).'}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">שינויים ממתינים לפרסום (Pending)</span>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                setPublishCandidateSelected(publishPendingCandidates.map(() => true))
                              }
                            >
                              בחר הכל
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                setPublishCandidateSelected(publishPendingCandidates.map(() => false))
                              }
                            >
                              נקה
                            </Button>
                          </div>
                        </div>
                        {publishPendingCandidates.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            אין מועמדים חדשים — פיצ'רים שכבר פורסמו לא מופיעים כאן.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {publishPendingCandidates.map((line, i) => (
                              <li key={`pend-${i}-${line.slice(0, 24)}`} className="flex gap-2 items-start">
                                <Checkbox
                                  id={`publish-pending-${i}`}
                                  checked={publishCandidateSelected[i] === true}
                                  onCheckedChange={(v) => {
                                    setPublishCandidateSelected((prev) => {
                                      const next = [...prev];
                                      next[i] = v === true;
                                      return next;
                                    });
                                  }}
                                />
                                <label
                                  htmlFor={`publish-pending-${i}`}
                                  className="text-sm leading-snug cursor-pointer flex-1 min-w-0"
                                >
                                  {line}
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="space-y-1.5 border-t border-border pt-3">
                        <label className="text-sm font-semibold" htmlFor="publish-extra-changelog">
                          שורות נוספות (אופציונלי)
                        </label>
                        <Textarea
                          id="publish-extra-changelog"
                          rows={4}
                          className="text-sm min-h-[80px]"
                          value={publishExtraChangelogLines}
                          onChange={(e) => setPublishExtraChangelogLines(e.target.value)}
                          placeholder={'שורה אחת לכל שינוי — יתווסף למניפסט ביחד עם pending ועם המניפסט הקיים'}
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-dashed border-muted-foreground/35 bg-muted/20 p-3 space-y-2 text-sm">
                      <p className="font-semibold text-foreground" dir="ltr">
                        Staging/Debug Features (Active in Test Only)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        טוקנים אלה פעילים רק בסביבת בדיקה; בפרודקשן לא נשמרים במניפסט ולא מופעלים — רשימה לעיון בלבד.
                      </p>
                      {FLEET_STAGING_DEBUG_INFO_LINES.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <ul className="space-y-1.5 list-disc list-inside text-xs text-muted-foreground">
                          {FLEET_STAGING_DEBUG_INFO_LINES.map((line) => (
                            <li key={line} className="break-words">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold" htmlFor="publish-version-input">
                        מספר גרסה (ברירת מחדל = גרסת בנדל + patch +1)
                      </label>
                      <Input
                        id="publish-version-input"
                        dir="ltr"
                        className="font-mono text-sm"
                        value={publishVersionInput}
                        onChange={(e) => setPublishVersionInput(e.target.value)}
                        placeholder={computeNextPatchVersion(
                          toCanonicalThreePartVersion(normalizeVersion(codeVersion)) ||
                            normalizeVersion(codeVersion).trim() ||
                            '0.0.0'
                        )}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <DialogFooter className="mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsPublishConfirmOpen(false)}
                      disabled={isPublishing}
                    >
                      ביטול
                    </Button>
                    <Button onClick={publishRelease} disabled={isPublishing}>
                      פרסם
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Publish Version Progress Modal */}
              <Dialog
                open={isPublishProgressOpen}
                onOpenChange={(open) => {
                  if (!open && isPublishing) return;
                  setIsPublishProgressOpen(open);
                }}
              >
                <DialogContent dir="rtl" className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>פרסום גרסה</DialogTitle>
                    <DialogDescription>{publishProgressStage}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Progress value={publishProgressValue} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      נשמר ב-Supabase: version_manifest (version, changes, timestamp, changelog). בטסט הדף יתרענן
                      אוטומטית אחרי השמירה.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
       </main>
     </div>
   );
 }