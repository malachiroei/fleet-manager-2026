import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import {
  Loader2,
  Mail,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  Trash2,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useOrgSettings, useUpdateOrgSettings } from '@/hooks/useOrgSettings';
import { getDefaultPermissions } from '@/lib/permissions';
import {
  buildReleaseSnapshotPayload,
  EMPTY_FLEET_MANIFEST_UI_GATES,
  getBundledReleaseSnapshot,
  type ReleaseSnapshotFile,
} from '@/lib/releaseSnapshot';
import {
  buildApplySystemSettingRows,
  computeSyncDiffRows,
  fetchSyncBaselines,
  mergeOrgSettingsFromUpload,
  parseSystemSettingsUpload,
  type SyncDiffRow,
} from '@/lib/settingsSyncReview';
import { upsertSystemSettingsRows } from '@/lib/systemSettingsUpsert';
import { toast } from 'sonner';
import { version as codeVersion } from '@/constants/version';
import { clearAllBrowserCaches, triggerServiceWorkerUpdateCheck } from '@/lib/pwaServiceWorkerControl';
import {
  hidePwaUpdateModal,
  showPwaUpdateModal,
} from '@/lib/pwaUpdateModalBridge';
import { parseManifestChanges } from '@/lib/pwaManifest';
import {
  normalizeVersion,
  compareSemver,
} from '@/lib/versionManifest';
import { isFleetProductionHost } from '@/lib/pwaPromptRegister';
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import { formatSupabaseError } from '@/lib/supabaseError';
import {
  mergeTopicPrefsForNewEmails,
  NOTIFICATION_EMAIL_TOPIC_IDS,
  NOTIFICATION_EMAIL_TOPIC_LABELS_HE,
  normalizeNotificationEmailKey,
  parseEmailsFromTextarea,
  parseNotificationEmailList,
  parseTopicPrefs,
  type NotificationEmailTopicId,
  type NotificationEmailTopicPrefsMap,
} from '@/lib/notificationEmailRouting';

