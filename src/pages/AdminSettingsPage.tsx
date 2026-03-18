import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
 import { Link } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import { ArrowRight, Settings, Shield, Mail, Loader2, Monitor, Moon, Sun, Download, RefreshCw, RotateCcw } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { toast } from 'sonner';
 
export default function AdminSettingsPage() {
    const { theme, setTheme } = useTheme();
    const lastPricingUpload = localStorage.getItem('last_pricing_upload');
    const lastVehicleUpload = localStorage.getItem('last_vehicle_upload');
    const lastDriverUpload = localStorage.getItem('last_driver_upload');

    // ── notification_emails — stored in system_settings table ─────────────────
    const [notificationEmailsRaw, setNotificationEmailsRaw] = useState('malachiroei@gmail.com');
    const [isSavingEmails, setIsSavingEmails] = useState(false);
    const [isLoadingEmails, setIsLoadingEmails] = useState(true);

    useEffect(() => {
      (async () => {
        try {
          const { data, error } = await (supabase as any)
            .from('system_settings')
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
          .from('system_settings')
          .upsert({ key: 'notification_emails', value: emails }, { onConflict: 'key' });
        if (error) throw error;
        setNotificationEmailsRaw(emails.join(', '));
        toast.success(`נשמרו ${emails.length} כתובות מייל להתראות`);
      } catch (err) {
        console.error(err);
        toast.error('שמירה נכשלה — ודא שהמיגרציה system_settings הופעלה');
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
    const [isUpdateAvailableOpen, setIsUpdateAvailableOpen] = useState(false);
    const [isUpdateProgressOpen, setIsUpdateProgressOpen] = useState(false);
    const [updateTargetVersion, setUpdateTargetVersion] = useState<string>('');
    const [updateProgressValue, setUpdateProgressValue] = useState<number>(0);
    const [updateProgressStage, setUpdateProgressStage] = useState<string>(''); // status text inside modal
    const [isSimulatingUpdate, setIsSimulatingUpdate] = useState(false);
    const CURRENT_VERSION_FALLBACK = '2.1.0';
    const VERSION_MANIFEST_RAW_URL =
      (import.meta.env.VITE_VERSION_MANIFEST_RAW_URL as string | undefined) ??
      'https://raw.githubusercontent.com/malachiroei/fleet-manager-dev/main/version_manifest.json';
    const lastUpdateDate = '18/03/2026';
    const restoreInputRef = useRef<HTMLInputElement | null>(null);

    const formatDate = (iso: string | null) => {
      if (!iso) return 'לא בוצעה';
      return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

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
        type VersionManifest = { version: string; releaseDate?: string };

        const parseSemver = (v: string): number[] | null => {
          const parts = String(v).split('.').map((x) => parseInt(x, 10));
          if (parts.length < 3) return null;
          if (parts.some((n) => Number.isNaN(n))) return null;
          return parts.slice(0, 3);
        };

        const compareSemver = (a: string, b: string) => {
          const pa = parseSemver(a);
          const pb = parseSemver(b);
          if (!pa || !pb) return 0;
          for (let i = 0; i < 3; i += 1) {
            if (pa[i] > pb[i]) return 1;
            if (pa[i] < pb[i]) return -1;
          }
          return 0;
        };

        const getLocalManifestVersion = async (): Promise<string> => {
          try {
            const res = await fetch('/version_manifest.json', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = (await res.json()) as Partial<VersionManifest>;
            if (json?.version) return String(json.version);
          } catch (e) {
            console.warn('checkForUpdates: failed to fetch local version manifest', e);
          }
          return CURRENT_VERSION_FALLBACK;
        };

        if (!VERSION_MANIFEST_RAW_URL) {
          toast.error('חסר VITE_VERSION_MANIFEST_RAW_URL — הגדר/י את ה-raw URL של version_manifest ב-GitHub');
          return;
        }

        const localVersion = await getLocalManifestVersion();
        const latestRes = await fetch(VERSION_MANIFEST_RAW_URL, { cache: 'no-store' });
        if (!latestRes.ok) throw new Error(`HTTP ${latestRes.status}`);
        const latestManifest = (await latestRes.json()) as Partial<VersionManifest>;

        const latestVersion = latestManifest?.version ? String(latestManifest.version) : '';
        if (!latestVersion) throw new Error('Latest manifest missing "version"');

        const cmp = compareSemver(latestVersion, localVersion);
        if (cmp > 0) {
          setUpdateTargetVersion(latestVersion);
          setIsUpdateAvailableOpen(true);
        } else {
          toast.success('אין עדכונים זמינים כרגע');
        }
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
        toast.error(`בדיקת עדכונים נכשלה: ${message}`);
      } finally {
        setIsCheckingUpdates(false);
      }
    };

    const startUpdateSimulation = async () => {
      // Simulated process for Vercel — in the future this will guide the admin to pull latest code.
      setIsUpdateAvailableOpen(false);
      setIsUpdateProgressOpen(true);
      setIsSimulatingUpdate(true);
      setUpdateProgressValue(0);

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        setUpdateProgressStage('מוריד עדכונים...');
        setUpdateProgressValue(25);
        await sleep(700);

        setUpdateProgressStage('שומר הגדרות...');
        setUpdateProgressValue(60);
        await backupSettings();

        setUpdateProgressStage('מפעיל מחדש...');
        setUpdateProgressValue(90);
        await sleep(800);

        setUpdateProgressValue(100);
        // Simulate update by reloading. Future: instruct admin to pull latest code.
        window.location.reload();
      } catch (err) {
        console.error(err);
        toast.error('Error: עדכון נכשל');
      } finally {
        setIsSimulatingUpdate(false);
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

          {/* System Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>מידע מערכת</CardTitle>
                  <CardDescription>Fleet Manager Pro — גרסה 2</CardDescription>
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

          {/* Update Available Modal */}
          <Dialog open={isUpdateAvailableOpen} onOpenChange={setIsUpdateAvailableOpen}>
            <DialogContent dir="rtl" className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  גרסה חדשה זמינה ({updateTargetVersion})! הנתונים שלך מוגנים ב-100%. האם לעדכן עכשיו?
                </DialogTitle>
                <DialogDescription>פעולה זו תתבצע בסימולציה ב-Vercel כרגע.</DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-2">
                <Button variant="outline" onClick={() => setIsUpdateAvailableOpen(false)} disabled={isSimulatingUpdate}>
                  לא עכשיו
                </Button>
                <Button onClick={startUpdateSimulation} disabled={isSimulatingUpdate}>
                  עדכן
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Update Progress Modal */}
          <Dialog
            open={isUpdateProgressOpen}
            onOpenChange={(open) => {
              if (!open && isSimulatingUpdate) return;
              setIsUpdateProgressOpen(open);
            }}
          >
            <DialogContent dir="rtl" className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>עדכון מערכת</DialogTitle>
                <DialogDescription>{updateProgressStage}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Progress value={updateProgressValue} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  מוריד/שומר/מפעיל מחדש: סימולציה ב-Vercel (בעתיד זה יכוון לפעולת משיכת הקוד מה-GitHub).
                </p>
              </div>
            </DialogContent>
          </Dialog>
       </main>
     </div>
   );
 }