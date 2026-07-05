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
  Settings,
  Shield,
  Trash2,
} from 'lucide-react';
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
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import { formatSupabaseError } from '@/lib/supabaseError';
import {
  FLEET_EXCEL_IMPORT_EVENT,
  pickLatestIsoString,
  readFleetExcelImportTimestamp,
} from '@/lib/fleetExcelImportStorage';
import {
  buildTopicPrefsDocumentForDb,
  mergeDriverMetaFromLegacyPrefs,
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
    const queryClient = useQueryClient();
    const { isAdmin, profile, refreshProfile, user, activeOrgId } = useAuth();
    const [lastPricingUpload, setLastPricingUpload] = useState<string | null>(localStorage.getItem('last_pricing_upload'));

    const [serverVehicleMaxAt, setServerVehicleMaxAt] = useState<string | null>(null);
    const [serverDriverMaxAt, setServerDriverMaxAt] = useState<string | null>(null);
    /** מגיב לאירוע טעינת אקסל (אותו טאב) ומרענן max(updated_at) מהמסד */
    const [fleetImportRefresh, setFleetImportRefresh] = useState(0);

    const settingsOrgIdForSnapshot = activeOrgId ?? profile?.org_id ?? null;
    const { data: orgSettingsRow } = useOrgSettings(settingsOrgIdForSnapshot, {
      enabledOnlyWithOrgId: true,
    });
    const manifestUiGates = EMPTY_FLEET_MANIFEST_UI_GATES;

    // ── notification routing: user_org_notification_routing (per admin + org); legacy fallback לתצוגה ראשונה
    const [notificationEmailsRaw, setNotificationEmailsRaw] = useState('malachiroei@gmail.com');
    const [notificationTopicPrefs, setNotificationTopicPrefs] = useState<NotificationEmailTopicPrefsMap>({});
    const [driverCopyByTopicMeta, setDriverCopyByTopicMeta] = useState<
      Partial<Record<NotificationEmailTopicId, boolean>>
    >({});
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
              const rawTp = (mine as { topic_prefs?: unknown }).topic_prefs;
              const arr = parseNotificationEmailList(rawEmails);
              const prefsFromDb = parseTopicPrefs(rawTp);
              if (arr.length > 0) {
                setNotificationEmailsRaw(arr.join(', '));
                setNotificationTopicPrefs(mergeTopicPrefsForNewEmails(prefsFromDb, arr));
                setDriverCopyByTopicMeta(mergeDriverMetaFromLegacyPrefs(prefsFromDb, rawTp));
                return;
              }
            }
          }
          const { data: bundle, error: bundleErr } = await (supabase as any).rpc('get_notification_email_settings');
          if (bundleErr) throw bundleErr;
          const arr = parseNotificationEmailList(bundle?.emails);
          const rawTp = bundle?.topic_prefs;
          const prefsFromDb = parseTopicPrefs(rawTp);
          if (arr.length > 0) {
            setNotificationEmailsRaw(arr.join(', '));
            setNotificationTopicPrefs(mergeTopicPrefsForNewEmails(prefsFromDb, arr));
            setDriverCopyByTopicMeta(mergeDriverMetaFromLegacyPrefs(prefsFromDb, rawTp));
          } else {
            const saved = localStorage.getItem('handover_notification_email');
            if (saved) {
              setNotificationEmailsRaw(saved);
              setNotificationTopicPrefs(mergeTopicPrefsForNewEmails(prefsFromDb, [saved]));
              setDriverCopyByTopicMeta(mergeDriverMetaFromLegacyPrefs(prefsFromDb, rawTp));
            }
          }
        } catch {
          const saved = localStorage.getItem('handover_notification_email');
          if (saved) {
            setNotificationEmailsRaw(saved);
            setNotificationTopicPrefs(mergeTopicPrefsForNewEmails({}, [saved]));
            setDriverCopyByTopicMeta({});
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

    /** כשאין `last_update_date` ב־Supabase — מועד בניית חבילת ה־JS (כל פריסה מקבלת ערך חדש) */
    const clientBundleBuildDisplay = useMemo(() => {
      try {
        const iso = typeof __FLEET_APP_BUILD_ISO__ === 'string' ? __FLEET_APP_BUILD_ISO__ : '';
        const ms = Date.parse(iso);
        if (!Number.isNaN(ms)) return formatDateTimeForUi(new Date(ms));
      } catch {
        // ignore
      }
      return '';
    }, []);

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
      const topicPrefsDoc = buildTopicPrefsDocumentForDb(mergedPrefs, driverCopyByTopicMeta);

      setIsSavingEmails(true);
      try {
        const { error: upErr } = await supabase.from('user_org_notification_routing').upsert(
          {
            user_id: user.id,
            org_id: orgId,
            emails,
            topic_prefs: topicPrefsDoc,
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
      const topicPrefsDoc = buildTopicPrefsDocumentForDb(mergedPrefs, driverCopyByTopicMeta);
      setIsSavingTopicPrefs(true);
      try {
        const { error } = await supabase.from('user_org_notification_routing').upsert(
          {
            user_id: user.id,
            org_id: orgId,
            emails,
            topic_prefs: topicPrefsDoc,
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
    // תאריך עדכון אחרון במפתח last_update_date (system_settings) — מתעדכן בזרימת פרסום גרסה / bump
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
      return '';
    });

    const updateOrgSettingsMutation = useUpdateOrgSettings();

    const formatDate = (iso: string | null) => {
      if (!iso) return 'לא בוצעה';
      const d = new Date(iso);
      const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${date} ${time}`;
    };

    const fetchFleetTableActivity = useCallback(async () => {
      try {
        const [vRes, dRes] = await Promise.all([
          supabase.from('vehicles').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('drivers').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        const v = vRes.data?.updated_at;
        const d = dRes.data?.updated_at;
        setServerVehicleMaxAt(v != null ? String(v) : null);
        setServerDriverMaxAt(d != null ? String(d) : null);
      } catch {
        setServerVehicleMaxAt(null);
        setServerDriverMaxAt(null);
      }
    }, []);

    useEffect(() => {
      void fetchFleetTableActivity();
    }, [fetchFleetTableActivity, settingsOrgIdForSnapshot]);

    useEffect(() => {
      const onFleetExcel = () => {
        setFleetImportRefresh((n) => n + 1);
        void fetchFleetTableActivity();
      };
      window.addEventListener(FLEET_EXCEL_IMPORT_EVENT, onFleetExcel as EventListener);
      return () => window.removeEventListener(FLEET_EXCEL_IMPORT_EVENT, onFleetExcel as EventListener);
    }, [fetchFleetTableActivity]);

    // טעינת תאריך עדכון אחרון מ־system_settings (זרימת פרסום גרסה / staff)
    useEffect(() => {
      (async () => {
        try {
          const { data, error } = await (supabase as any)
            .from(FLEET_KV_TABLE)
            .select('value')
            .eq('key', 'last_update_date')
            .maybeSingle();
          if (error) return;
          const lastUpdateValue = data?.value;
          if (typeof lastUpdateValue === 'string' && lastUpdateValue.trim()) {
            const ms = Date.parse(lastUpdateValue);
            if (!Number.isNaN(ms)) {
              setLastUpdateDate(formatDateTimeForUi(new Date(ms)));
            } else {
              setLastUpdateDate(lastUpdateValue);
            }
          }
        } catch {
          // ignore (RLS / migration)
        }
      })();
    }, []);

    const mergedLastVehicleIso = useMemo(
      () =>
        pickLatestIsoString(
          readFleetExcelImportTimestamp('vehicle', settingsOrgIdForSnapshot),
          serverVehicleMaxAt,
        ),
      [settingsOrgIdForSnapshot, serverVehicleMaxAt, fleetImportRefresh],
    );

    const mergedLastDriverIso = useMemo(
      () =>
        pickLatestIsoString(
          readFleetExcelImportTimestamp('driver', settingsOrgIdForSnapshot),
          serverDriverMaxAt,
        ),
      [settingsOrgIdForSnapshot, serverDriverMaxAt, fleetImportRefresh],
    );

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

    const setDriverCopyMetaTopic = (topic: NotificationEmailTopicId, checked: boolean) => {
      setDriverCopyByTopicMeta((prev) => ({ ...prev, [topic]: checked }));
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
                    הגדרה אישית לחשבון שלך: כשאתה מבצע מסירה/החזרה, המיילים נשלחים רק לכתובות ששמרת כאן (לא לרשימות
                    של אדמינים אחרים בארגון). הפרד בין כתובות בפסיק או שורה חדשה.
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
                    לכל שורה: עמודת נהג — האם לשלוח עותק לנהג המשויך לרכב (לפי המייל בכרטיס הנהג) לאותו סוג התראה.
                    תחת כל כתובת מייל: האם לשלוח לשם התראה. שמירה כאן לא משנה את רשימת הכתובות.
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
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="sticky right-0 z-[1] bg-card text-card-foreground text-right min-w-[72px] max-w-[100px] w-[100px] border-l border-border align-bottom px-1.5 text-[10px] leading-tight">
                            סוג התראה
                          </TableHead>
                          <TableHead className="bg-card text-center text-card-foreground align-bottom min-w-[44px] max-w-[52px] px-0.5 text-[9px] leading-tight">
                            נהג
                          </TableHead>
                          {notificationEmailList.map((email) => (
                            <TableHead
                              key={normalizeNotificationEmailKey(email)}
                              className="bg-card text-center text-card-foreground align-bottom min-w-[88px] max-w-[140px] px-1 border-border/60"
                            >
                              <div
                                dir="ltr"
                                className="font-mono text-[10px] truncate mx-auto max-w-[132px] text-card-foreground"
                                title={email}
                              >
                                {email}
                              </div>
                              <div className="mt-1 text-[9px] text-slate-400 dark:text-slate-300 leading-none">התראה</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {NOTIFICATION_EMAIL_TOPIC_IDS.map((tid) => (
                          <TableRow key={tid}>
                            <TableCell className="sticky right-0 z-[1] bg-card text-card-foreground text-right align-middle border-l border-border leading-tight px-1.5 text-[10px] max-w-[100px]">
                              {NOTIFICATION_EMAIL_TOPIC_LABELS_HE[tid]}
                            </TableCell>
                            <TableCell className="text-center align-middle px-0.5">
                              <Checkbox
                                checked={driverCopyByTopicMeta[tid] === true}
                                onCheckedChange={(v) => setDriverCopyMetaTopic(tid, v === true)}
                                aria-label={`${NOTIFICATION_EMAIL_TOPIC_LABELS_HE[tid]} — עותק לנהג`}
                              />
                            </TableCell>
                            {notificationEmailList.map((email) => (
                              <TableCell key={`${normalizeNotificationEmailKey(email)}-${tid}`} className="text-center align-middle px-1">
                                <Checkbox
                                  checked={topicFlag(email, tid)}
                                  onCheckedChange={(v) => setTopicFlag(email, tid, v === true)}
                                  aria-label={`${email} — ${NOTIFICATION_EMAIL_TOPIC_LABELS_HE[tid]} — התראה`}
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

          {/* System Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>מידע מערכת</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                תאריכי טעינת רכבים/נהגים משלבים את הטעינה האחרונה ממכשיר זה (אם בוצעה) ואת מועד השינוי האחרון
                ברשומות במסד הנתונים (לפי הרשאות הארגון). «תאריך עדכון אחרון (מערכת)» נטען מ־מסד הנתונים
                (מפתח <span dir="ltr">last_update_date</span>) אם קיים; אחרת מוצג מועד בניית גרסת הדפדפן מהפריסה האחרונה.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex flex-row-reverse flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium tabular-nums">{formatDate(lastPricingUpload)}</span>
                  <span className="text-muted-foreground">טעינת קובץ משרד התחבורה אחרונה:</span>
                </div>
                <div className="flex flex-row-reverse flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium tabular-nums">{formatDate(mergedLastVehicleIso)}</span>
                  <span className="text-muted-foreground">טעינת רכבים אחרונה:</span>
                </div>
                <div className="flex flex-row-reverse flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium tabular-nums">{formatDate(mergedLastDriverIso)}</span>
                  <span className="text-muted-foreground">טעינת נהגים אחרונה:</span>
                </div>
                <div className="flex flex-row-reverse flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium tabular-nums">
                    {lastUpdateDate || clientBundleBuildDisplay || 'לא נשמר במערכת (מתעדכן בפרסום גרסה / סנכרון מנהלים)'}
                  </span>
                  <span className="text-muted-foreground">תאריך עדכון אחרון (מערכת):</span>
                </div>
              </div>
            </CardContent>
          </Card>

       </main>
     </div>
   );
 }