import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
 import { Link } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import {
  ArrowRight,
  Download,
  Loader2,
  Mail,
  Monitor,
  Plus,
  Moon,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Shield,
  Sun,
  Upload,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { getDefaultPermissions } from '@/lib/permissions';
import {
  buildReleaseSnapshotPayload,
  downloadReleaseSnapshotJson,
  EMPTY_FLEET_MANIFEST_UI_GATES,
  getBundledReleaseSnapshot,
} from '@/lib/releaseSnapshot';
import { getSupabaseAnonKey } from '@/integrations/supabase/publicEnv';
import { toast } from 'sonner';
import { version as codeVersion } from '@/constants/version';
import { clearAllBrowserCaches, triggerServiceWorkerUpdateCheck } from '@/lib/pwaServiceWorkerControl';
import {
  hidePwaUpdateModal,
  showPwaUpdateModal,
} from '@/lib/pwaUpdateModalBridge';
import { parseManifestChanges } from '@/lib/pwaManifest';
import {
  pickLatestVersionManifest,
  getTestStaticManifestUrl,
  normalizeVersion,
  compareSemver,
  parseSemverSegments,
  toCanonicalThreePartVersion,
  versionNotOlderThanBundle,
  isFleetManagerProHostname,
} from '@/lib/versionManifest';
import { isFleetProductionHost } from '@/lib/pwaPromptRegister';
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import { createUiSyncBundle } from '@/lib/featureFlagRegistry';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const UI_SYNC_ALLOWED_EMAIL = 'malachiroei@gmail.com';
/** סנכרון release_snapshot — רק לרועי (מופיע ב-localhost וב-staging כמו בכל סביבה שבה הוא מחובר) */
const PROD_RELEASE_SYNC_EMAIL = 'malachiroei@gmail.com';
const UI_SYNC_PROD_REPO = 'malachiroei/fleet-manager-2026';
const UI_SYNC_BUNDLE_PATH = 'ui-sync-bundle.json';

export default function AdminSettingsPage() {
    const { theme, setTheme } = useTheme();
    const queryClient = useQueryClient();
    const { isAdmin, profile, refreshProfile, user, activeOrgId } = useAuth();
    const isFleetProDomain = isFleetManagerProHostname();
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

    const [isPublishingUiSyncBundle, setIsPublishingUiSyncBundle] = useState(false);
    const [pushProdSyncBusy, setPushProdSyncBusy] = useState(false);

    const settingsOrgIdForSnapshot = activeOrgId ?? profile?.org_id ?? null;
    const { data: orgSettingsRow } = useOrgSettings(settingsOrgIdForSnapshot, {
      enabledOnlyWithOrgId: true,
    });
    const manifestUiGates = EMPTY_FLEET_MANIFEST_UI_GATES;

    const canPublishUiToProduction = (user?.email ?? '').trim().toLowerCase() === UI_SYNC_ALLOWED_EMAIL;

    const canShowProdReleaseSyncButton = useMemo(() => {
      const e = (user?.email ?? profile?.email ?? '').trim().toLowerCase();
      return e === PROD_RELEASE_SYNC_EMAIL;
    }, [user?.email, profile?.email]);

    const handlePublishUiUpdatesToProduction = useCallback(async () => {
      const githubToken = String(import.meta.env.VITE_GITHUB_UI_SYNC_TOKEN ?? '').trim();
      if (!githubToken) {
        toast.error('חסר VITE_GITHUB_UI_SYNC_TOKEN בקובץ הסביבה של הטסט');
        return;
      }
      if (!canPublishUiToProduction) {
        toast.error('אין הרשאה להפצת עדכוני UI לפרודקשן');
        return;
      }

      setIsPublishingUiSyncBundle(true);
      try {
        const bundle = createUiSyncBundle(codeVersion);
        const owner = 'malachiroei';
        const repo = 'fleet-manager-2026';
        const branch = 'main';
        const path = UI_SYNC_BUNDLE_PATH;
        const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        };

        let currentSha: string | undefined;
        const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { method: 'GET', headers });
        if (getRes.ok) {
          const getJson = (await getRes.json()) as { sha?: unknown };
          if (typeof getJson.sha === 'string' && getJson.sha.trim()) currentSha = getJson.sha.trim();
        } else if (getRes.status !== 404) {
          const t = await getRes.text();
          throw new Error(`GitHub read failed (${getRes.status}): ${t || 'unknown error'}`);
        }

        const bundleJson = JSON.stringify(bundle, null, 2);
        const base64Content = btoa(unescape(encodeURIComponent(bundleJson)));
        const putBody: {
          message: string;
          content: string;
          branch: string;
          sha?: string;
        } = {
          message: `chore(ui-sync): publish UI bundle ${bundle.ui_version}`,
          content: base64Content,
          branch,
        };
        if (currentSha) putBody.sha = currentSha;

        const putRes = await fetch(apiBase, {
          method: 'PUT',
          headers,
          body: JSON.stringify(putBody),
        });
        if (!putRes.ok) {
          const t = await putRes.text();
          throw new Error(`GitHub upload failed (${putRes.status}): ${t || 'unknown error'}`);
        }

        toast.success(`עודכן ${UI_SYNC_BUNDLE_PATH} ב-${UI_SYNC_PROD_REPO}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'הפצת UI נכשלה';
        toast.error(msg);
      } finally {
        setIsPublishingUiSyncBundle(false);
      }
    }, [canPublishUiToProduction]);

    const handlePushReleaseSnapshotToProd = useCallback(async () => {
      const snapshotOrgId = activeOrgId ?? profile?.org_id ?? null;
      if (!snapshotOrgId) {
        toast.error('בחר ארגון פעיל (מתפריט הארגון) לפני דחיפת סנאפשוט.');
        return;
      }
      const viewer = (user?.email ?? profile?.email ?? '').trim().toLowerCase();
      if (viewer !== PROD_RELEASE_SYNC_EMAIL) {
        toast.error('אין הרשאה לסנכרון זה');
        return;
      }
      setPushProdSyncBusy(true);
      try {
        const snapshot = buildReleaseSnapshotPayload({
          orgId: snapshotOrgId,
          orgSettings: orgSettingsRow ?? null,
          manifestUi: manifestUiGates,
          defaultPermissions: getDefaultPermissions(),
          previousBundledVersion: getBundledReleaseSnapshot().version,
        });
        downloadReleaseSnapshotJson(snapshot);
        toast.info('הקובץ ירד, כעת מנסים לדחוף ל-Git…');

        const sessionRes = await supabase.auth.getSession();
        const bearer = sessionRes?.data?.session?.access_token ?? getSupabaseAnonKey();
        const invokeRes = await supabase.functions.invoke('push-release-snapshot', {
          headers: { Authorization: `Bearer ${bearer}` },
          body: { snapshot },
        });
        const data = invokeRes?.data ?? null;
        const error = invokeRes?.error ?? null;
        const ok = !error && data && typeof data === 'object' && (data as { ok?: boolean }).ok === true;
        if (ok) {
          toast.success('נדחף ל-GitHub — עדכון טפסים/פוליסות/לוגואים בפרו דרך הפריסה הרגילה.');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'דחיפה נכשלה');
      } finally {
        setPushProdSyncBusy(false);
      }
    }, [
      activeOrgId,
      profile?.org_id,
      user?.email,
      profile?.email,
      orgSettingsRow,
      manifestUiGates,
    ]);

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
    /** GitHub: version_snapshot.json (best-effort) — להשוואה מול ה-Timestamp המקומי */
    const [githubSnapshotVersion, setGithubSnapshotVersion] = useState<string>('');
    const [githubSnapshotReleaseDate, setGithubSnapshotReleaseDate] = useState<string>('');
    const [isGithubSnapshotLoading, setIsGithubSnapshotLoading] = useState(false);

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

    /** בדיקת GitHub: משווה נתוני גרסה מול version_snapshot.json (best-effort; ייתכן ריפו פרטי). */
    useEffect(() => {
      void (async () => {
        setIsGithubSnapshotLoading(true);
        try {
          const url =
            `https://raw.githubusercontent.com/malachiroei/fleet-manager-2026/master/src/config/version_snapshot.json?t=${Date.now()}`;
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            setGithubSnapshotVersion('');
            setGithubSnapshotReleaseDate('');
            return;
          }
          const j = (await res.json()) as { version?: unknown; release_date?: unknown };
          setGithubSnapshotVersion(typeof j.version === 'string' ? j.version.trim() : '');
          setGithubSnapshotReleaseDate(typeof j.release_date === 'string' ? j.release_date.trim() : '');
        } catch {
          setGithubSnapshotVersion('');
          setGithubSnapshotReleaseDate('');
        } finally {
          setIsGithubSnapshotLoading(false);
        }
      })();
    }, []);

    const forceManualVersionUpdate = useCallback(async () => {
      try {
        await clearAllBrowserCaches();
      } catch {
        // ignore
      }
      const loc = window.location as Location & { reload?: (forceReload?: boolean) => void };
      try {
        loc.reload?.(true);
        return;
      } catch {
        // ignore
      }
      window.location.reload();
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

          {canShowProdReleaseSyncButton ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  סנכרון הגדרות לפרודקשן
                </CardTitle>
                <CardDescription>
                  יוצר <code className="text-xs">release_snapshot.json</code> מהגדרות הארגון הפעיל, מוריד עותק
                  מקומי, ומנסה לדחוף ל-GitHub דרך Edge Function <code className="text-xs">push-release-snapshot</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={pushProdSyncBusy || !settingsOrgIdForSnapshot}
                      onClick={() => void handlePushReleaseSnapshotToProd()}
                    >
                      {pushProdSyncBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      סנכרון הגדרות לפרודקשן
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm text-center">
                    (עדכון טפסים, פוליסות ולוגואים בפרו)
                  </TooltipContent>
                </Tooltip>
                <p className="text-xs text-muted-foreground">
                  (עדכון טפסים, פוליסות ולוגואים בפרו)
                </p>
              </CardContent>
            </Card>
          ) : null}

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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">version_snapshot.json ב-GitHub:</span>
                  <span className="font-medium" dir="ltr">
                    {isGithubSnapshotLoading
                      ? 'טוען…'
                      : githubSnapshotVersion || githubSnapshotReleaseDate
                        ? `${githubSnapshotVersion || '—'} · ${githubSnapshotReleaseDate || '—'}`
                        : 'לא זמין'}
                  </span>
                </div>
              </div>
              <div className="pt-3 border-t border-border mt-3 space-y-3">
                <Button variant="outline" size="sm" onClick={runPrintTest}>
                  בדיקת הדפסה
                </Button>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void forceManualVersionUpdate()}
                    disabled={isCheckingUpdates || isBackingUpSettings || isRestoringSettings}
                  >
                    עדכון גרסה ידני
                  </Button>
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

       </main>
     </div>
   );
 }