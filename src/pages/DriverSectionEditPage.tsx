/**
 * עמוד סקשן — טופס עריכה לפי קטגוריה (אישי / ארגוני / רישיונות / בטיחות),
 * באותו סגנון רשת כמו שאר הלשוניות.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useVehicleSpecDirty,
  DIRTY_SOURCE_DRIVER_EDIT,
} from '@/contexts/VehicleSpecDirtyContext';
import { useDriver, useUpdateDriver } from '@/hooks/useDrivers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Loader2, User, CreditCard, Briefcase, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatSupabaseError } from '@/lib/supabaseError';
import {
  DRIVER_SECTION_IDS,
  DRIVER_SECTION_LABELS,
  type DriverSectionId,
} from '@/lib/driverFieldMap';
import type { Driver } from '@/types/fleet';

function isSectionId(s: string): s is DriverSectionId {
  return (DRIVER_SECTION_IDS as readonly string[]).includes(s);
}

function nullable(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string)?.trim();
  return v || null;
}

/** תאריך תוקף מחושב: years קדימה מתאריך ISO */
function expiryFromDate(iso: string | null | undefined, years: number): string {
  if (!iso || String(iso).trim() === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const e = new Date(d);
  e.setFullYear(e.getFullYear() + years);
  return e.toLocaleDateString('he-IL');
}

export default function DriverSectionEditPage() {
  const { id, sectionId } = useParams<{ id: string; sectionId: string }>();
  const navigate = useNavigate();
  const { data: driver, isLoading } = useDriver(id || '');
  const updateDriver = useUpdateDriver();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setDirty, tryNavigate } = useVehicleSpecDirty();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    return () => setDirty(DIRTY_SOURCE_DRIVER_EDIT, false);
  }, [setDirty]);

  const markDirty = useCallback(() => {
    setDirty(DIRTY_SOURCE_DRIVER_EDIT, true);
  }, [setDirty]);

  const section = sectionId && isSectionId(sectionId) ? sectionId : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="container py-4">
            <Skeleton className="h-8 w-64" />
          </div>
        </header>
        <main className="container py-6">
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!driver || !section) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="border-b border-border bg-card">
          <div className="container flex items-center gap-3 py-4">
            <Link to="/drivers">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">סקשן לא נמצא</h1>
          </div>
        </header>
        <main className="container py-6">
          <Link to={id ? `/drivers/${id}` : '/drivers'}>
            <Button variant="outline">חזור</Button>
          </Link>
        </main>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = { id: driver.id };

      if (section === 'personal') {
        payload.full_name = formData.get('full_name') as string;
        payload.id_number = formData.get('id_number') as string;
        payload.phone = nullable(formData, 'phone');
        payload.email = nullable(formData, 'email');
        payload.address = nullable(formData, 'address');
        payload.birth_date = nullable(formData, 'birth_date');
        payload.city = nullable(formData, 'city');
        payload.note1 = nullable(formData, 'note1');
        payload.note2 = nullable(formData, 'note2');
        payload.rating = nullable(formData, 'rating');
      } else if (section === 'organizational') {
        payload.job_title = nullable(formData, 'job_title');
        payload.department = nullable(formData, 'department');
        payload.employee_number = nullable(formData, 'employee_number');
        payload.driver_code = nullable(formData, 'driver_code');
        payload.division = nullable(formData, 'division');
        payload.area = nullable(formData, 'area');
        payload.group_name = nullable(formData, 'group_name');
        payload.group_code = nullable(formData, 'group_code');
        payload.eligibility = nullable(formData, 'eligibility');
        payload.work_start_date = nullable(formData, 'work_start_date');
      } else if (section === 'licenses') {
        const licenseExpiry = (formData.get('license_expiry') as string)?.trim();
        if (!licenseExpiry) {
          toast.error('חובה למלא תוקף רישיון נהיגה');
          setIsSubmitting(false);
          return;
        }
        payload.license_number = nullable(formData, 'license_number');
        payload.license_expiry = licenseExpiry;
      } else if (section === 'safety') {
        payload.health_declaration_date = nullable(formData, 'health_declaration_date');
        payload.safety_training_date = nullable(formData, 'safety_training_date');
        payload.regulation_585b_date = nullable(formData, 'regulation_585b_date');
        payload.practical_driving_test_date = nullable(formData, 'practical_driving_test_date');
        // היתר בני משפחה / היתר נהיגה — מנוהלים בתיקייה יעודית / לא בטופס זה
        payload.is_field_person = formData.get('is_field_person') === 'on';
      }

      await updateDriver.mutateAsync(payload as Parameters<typeof updateDriver.mutateAsync>[0]);
      setDirty(DIRTY_SOURCE_DRIVER_EDIT, false);
      // חזרה לרשימה + גלילה לאותו נהג
      navigate(`/drivers?highlightDriver=${driver.id}`, { replace: true });
    } catch (error) {
      toast.error('שגיאה בעדכון', {
        description: formatSupabaseError(error),
        duration: 12_000,
      });
      setIsSubmitting(false);
    }
  };

  const title = DRIVER_SECTION_LABELS[section];
  const d = driver as Driver;

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <main className="container max-w-5xl py-6 space-y-6">
        {/* הירו כמו מסך רכב — אישור שינויים באותו מיקום (צד אחד), כותרת בצד השני */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-800/90 via-slate-900 to-[#0a1628] px-5 py-6 shadow-[0_0_50px_rgba(6,182,212,0.06)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.12),transparent)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
            <div className="flex shrink-0 flex-col items-center gap-2 self-center sm:items-end sm:self-start">
              <Button
                type="submit"
                form="driver-section-form"
                className="w-full bg-cyan-600 font-semibold shadow-lg shadow-cyan-900/30 hover:bg-cyan-500 sm:w-auto"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                אישור שינויים
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-white/20 sm:w-auto"
                onClick={() => tryNavigate(`/drivers?highlightDriver=${driver.id}`)}
              >
                ביטול
              </Button>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-right">
              <div className="mb-2 flex items-center justify-center gap-2 sm:justify-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    title="חזרה לרשימת נהגים"
                    className="shrink-0"
                    onClick={() => tryNavigate(`/drivers?highlightDriver=${driver.id}`)}
                  >
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-500/70">נהג</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-cyan-100 sm:text-3xl">{title}</h1>
              <p className="mt-2 text-base font-medium text-slate-200 sm:text-lg">{driver.full_name}</p>
              <p className="mt-1 text-sm text-slate-500">עריכת סקשן — יציאה בלי שמירה תציג התראה</p>
            </div>
          </div>
        </div>

        <form
          id="driver-section-form"
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-6"
          onInput={markDirty}
          onChange={markDirty}
        >
          {section === 'personal' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                    <User className="h-5 w-5 text-accent" />
                  </div>
                  <CardTitle>פרטים אישיים ופרטי קשר</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="full_name">שם מלא *</Label>
                    <Input id="full_name" name="full_name" defaultValue={d.full_name} required />
                  </div>
                  <div>
                    <Label htmlFor="id_number">תעודת זהות *</Label>
                    <Input id="id_number" name="id_number" defaultValue={d.id_number} required dir="ltr" />
                  </div>
                  <div>
                    <Label htmlFor="birth_date">תאריך לידה</Label>
                    <Input id="birth_date" name="birth_date" type="date" defaultValue={d.birth_date || ''} />
                  </div>
                  <div>
                    <Label htmlFor="city">עיר</Label>
                    <Input id="city" name="city" defaultValue={d.city || ''} />
                  </div>
                  <div>
                    <Label htmlFor="address">רחוב</Label>
                    <Input id="address" name="address" defaultValue={d.address || ''} />
                  </div>
                  <div>
                    <Label htmlFor="note1">הערה 1</Label>
                    <Input id="note1" name="note1" defaultValue={d.note1 || ''} />
                  </div>
                  <div>
                    <Label htmlFor="note2">הערה 2</Label>
                    <Input id="note2" name="note2" defaultValue={d.note2 || ''} />
                  </div>
                  <div>
                    <Label htmlFor="rating">דירוג</Label>
                    <Input id="rating" name="rating" defaultValue={d.rating || ''} />
                  </div>
                  <div>
                    <Label htmlFor="phone">טלפון</Label>
                    <Input id="phone" name="phone" type="tel" defaultValue={d.phone || ''} dir="ltr" />
                  </div>
                  <div>
                    <Label htmlFor="email">אימייל</Label>
                    <Input id="email" name="email" type="email" defaultValue={d.email || ''} dir="ltr" />
                  </div>
                </CardContent>
              </Card>
          )}

          {section === 'organizational' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-5 w-5 text-primary" />
                    <CardTitle>שיוך ארגוני / פרטי העסקה</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="employee_number">מ. עובד</Label>
                    <Input id="employee_number" name="employee_number" defaultValue={d.employee_number || ''} dir="ltr" />
                  </div>
                  <div>
                    <Label htmlFor="driver_code">קוד נהג</Label>
                    <Input id="driver_code" name="driver_code" defaultValue={d.driver_code || ''} dir="ltr" />
                  </div>
                  <div>
                    <Label htmlFor="job_title">תפקיד</Label>
                    <Input id="job_title" name="job_title" defaultValue={d.job_title || ''} />
                  </div>
                  <div>
                    <Label htmlFor="department">מחלקה</Label>
                    <Input id="department" name="department" defaultValue={d.department || ''} />
                  </div>
                  <div>
                    <Label htmlFor="division">מחוז</Label>
                    <Input id="division" name="division" defaultValue={d.division || ''} />
                  </div>
                  <div>
                    <Label htmlFor="area">אזור</Label>
                    <Input id="area" name="area" defaultValue={d.area || ''} />
                  </div>
                  <div>
                    <Label htmlFor="group_name">קבוצה</Label>
                    <Input id="group_name" name="group_name" defaultValue={d.group_name || ''} />
                  </div>
                  <div>
                    <Label htmlFor="group_code">קוד קבוצה</Label>
                    <Input id="group_code" name="group_code" defaultValue={d.group_code || ''} dir="ltr" />
                  </div>
                  <div>
                    <Label htmlFor="eligibility">כשירות</Label>
                    <Input id="eligibility" name="eligibility" defaultValue={d.eligibility || ''} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="work_start_date">ת. תחילת עבודה</Label>
                    <Input id="work_start_date" name="work_start_date" type="date" defaultValue={d.work_start_date || ''} />
                  </div>
                </CardContent>
              </Card>
          )}

          {section === 'licenses' && (
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
                  <Label htmlFor="license_number_lic">מספר רישיון נהיגה</Label>
                  <Input
                    id="license_number_lic"
                    name="license_number"
                    defaultValue={d.license_number || ''}
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label htmlFor="license_expiry_lic">תוקף רישיון נהיגה *</Label>
                  <Input
                    id="license_expiry_lic"
                    name="license_expiry"
                    type="date"
                    defaultValue={d.license_expiry || ''}
                    required
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'safety' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    </div>
                    <CardTitle>כשירות ובטיחות</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="health_declaration_date">תאריך הצהרת בריאות</Label>
                    <Input id="health_declaration_date" name="health_declaration_date" type="date" defaultValue={d.health_declaration_date || ''} />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">תוקף הצהרת בריאות: </span>
                      {expiryFromDate(d.health_declaration_date, 5)}
                      <span className="mr-1 opacity-80"> (תמיד 5 שנים ממועד ההצהרה)</span>
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="safety_training_date">תאריך הדרכת בטיחות</Label>
                    <Input id="safety_training_date" name="safety_training_date" type="date" defaultValue={d.safety_training_date || ''} />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="regulation_585b_date">תאריך בדיקת רישיון ע״פ תקנה 585 ב׳</Label>
                    <Input id="regulation_585b_date" name="regulation_585b_date" type="date" defaultValue={d.regulation_585b_date || ''} />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">תוקף הבדיקה: </span>
                      {expiryFromDate(d.regulation_585b_date, 3)}
                      <span className="mr-1 opacity-80"> (תמיד 3 שנים קדימה ממועד הבדיקה)</span>
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="practical_driving_test_date">מבחן מעשי</Label>
                    <Input id="practical_driving_test_date" name="practical_driving_test_date" type="date" defaultValue={d.practical_driving_test_date || ''} />
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input type="checkbox" id="is_field_person" name="is_field_person" value="true" defaultChecked={d.is_field_person} className="h-4 w-4" />
                    <Label htmlFor="is_field_person">איש שטח</Label>
                  </div>
                </CardContent>
              </Card>
          )}

          {/* שמירה וביטול בהירו למעלה — כאן רק הערה קצרה */}
          <p className="text-center text-xs text-muted-foreground">
            שינויים נשמרים רק אחרי לחיצה על <span className="font-medium text-cyan-400/90">אישור שינויים</span> בהירו
          </p>
        </form>
      </main>
    </div>
  );
}
