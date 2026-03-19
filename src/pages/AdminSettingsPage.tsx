 import { useState, useEffect } from 'react';
 import { Link } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import { ArrowRight, Settings, Shield, Mail, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { toast } from 'sonner';
 
type VersionManifest = {
  version?: string;
  released_at?: string;
  notes?: string;
  changelog?: string[] | string;
  update_url?: string;
  download_url?: string;
};

const VERSION_MANIFEST_URL = 'https://fleet-manager-dev.vercel.app/version_manifest.json';
const BACKUP_TABLES = [
  'organizations',
  'org_members',
  'profiles',
  'user_roles',
  'vehicles',
  'drivers',
  'mileage_logs',
  'maintenance_logs',
  'vehicle_handovers',
  'org_invitations',
  'organization_settings',
  'org_documents',
  'system_settings',
  'ui_customization',
] as const;

export default function AdminSettingsPage() {
    const { theme, setTheme } = useTheme();
    const lastPricingUpload = localStorage.getItem('last_pricing_upload');
    const lastVehicleUpload = localStorage.getItem('last_vehicle_upload');
    const lastDriverUpload = localStorage.getItem('last_driver_upload');
    const currentVersion = (import.meta as any).env?.VITE_APP_VERSION || '2';

    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [lastUpdateCheckLabel, setLastUpdateCheckLabel] = useState<string | null>(null);
    const [updateModalOpen, setUpdateModalOpen] = useState(false);
    const [availableUpdate, setAvailableUpdate] = useState<VersionManifest | null>(null);
    const [isBackingUp, setIsBackingUp] = useState(false);

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

    const checkForUpdates = async () => {
      setIsCheckingUpdates(true);
      try {
        const res = await fetch(VERSION_MANIFEST_URL, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const manifest = (await res.json()) as VersionManifest;
        const latest = (manifest.version ?? '').trim();
        const checkedAt = new Date().toLocaleString('he-IL');
        setLastUpdateCheckLabel(checkedAt);

        if (!latest) {
          toast.error('version_manifest.json לא מכיל שדה version');
          return;
        }

        if (String(latest) === String(currentVersion)) {
          toast.success(`אין עדכון חדש. גרסה נוכחית: ${currentVersion}`);
          return;
        }

        setAvailableUpdate(manifest);
        setUpdateModalOpen(true);
      } catch (err: any) {
        toast.error(`בדיקת עדכונים נכשלה: ${err?.message ?? err}`);
      } finally {
        setIsCheckingUpdates(false);
      }
    };

    const performBackup = async () => {
      setIsBackingUp(true);
      try {
        const backup: Record<string, unknown> = {
          meta: {
            exported_at: new Date().toISOString(),
            app_version: currentVersion,
            source: window.location.origin,
          },
          tables: {} as Record<string, unknown[]>,
        };

        for (const table of BACKUP_TABLES) {
          const { data, error } = await (supabase as any).from(table).select('*');
          if (error) {
            throw new Error(`Table ${table}: ${error.message}`);
          }
          (backup.tables as Record<string, unknown[]>)[table] = (data ?? []) as unknown[];
        }

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `fleet-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        toast.success('הגיבוי נשמר בהצלחה');
      } catch (err: any) {
        toast.error(`הגיבוי נכשל: ${err?.message ?? err}`);
      } finally {
        setIsBackingUp(false);
      }
    };

    const openUpdateNow = () => {
      const url = availableUpdate?.update_url || availableUpdate?.download_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      window.location.reload();
    };

    const changelogLines = (() => {
      const raw = availableUpdate?.changelog ?? availableUpdate?.notes;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      return String(raw).split('\n').map((line) => line.trim()).filter(Boolean);
    })();
 
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
                  <CardDescription>Fleet Manager Pro — גרסה {currentVersion}</CardDescription>
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
              </div>
              <div className="pt-3 border-t border-border mt-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={performBackup}
                    disabled={isBackingUp}
                  >
                    {isBackingUp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        מגבה...
                      </>
                    ) : (
                      'גיבוי'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast.info('בקרוב: שחזור נתונים')}
                  >
                    שחזור
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkForUpdates}
                    disabled={isCheckingUpdates}
                  >
                    {isCheckingUpdates ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        בודק...
                      </>
                    ) : (
                      'בדוק עדכונים'
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={runPrintTest}>בדיקת הדפסה</Button>
                </div>
                {lastUpdateCheckLabel && (
                  <p className="text-xs text-muted-foreground mt-2">
                    בדיקת עדכונים אחרונה: <span dir="ltr">{lastUpdateCheckLabel}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={updateModalOpen} onOpenChange={setUpdateModalOpen}>
            <DialogContent className="sm:max-w-xl" dir="rtl">
              <DialogHeader>
                <DialogTitle>נמצא עדכון חדש למערכת</DialogTitle>
                <DialogDescription>
                  גרסה נוכחית: {currentVersion} · גרסה חדשה: {availableUpdate?.version ?? 'לא ידוע'}
                  {availableUpdate?.released_at ? ` · תאריך שחרור: ${availableUpdate.released_at}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto rounded-md border border-border p-3 bg-background/40">
                {changelogLines.length > 0 ? (
                  <ul className="list-disc pr-5 space-y-1 text-sm">
                    {changelogLines.map((line, idx) => (
                      <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">לא סופק changelog בקובץ manifest.</p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-start">
                <Button variant="outline" onClick={() => setUpdateModalOpen(false)}>
                  סגור
                </Button>
                <Button onClick={openUpdateNow}>Update Now</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
       </main>
     </div>
   );
 }