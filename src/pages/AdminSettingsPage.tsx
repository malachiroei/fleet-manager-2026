 import { useState } from 'react';
 import { Link } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import { ArrowRight, Settings, Shield } from 'lucide-react';
import { toast } from 'sonner';
 
export default function AdminSettingsPage() {
    const lastPricingUpload = localStorage.getItem('last_pricing_upload');
    const lastVehicleUpload = localStorage.getItem('last_vehicle_upload');
    const lastDriverUpload = localStorage.getItem('last_driver_upload');
    const [notificationEmail, setNotificationEmail] = useState(
      localStorage.getItem('handover_notification_email') || 'malachiroei@gmail.com'
    );
    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

    const formatDate = (iso: string | null) => {
      if (!iso) return 'לא בוצעה';
      return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const saveNotificationEmail = () => {
      if (!notificationEmail.trim() || !notificationEmail.includes('@')) {
        toast.error('נא להזין כתובת מייל תקינה');
        return;
      }

      localStorage.setItem('handover_notification_email', notificationEmail.trim());
      toast.success('מייל ההתראות נשמר בהצלחה');
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

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle>הגדרת מייל לעדכוני מסירה/החזרה</CardTitle>
              <CardDescription>
                לכל שליחת טופס מסירה או החזרה יישלח עדכון למייל זה
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="example@mail.com"
                dir="ltr"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveNotificationEmail}>שמור מייל התראות</Button>
                <Button variant="outline" onClick={sendTestEmail} disabled={isSendingTestEmail}>
                  {isSendingTestEmail ? 'שולח...' : 'בדיקת שליחה'}
                </Button>
                <Button variant="outline" onClick={runPrintTest}>בדיקת הדפסה</Button>
              </div>
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
              </div>
            </CardContent>
          </Card>
       </main>
     </div>
   );
 }