export default function AdminSettingsPage() {
    const { theme, setTheme } = useTheme();
    const queryClient = useQueryClient();
    const { isAdmin, profile, refreshProfile, user, activeOrgId } = useAuth();
    const [lastPricingUpload, setLastPricingUpload] = useState<string | null>(localStorage.getItem('last_pricing_upload'));
    const lastVehicleUpload = localStorage.getItem('last_vehicle_upload');
    const lastDriverUpload = localStorage.getItem('last_driver_upload');

    const settingsOrgIdForSnapshot = activeOrgId ?? profile?.org_id ?? null;
    const { data: orgSettingsRow } = useOrgSettings(settingsOrgIdForSnapshot, {
      enabledOnlyWithOrgId: true,
    });
    const manifestUiGates = EMPTY_FLEET_MANIFEST_UI_GATES;

    // ── notification routing: user_org_notification_routing (per admin + org); legacy fallback לתצוגה ראשונה
    const [notificationEmailsRaw, setNotificationEmailsRaw] = useState('malachiroei@gmail.com');
    const [notificationTopicPrefs, setNotificationTopicPrefs] = useState<NotificationEmailTopicPrefsMap>({});
    const [isSavingEmails, setIsSavingEmails] = useState(false);
    const [isSavingTopicPrefs, setIsSavingTopicPrefs] = useState(false);
    const [isLoadingEmails, setIsLoadingEmails] = useState(true);

    const notificationEmailList = useMemo(
      () => parseEmailsFromTextarea(notificationEmailsRaw),
      [notificationEmailsRaw]
    );

    useEffect(() => {
      (async () => {
        const orgId = (settingsOrgIdForSnapshot ?? '').trim();
        const uid = user?.id;
        try {
          if (orgId && uid) {
            const { data: mine, error: mineErr } = await supabase
              .from('user_org_notification_routing')
              .select('emails, topic_prefs')
              .eq('org_id', orgId)
              .eq('user_id', uid)
              .maybeSingle();
            if (!mineErr && mine) {
              const rawEmails = (mine as { emails?: unknown }).emails;
              const arr = parseNotificationEmailList(rawEmails);
              const prefsFromDb = parseTopicPrefs((mine as { topic_prefs?: unknown }).topic_prefs);
              if (arr.length > 0) {
                setNotificationEmailsRaw(arr.join(', '));
                setNotificationTopicPrefs(mergeTopicPrefsForNewEmails(prefsFromDb, arr));
                return;
              }
            }
          }
          const { data: bundle, error: bundleErr } = await (supabase as any).rpc('get_notification_email_settings');
          if (bundleErr) throw bundleErr;
          const arr = parseNotificationEmailList(bundle?.emails);
          const prefsFromDb = parseTopicPrefs(bundle?.topic_prefs);
          if (arr.length > 0) {
            setNotificationEmailsRaw(arr.join(', '));
            setNotificationTopicPrefs(mergeTopicPrefsForNewEmails(prefsFromDb, arr));
          } else {
            const saved = localStorage.getItem('handover_notification_email');
            if (saved) {
              setNotificationEmailsRaw(saved);
              setNotificationTopicPrefs(mergeTopicPrefsForNewEmails(prefsFromDb, [saved]));
            }
          }
        } catch {
          const saved = localStorage.getItem('handover_notification_email');
          if (saved) {
            setNotificationEmailsRaw(saved);
            setNotificationTopicPrefs(mergeTopicPrefsForNewEmails({}, [saved]));
          }
        } finally {
          setIsLoadingEmails(false);
        }
      })();
    }, [settingsOrgIdForSnapshot, user?.id]);

    useEffect(() => {
      if (isLoadingEmails) return;
      setNotificationTopicPrefs((prev) => mergeTopicPrefsForNewEmails(prev, notificationEmailList));
    }, [isLoadingEmails, notificationEmailList.join('|')]);

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
      const emails = parseEmailsFromTextarea(notificationEmailsRaw);
      const orgId = (settingsOrgIdForSnapshot ?? '').trim();

      if (emails.length === 0) {
        toast.error('נא להזין לפחות כתובת מייל תקינה אחת');
        return;
      }
      if (!orgId || !user?.id) {
        toast.error('חסר ארגון פעיל או משתמש — לא ניתן לשמור');
        return;
      }

      const mergedPrefs = mergeTopicPrefsForNewEmails(notificationTopicPrefs, emails);

      setIsSavingEmails(true);
      try {
        const { error: upErr } = await supabase.from('user_org_notification_routing').upsert(
          {
            user_id: user.id,
            org_id: orgId,
            emails,
            topic_prefs: mergedPrefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,org_id' },
        );
        if (upErr) throw upErr;
        setNotificationTopicPrefs(mergedPrefs);
        setNotificationEmailsRaw(emails.join(', '));
        localStorage.setItem('handover_notification_email', emails[0]);
        toast.success(`נשמרו ${emails.length} כתובות מייל להתראות (הגדרה אישית לארגון)`);
      } catch (err) {
        console.error(err);
        toast.error('שמירת כתובות המייל נכשלה', {
          description: formatSupabaseError(err),
          duration: 12_000,
        });
      } finally {
        setIsSavingEmails(false);
      }
    };

    const saveNotificationTopicPrefsOnly = async () => {
      const emails = notificationEmailList;
      const orgId = (settingsOrgIdForSnapshot ?? '').trim();
      if (emails.length === 0) {
        toast.error('אין כתובות ברשימה — הזן מיילים בכרטיס למעלה ושמור תחילה');
        return;
      }
      if (!orgId || !user?.id) {
        toast.error('חסר ארגון פעיל או משתמש — לא ניתן לשמור');
        return;
      }
      const mergedPrefs = mergeTopicPrefsForNewEmails(notificationTopicPrefs, emails);
      setIsSavingTopicPrefs(true);
      try {
        const { error } = await supabase.from('user_org_notification_routing').upsert(
          {
            user_id: user.id,
            org_id: orgId,
            emails,
            topic_prefs: mergedPrefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,org_id' },
        );
        if (error) throw error;
        setNotificationTopicPrefs(mergedPrefs);
        toast.success('העדפות נושאי מייל נשמרו');
      } catch (err) {
        console.error(err);
        toast.error('שמירת העדפות נושא נכשלה', {
          description: formatSupabaseError(err),
          duration: 12_000,
        });
      } finally {
        setIsSavingTopicPrefs(false);
      }
    };

    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
    const DEFAULT_APP_VERSION = codeVersion;
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

    /** GitHub: version_snapshot.json (best-effort) — להשוואה מול ה-Timestamp המקומי */
    const [githubSnapshotVersion, setGithubSnapshotVersion] = useState<string>('');
    const [githubSnapshotReleaseDate, setGithubSnapshotReleaseDate] = useState<string>('');
    const [isGithubSnapshotLoading, setIsGithubSnapshotLoading] = useState(false);

    const updateOrgSettingsMutation = useUpdateOrgSettings();

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
          const [versionRes, lastUpdateRes] = await Promise.all([
            (supabase as any).from(FLEET_KV_TABLE).select('value').eq('key', 'app_version').maybeSingle(),
            (supabase as any).from(FLEET_KV_TABLE).select('value').eq('key', 'last_update_date').maybeSingle(),
          ]);

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
      const emails = parseEmailsFromTextarea(notificationEmailsRaw);
      if (emails.length === 0) {
        toast.error('נא להזין לפחות כתובת מייל תקינה לפני בדיקה');
        return;
      }

      setIsSendingTestEmail(true);
      try {
        localStorage.setItem('handover_notification_email', emails[0]);

        const testBody = {
          subject: 'בדיקת מייל - Fleet Manager 2026',
          payload: {
            handoverType: 'delivery' as const,
            assignmentMode: 'permanent' as const,
            vehicleLabel: 'בדיקת מערכת',
            driverLabel: 'בדיקת מערכת',
            odometerReading: 12345,
            fuelLevel: 4,
            notes: 'מייל בדיקה ממסך הגדרות',
            reportUrl: window.location.origin,
            sentAt: new Date().toISOString(),
          },
        };

        const failures: string[] = [];
        for (const addr of emails) {
          const { error } = await supabase.functions.invoke('send-handover-notification', {
            body: { ...testBody, to: addr },
          });
          if (error) failures.push(`${addr}: ${error.message}`);
        }

        if (failures.length > 0) {
          toast.error(`חלק מהמיילים נכשלו (${failures.length}/${emails.length})`, {
            description: failures.slice(0, 3).join(' · '),
          });
        } else {
          toast.success(`נשלח מייל בדיקה ל-${emails.length} כתובות`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'שגיאה לא ידועה';
        toast.error(`שליחת מייל בדיקה נכשלה: ${message}`);
      } finally {
        setIsSendingTestEmail(false);
      }
    };

    const setTopicFlag = (email: string, topic: NotificationEmailTopicId, checked: boolean) => {
      const key = normalizeNotificationEmailKey(email);
      setNotificationTopicPrefs((prev) => ({
        ...prev,
        [key]: { ...prev[key], [topic]: checked },
      }));
    };

    const topicFlag = (email: string, topic: NotificationEmailTopicId) => {
      const row = notificationTopicPrefs[normalizeNotificationEmailKey(email)];
      return row?.[topic] !== false;
    };

    return (
     <div className="fleet-screen-page text-white">
       <header className="bg-card border-b border-border sticky top-0 z-10">
         <div className="container py-4">
           <div className="flex items-center gap-3">
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

          {/* Notification Emails — user_org_notification_routing + legacy fallback */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Mail className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <CardTitle>כתובות מייל לקבלת התראות</CardTitle>
                  <CardDescription>
                    הגדרה אישית לחשבון שלך בארגון הנבחר: כל מנהל רואה ועורך רק את הרשימה שלו. בעת שליחת התראות
                    המערכת מאחדת את כל המנהלים ששמרו הגדרות לאותו ארגון (מיילים ללא כפילויות). אם לא נשמרה אף הגדרה
                    לארגון — משתמשים בהגדרות הגלובליות הישנות (system_settings) כגיבוי.
                    &quot;בדיקת שליחה&quot; שולח מייל לכל כתובת תקינה ברשימה שלך.
                    מתחת: איזה סוג התראה יגיע לכל כתובת (ברירת מחדל: הכול פעיל). הפרד בין כתובות בפסיק או שורה חדשה.
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
                    <strong>{parseEmailsFromTextarea(notificationEmailsRaw).length}</strong>
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Mail className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <CardTitle>ניהול נושאי מייל לפי כתובת</CardTitle>
                  <CardDescription>
                    סמן לכל כתובת מאיזה סוגי פעולות לקבל התראה. שמירה כאן לא משנה את רשימת הכתובות — רק את מפת הנושאים.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationEmailList.length === 0 ? (
                <p className="text-sm text-muted-foreground">הזן כתובות בכרטיס למעלה כדי לערוך הרשאות נושא.</p>
              ) : (
                <>
                  <div className="max-h-[min(520px,70vh)] overflow-auto rounded-md border border-border touch-pan-x">
                    <Table className="min-w-max text-[11px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky right-0 z-[1] bg-card text-right min-w-[200px] border-l border-border">
                            מייל
                          </TableHead>
                          {NOTIFICATION_EMAIL_TOPIC_IDS.map((tid) => (
                            <TableHead key={tid} className="text-center max-w-[120px] min-w-[100px] leading-tight whitespace-normal px-1">
                              {NOTIFICATION_EMAIL_TOPIC_LABELS_HE[tid]}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notificationEmailList.map((email) => (
                          <TableRow key={normalizeNotificationEmailKey(email)}>
                            <TableCell
                              className="sticky right-0 z-[1] bg-card font-mono text-xs text-left border-l border-border"
                              dir="ltr"
                            >
                              {email}
                            </TableCell>
                            {NOTIFICATION_EMAIL_TOPIC_IDS.map((tid) => (
                              <TableCell key={tid} className="text-center">
                                <Checkbox
                                  checked={topicFlag(email, tid)}
                                  onCheckedChange={(v) => setTopicFlag(email, tid, v === true)}
                                  aria-label={`${email} — ${NOTIFICATION_EMAIL_TOPIC_LABELS_HE[tid]}`}
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={saveNotificationTopicPrefsOnly} disabled={isSavingTopicPrefs}>
                      {isSavingTopicPrefs ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin ml-2" />
                          שומר...
                        </>
                      ) : (
                        'שמור העדפות נושא'
                      )}
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
                    גרסת האפליקציה (מ־<code className="text-[10px]">package.json</code>, כמו בכותרת):{' '}
                    <span className="font-mono text-foreground">{codeVersion}</span>
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
                  <span className="text-muted-foreground">גרסת עדכון זמינה:</span>
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void forceManualVersionUpdate()}
                    disabled={false}
                  >
                    ניקוי זיכרון ורענון אפליקציה
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    (מנקה מטמון דפדפן במקרה של תקלה)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

       </main>
     </div>
   );
 }