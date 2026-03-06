import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Building2, FileText, Heart, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgSettings, useUpdateOrgSettings } from '@/hooks/useOrgSettings';

export default function OrgSettingsPage() {
  const { data: settings, isLoading } = useOrgSettings();
  const updateSettings = useUpdateOrgSettings();

  const [orgName, setOrgName] = useState('');
  const [orgIdNumber, setOrgIdNumber] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [healthText, setHealthText] = useState('');
  const [policyText, setPolicyText] = useState('');

  // Populate form once data loads
  useEffect(() => {
    if (!settings) return;
    setOrgName(settings.org_name ?? '');
    setOrgIdNumber(settings.org_id_number ?? '');
    setAdminEmail(settings.admin_email ?? '');
    setHealthText(settings.health_statement_text ?? '');
    setPolicyText(settings.vehicle_policy_text ?? '');
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        org_name: orgName.trim(),
        org_id_number: orgIdNumber.trim(),
        admin_email: adminEmail.trim(),
        health_statement_text: healthText,
        vehicle_policy_text: policyText,
      });
      toast.success('הגדרות הארגון נשמרו בהצלחה');
    } catch (err) {
      console.error(err);
      toast.error('שמירה נכשלה — בדוק את הרשאות הטבלה');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6" dir="rtl">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/admin/settings">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הגדרות ארגון</h1>
            <p className="text-muted-foreground text-sm">ניהול פרטי החברה ונוסחי המסמכים</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Company Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle>פרטי החברה</CardTitle>
                    <CardDescription>שם הארגון, מספר ח.פ. ודוא"ל ניהולי</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="org_name">שם הארגון / החברה</Label>
                    <Input
                      id="org_name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="לדוגמה: חברה בע״מ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org_id_number">מספר ח.פ. / ע.מ.</Label>
                    <Input
                      id="org_id_number"
                      value={orgIdNumber}
                      onChange={(e) => setOrgIdNumber(e.target.value)}
                      placeholder="לדוגמה: 515XXXXXXX"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_email">דוא"ל ניהולי ראשי</Label>
                  <Input
                    id="admin_email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@company.co.il"
                    dir="ltr"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Health Statement Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
                    <Heart className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <CardTitle>נוסח הצהרת הבריאות</CardTitle>
                    <CardDescription>
                      כל שורה = סעיף אחד בהצהרת הבריאות. יוצג לנהג באשף המסירה ויודפס ב-PDF.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold">הנחיה:</span> כתוב כל סעיף בריאות בשורה נפרדת. שורות ריקות מתעלמות אוטומטית.
                </div>
                <Textarea
                  value={healthText}
                  onChange={(e) => setHealthText(e.target.value)}
                  placeholder="אינני סובל/ת ממחלת עצבים, אפילפסיה...&#10;כושר הראייה שלי תקין...&#10;..."
                  className="min-h-[280px] font-mono text-sm leading-relaxed resize-y"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground">
                  {healthText.split('\n').filter((l) => l.trim()).length} סעיפים
                </p>
              </CardContent>
            </Card>

            {/* Vehicle Policy Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                    <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle>נוסח נוהל שימוש ברכב</CardTitle>
                    <CardDescription>
                      כל שורה = סעיף אחד בנוהל. יוצג לנהג בחתימה ויודפס ב-PDF.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold">הנחיה:</span> כתוב כל סעיף נוהל בשורה נפרדת. הסעיפים ימוספרו אוטומטית.
                </div>
                <Textarea
                  value={policyText}
                  onChange={(e) => setPolicyText(e.target.value)}
                  placeholder="הרכב ישמש לצרכי עבודה בלבד...&#10;חל איסור מוחלט על נהיגה תחת השפעת אלכוהול...&#10;..."
                  className="min-h-[420px] font-mono text-sm leading-relaxed resize-y"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground">
                  {policyText.split('\n').filter((l) => l.trim()).length} סעיפים
                </p>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-start pb-8">
              <Button
                onClick={handleSave}
                disabled={updateSettings.isPending}
                size="lg"
                className="gap-2 px-8"
              >
                {updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                שמור הגדרות
              </Button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
