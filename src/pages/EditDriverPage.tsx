import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  useVehicleSpecDirty,
  DIRTY_SOURCE_DRIVER_EDIT,
} from '@/contexts/VehicleSpecDirtyContext';
import { useDriver, useUpdateDriver } from '@/hooks/useDrivers';
import { useDeleteDriver } from '@/hooks/useDrivers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import { sendFleetFieldUpdateNotification } from '@/lib/sendFleetFieldUpdateNotification';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, User, CreditCard, Briefcase, ShieldCheck, FileText, Upload, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { formatSupabaseError } from '@/lib/supabaseError';

export default function EditDriverPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const complianceReturnTo = (location.state as { complianceReturnTo?: string } | null)?.complianceReturnTo?.trim() ?? '';
  const { data: driver, isLoading } = useDriver(id || '');
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const { setDirty, tryNavigate } = useVehicleSpecDirty();
  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [healthDeclaration, setHealthDeclaration] = useState<File | null>(null);

  const slice10 = (x: string | null | undefined) =>
    x && String(x).length >= 10 ? String(x).slice(0, 10) : '';
  const [birthDate, setBirthDate] = useState('');
  const [licenseExp, setLicenseExp] = useState('');
  const [healthDecDate, setHealthDecDate] = useState('');
  const [safetyTrainDate, setSafetyTrainDate] = useState('');
  const [reg585Date, setReg585Date] = useState('');
  const driverDatesInitId = useRef<string | null>(null);

  const uploadDriverFileToStorage = async (driverId: string, file: File, kind: 'license_front' | 'license_back' | 'health'): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const ts = Date.now();
    const path = `drivers/${driverId}/${kind}_${ts}.${ext}`;
    try {
      const { error } = await supabase.storage
        .from('vehicle-documents')
        .upload(path, file, { upsert: true });
      if (error) {
        console.error('[EditDriver] storage upload failed:', error.message);
        return null;
      }
      const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error('[EditDriver] storage upload exception:', e);
      return null;
    }
  };

  useEffect(() => {
    return () => setDirty(DIRTY_SOURCE_DRIVER_EDIT, false);
  }, [setDirty]);

  useEffect(() => {
    const h = window.location.hash.replace(/^#/, '').trim();
    if (!h || !driver?.id) return;
    requestAnimationFrame(() => {
      document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [driver?.id, location.hash]);

  useEffect(() => {
    if (!driver?.id) return;
    if (driverDatesInitId.current === driver.id) return;
    driverDatesInitId.current = driver.id;
    setBirthDate(slice10(driver.birth_date));
    setLicenseExp(slice10(driver.license_expiry));
    setHealthDecDate(slice10(driver.health_declaration_date));
    setSafetyTrainDate(slice10(driver.safety_training_date));
    setReg585Date(slice10(driver.regulation_585b_date));
  }, [driver]);

  if (isLoading) {
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <Skeleton className="h-6 w-48" />
          </div></div>
        </header>
        <main className="container py-6 space-y-4">
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <h1 className="font-bold text-xl">נהג לא נמצא</h1>
          </div></div>
        </header>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const licenseExpiry = licenseExp.trim();
    if (!licenseExpiry) {
      toast.error('חובה למלא תוקף רישיון נהיגה');
      return;
    }
    setIsSubmitting(true);
    try {
      let licenseFrontUrl = driver.license_front_url;
      let licenseBackUrl = driver.license_back_url;
      let healthDeclarationUrl = driver.health_declaration_url;

      if (licenseFront) {
        const url = await uploadDriverFileToStorage(driver.id, licenseFront, 'license_front');
        if (url) licenseFrontUrl = url;
      }
      if (licenseBack) {
        const url = await uploadDriverFileToStorage(driver.id, licenseBack, 'license_back');
        if (url) licenseBackUrl = url;
      }
      if (healthDeclaration) {
        const url = await uploadDriverFileToStorage(driver.id, healthDeclaration, 'health');
        if (url) healthDeclarationUrl = url;
      }

      await updateDriver.mutateAsync({
        id: driver.id,
        full_name: formData.get('full_name') as string,
        id_number: formData.get('id_number') as string,
        license_expiry: licenseExpiry,
        phone: formData.get('phone') as string || null,
        email: formData.get('email') as string || null,
        health_declaration_date: healthDecDate.trim() || null,
        safety_training_date: safetyTrainDate.trim() || null,
        address: formData.get('address') as string || null,
        job_title: formData.get('job_title') as string || null,
        department: formData.get('department') as string || null,
        safety_officer: formData.get('safety_officer') as string || null,
        driver_code: formData.get('driver_code') as string || null,
        license_number: formData.get('license_number') as string || null,
        birth_date: birthDate.trim() || null,
        regulation_585b_date: reg585Date.trim() || null,
        license_front_url: licenseFrontUrl,
        license_back_url: licenseBackUrl,
        health_declaration_url: healthDeclarationUrl,
      });

      if (licenseFront || licenseBack || healthDeclaration) {
        const rows: { label: string; value: string }[] = [
          { label: 'תוקף רישיון', value: licenseExpiry },
          { label: 'רישיון חזית', value: licenseFront ? 'הועלה / עודכן' : 'ללא שינוי' },
          { label: 'רישיון גב', value: licenseBack ? 'הועלה / עודכן' : 'ללא שינוי' },
          { label: 'הצהרת בריאות (קובץ)', value: healthDeclaration ? 'הועלה / עודכן' : 'ללא שינוי' },
        ];
        const docUrl = licenseFrontUrl || licenseBackUrl || healthDeclarationUrl || null;
        const notify = await sendFleetFieldUpdateNotification({
          subject: `עדכון סריקות / נהג — ${driver.full_name}`,
          headline: 'עודכנו פרטים או סריקות לנהג',
          vehicleLabel: driver.full_name,
          rows,
          documentUrl: typeof docUrl === 'string' ? docUrl : null,
        });
        if (!notify.ok) console.warn('[EditDriverPage] email', notify.message);
      }

      toast.success('הנהג עודכן בהצלחה');
      setDirty(DIRTY_SOURCE_DRIVER_EDIT, false);
      if (!complianceReturnTo) {
        navigate('/drivers', { replace: true });
      }
    } catch (error) {
      // מציג את השגיאה המדויקת מה-DB (RLS, constraint, עמודה חסרה וכו')
      const description = formatSupabaseError(error);
      toast.error('שגיאה בעדכון הנהג', {
        description,
        duration: 12_000, // זמן ארוך יותר כדי להספיק לקרוא code/details
      });
      setIsSubmitting(false);
    }
  };

  const handleDeleteDriver = async () => {
    if (deletePassword.trim() !== '2101') {
      toast.error('סיסמה שגויה למחיקה');
      return;
    }
    try {
      await deleteDriver.mutateAsync(driver.id);
      setDeleteDialogOpen(false);
      setDeletePassword('');
      setDirty(DIRTY_SOURCE_DRIVER_EDIT, false);
      navigate('/drivers', { replace: true });
    } catch {
      // useDeleteDriver כבר מציג הודעת שגיאה מתאימה
    }
  };

  return (
    <div className="fleet-screen-page text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex flex-wrap items-center gap-3">
            {complianceReturnTo ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => navigate(complianceReturnTo)}
              >
                חזרה למגדל ציות
              </Button>
            ) : null}
            <h1 className="font-bold text-xl">עריכת נהג - {driver.full_name}</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          onInput={() => setDirty(DIRTY_SOURCE_DRIVER_EDIT, true)}
          onChange={() => setDirty(DIRTY_SOURCE_DRIVER_EDIT, true)}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <CardTitle>פרטים אישיים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="full_name">שם מלא *</Label>
                  <Input id="full_name" name="full_name" defaultValue={driver.full_name} required />
                </div>
                <div>
                  <Label htmlFor="id_number">תעודת זהות *</Label>
                  <Input id="id_number" name="id_number" defaultValue={driver.id_number} required dir="ltr" />
                </div>
                <FleetDatePicker id="birth_date" label="תאריך לידה" value={birthDate} onChange={setBirthDate} />
                <div>
                  <Label htmlFor="phone">טלפון</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={driver.phone || ''} dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="email">אימייל</Label>
                  <Input id="email" name="email" type="email" defaultValue={driver.email || ''} dir="ltr" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="address">רחוב</Label>
                  <Input id="address" name="address" defaultValue={driver.address || ''} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>שיוך ארגוני</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="driver_code">קוד נהג</Label>
                  <Input id="driver_code" name="driver_code" defaultValue={driver.driver_code || ''} dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="job_title">תפקיד</Label>
                  <Input id="job_title" name="job_title" defaultValue={driver.job_title || ''} />
                </div>
                <div>
                  <Label htmlFor="department">מחלקה</Label>
                  <Input id="department" name="department" defaultValue={driver.department || ''} />
                </div>
                <div>
                  <Label htmlFor="safety_officer">קצין בטיחות</Label>
                  <Input id="safety_officer" name="safety_officer" defaultValue={driver.safety_officer || ''} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle>רישיונות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="license_number">מספר רישיון נהיגה</Label>
                <Input id="license_number" name="license_number" defaultValue={driver.license_number || ''} dir="ltr" />
              </div>
              <FleetDatePicker id="license_expiry" label="תוקף רישיון נהיגה *" value={licenseExp} onChange={setLicenseExp} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle>סריקות רישיון</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>רישיון - חזית</Label>
                  {driver.license_front_url && (
                    <img src={driver.license_front_url} alt="רישיון חזית" className="w-full h-32 object-contain rounded border border-border/40 bg-black/20" />
                  )}
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setLicenseFront(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>רישיון - גב</Label>
                  {driver.license_back_url && (
                    <img src={driver.license_back_url} alt="רישיון גב" className="w-full h-32 object-contain rounded border border-border/40 bg-black/20" />
                  )}
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setLicenseBack(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>הצהרת בריאות</Label>
                  {driver.health_declaration_url && (
                    <img src={driver.health_declaration_url} alt="הצהרת בריאות" className="w-full h-32 object-contain rounded border border-border/40 bg-black/20" />
                  )}
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setHealthDeclaration(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle>כשירות ובטיחות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <FleetDatePicker
                    id="health_declaration_date"
                    label="תאריך הצהרת בריאות"
                    value={healthDecDate}
                    onChange={setHealthDecDate}
                  />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">תוקף הצהרת בריאות: </span>
                    {(() => {
                      const iso = driver.health_declaration_date;
                      if (!iso) return '—';
                      const d = new Date(iso);
                      if (Number.isNaN(d.getTime())) return '—';
                      const e = new Date(d);
                      e.setFullYear(e.getFullYear() + 5);
                      return e.toLocaleDateString('he-IL');
                    })()}
                    <span className="mr-1 opacity-80"> (5 שנים מההצהרה)</span>
                  </p>
                </div>
                <FleetDatePicker
                  id="safety_training_date"
                  label="תאריך הדרכת בטיחות"
                  value={safetyTrainDate}
                  onChange={setSafetyTrainDate}
                />
                <div className="md:col-span-2 space-y-2">
                  <FleetDatePicker
                    id="regulation_585b_date"
                    label="תאריך בדיקת רישיון ע״פ תקנה 585 ב׳"
                    value={reg585Date}
                    onChange={setReg585Date}
                  />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">תוקף הבדיקה: </span>
                    {(() => {
                      const iso = driver.regulation_585b_date;
                      if (!iso) return '—';
                      const d = new Date(iso);
                      if (Number.isNaN(d.getTime())) return '—';
                      const e = new Date(d);
                      e.setFullYear(e.getFullYear() + 3);
                      return e.toLocaleDateString('he-IL');
                    })()}
                    <span className="mr-1 opacity-80"> (3 שנים ממועד הבדיקה)</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-cyan-500/20 bg-white/[0.03] p-3 space-y-2">
            <p className="text-xs text-muted-foreground">לחץ אישור שינויים לשמירה — יציאה בלי שמירה תציג התראה</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isSubmitting || deleteDriver.isPending}
              >
                מחק נהג
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 font-semibold shadow-lg shadow-cyan-900/30"
                disabled={isSubmitting || deleteDriver.isPending}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                אישור שינויים
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 w-full"
                disabled={isSubmitting || deleteDriver.isPending}
                onClick={() => tryNavigate('/drivers')}
              >
                ביטול
              </Button>
            </div>
          </div>
        </form>
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) setDeletePassword('');
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>מחיקת נהג</AlertDialogTitle>
              <AlertDialogDescription>
                כדי למחוק את הנהג, יש להזין סיסמה ולאשר.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-driver-password">סיסמה</Label>
              <Input
                id="delete-driver-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="הזנת סיסמה למחיקה"
                dir="ltr"
              />
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={deleteDriver.isPending}>ביטול</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDeleteDriver();
                }}
                className="bg-red-600 text-white hover:bg-red-500"
                disabled={deleteDriver.isPending}
              >
                {deleteDriver.isPending ? 'מוחק…' : 'מחק נהג'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
