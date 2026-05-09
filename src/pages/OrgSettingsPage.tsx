import React, { useEffect, useState } from 'react';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2, Loader2, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganizations';
import { useOrgSettings, useUpdateOrgSettings, uploadTemplatePdf } from '@/hooks/useOrgSettings';

// קוד מנהל לשינוי פרטי הארגון (ניתן לעדכון לפי הצורך)
const ORG_DETAILS_EDIT_CODE = '2101';

// ─── Main Page ─────────────────────────────────────────────────────
export default function OrgSettingsPage() {
  const { activeOrgId, isAdmin, isManager, isDriver, hasPermission, user, profile } = useAuth();
  const isRoeyMainAdmin =
    (profile?.email ?? user?.email ?? '').trim().toLowerCase() === 'malachiroei@gmail.com';
  const isDriverOnly = Boolean(isDriver && !isManager && !isAdmin);
  const readOnly = isDriverOnly || !hasPermission('admin_access');

  const orgId = activeOrgId ?? null;
  const { data: organization, isLoading: orgLoading } = useOrganization(orgId);
  const updateOrganization = useUpdateOrganization();
  const { data: settings, isLoading: settingsLoading } = useOrgSettings(orgId);
  const updateSettings = useUpdateOrgSettings();

  // Tab 1 state — name & email from organizations; rest from organization_settings
  const [orgName, setOrgName] = useState('');
  const [orgIdNumber, setOrgIdNumber] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [orgDetailsLocked, setOrgDetailsLocked] = useState<boolean>(true);

  // Populate from organizations (name, email) when loaded
  useEffect(() => {
    if (!organization) return;
    setOrgName(organization.name ?? '');
    setAdminEmail(organization.email ?? '');
  }, [organization]);

  // Populate from organization_settings (org_id_number, texts, pdfs) when loaded
  useEffect(() => {
    if (!settings) return;
    setOrgIdNumber(settings.org_id_number ?? '');
  }, [settings]);

  const handleUnlockOrgDetails = () => {
    const input = window.prompt('לשינוי פרטי הארגון (שם, ח.פ., דוא״ל) נדרש קוד מנהל. הזן קוד:');
    if (!input) return;
    if (input === ORG_DETAILS_EDIT_CODE) {
      setOrgDetailsLocked(false);
      toast.success('פרטי הארגון נפתחו לעריכה');
    } else {
      toast.error('קוד שגוי');
    }
  };

  const handleSaveDetails = async () => {
    try {
      if (orgId) {
        await updateOrganization.mutateAsync({
          id: orgId,
          name: orgName.trim(),
          email: adminEmail.trim() || null,
        });
      }
      await updateSettings.mutateAsync({
        org_id: orgId ?? undefined,
        org_id_number: orgIdNumber.trim(),
      });
      toast.success('הגדרות הארגון נשמרו בהצלחה');
    } catch (error) {
      console.error('OrgSettings handleSaveDetails error:', error);
      toast.error('שמירה נכשלה');
    }
  };

  return (
    <FleetHudPageShell
      title="הגדרות ארגון"
      subtitle="ניהול פרטי חברה."
    >
      <section className="dashboard-status-stage dashboard-cyber-stage mx-auto max-w-4xl space-y-6 rounded-3xl border border-cyan-400/25 p-4 sm:p-6" dir="rtl">
        {(orgLoading || settingsLoading) ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !orgId ? (
          <Card className="p-6">
            <p className="text-muted-foreground text-center">לא שויך ארגון למשתמש. נא ליצור קשר עם מנהל המערכת לשיוך ארגון.</p>
          </Card>
        ) : (
          <>
            {readOnly && (
              <p className="text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-4 py-2.5" role="status">
                You have read-only access to these settings.
              </p>
            )}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                    <div><CardTitle>פרטי החברה</CardTitle><CardDescription>שם הארגון, מספר ח.פ. ודוא"ל ניהולי</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="org_name">שם הארגון</Label>
                        {!readOnly && orgDetailsLocked && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="h-6 px-2 text-[10px]"
                            onClick={handleUnlockOrgDetails}
                          >
                            שינוי פרטים עם קוד
                          </Button>
                        )}
                      </div>
                      <Input
                        id="org_name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="חברה בע״מ"
                        readOnly={readOnly || orgDetailsLocked}
                        disabled={readOnly}
                        className={(readOnly || orgDetailsLocked) ? 'cursor-not-allowed opacity-80' : ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org_id">מספר ח.פ. / ע.מ.</Label>
                      <Input
                        id="org_id"
                        value={orgIdNumber}
                        onChange={(e) => setOrgIdNumber(e.target.value)}
                        placeholder="515XXXXXXX"
                        dir="ltr"
                        readOnly={readOnly || orgDetailsLocked}
                        disabled={readOnly}
                        className={(readOnly || orgDetailsLocked) ? 'cursor-not-allowed opacity-80' : ''}
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
                      readOnly={readOnly || orgDetailsLocked}
                      disabled={readOnly}
                      className={(readOnly || orgDetailsLocked) ? 'cursor-not-allowed opacity-80' : ''}
                    />
                  </div>
                </CardContent>
              </Card>
              {!readOnly && (
                <div className="flex justify-start pb-6">
                  <Button onClick={handleSaveDetails} disabled={updateSettings.isPending} size="lg" className="gap-2 px-8">
                    {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור הגדרות
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </FleetHudPageShell>
  );
}
