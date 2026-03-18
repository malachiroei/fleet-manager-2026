import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, Car, Phone, Mail, FolderOpen, Upload } from 'lucide-react';
import type { DriverSummary, ComplianceStatus } from '@/types/fleet';
import type { ActiveDriverVehicleAssignment } from '@/hooks/useVehicles';
import { DRIVER_SECTION_LABELS } from '@/lib/driverFieldMap';

/** מוצג לכל שדה ריק — בצבע אפור (text-muted-foreground) */
export const MISSING_DATA = 'חסר נתון';

export function fmtDriverDate(value: string | null | undefined): string {
  if (!value || String(value).trim() === '') return MISSING_DATA;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).trim() || MISSING_DATA;
  return d.toLocaleDateString('he-IL');
}

export function licenseExpiresWithin30Days(licenseExpiry: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(licenseExpiry);
  if (Number.isNaN(expiry.getTime())) return false;
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays < 30;
}

export function missingHealthDeclarationLastYear(healthDate: string | null | undefined): boolean {
  if (!healthDate || String(healthDate).trim() === '') return true;
  const d = new Date(healthDate);
  if (Number.isNaN(d.getTime())) return true;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return d < oneYearAgo;
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const config = {
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' },
  };
  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

function FieldRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isMissing =
    children === MISSING_DATA ||
    (typeof children === 'string' && children === MISSING_DATA);
  return (
    <div className={`min-w-0 flex flex-col gap-1 ${className ?? ''}`}>
      {/* כמו מפרט מלא ברכב: text-xs font-medium text-muted-foreground */}
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={`break-words text-sm font-medium ${isMissing ? 'text-muted-foreground' : 'text-slate-200'}`}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * משבצת בכרטיס — לחיצה פותחת עמוד עריכה לאותה קטגוריה בלבד (כל השדות שם, בלי דף הכפול)
 */
function SectionBlock({
  sectionId,
  driverId,
  children,
}: {
  sectionId: keyof typeof DRIVER_SECTION_LABELS;
  driverId: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={`/drivers/${driverId}/section/${sectionId}`}
      className="flex min-h-0 flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-4 transition-colors hover:border-cyan-500/25 hover:bg-slate-900/80"
      onClick={(e) => e.stopPropagation()}
    >
      {/* כותרת משבצת כמו בנטו רכב: text-xs font-medium uppercase tracking-wider */}
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2 text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-300">
          {DRIVER_SECTION_LABELS[sectionId]}
        </span>
        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-400">
          עריכה + שמירה
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">{children}</div>
    </Link>
  );
}

export function DriverCard({
  driver,
  onDelete,
  canEdit,
  driverActiveAssignments,
}: {
  driver: DriverSummary;
  onDelete: () => void;
  canEdit: boolean;
  driverActiveAssignments: ActiveDriverVehicleAssignment[];
}) {
  const today = new Date();
  const expiryRaw = driver.license_expiry;
  const expiry =
    expiryRaw && String(expiryRaw).trim() !== '' ? new Date(expiryRaw) : null;
  const expiryValid = expiry && !Number.isNaN(expiry.getTime());
  const diffDays = expiryValid
    ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : 9999;
  const licenseStatus: ComplianceStatus = !expiryValid
    ? 'valid'
    : diffDays < 0
      ? 'expired'
      : diffDays <= 30
        ? 'warning'
        : 'valid';
  const licenseExpired = expiryValid && diffDays < 0;
  const licenseUrgent =
    expiryValid && licenseExpiresWithin30Days(driver.license_expiry);
  const healthMissing = missingHealthDeclarationLastYear(driver.health_declaration_date);

  const assignedVehicles = driverActiveAssignments
    .map((a) => a.vehicle)
    .filter((v): v is NonNullable<ActiveDriverVehicleAssignment['vehicle']> => !!v);

  const str = (v: string | null | undefined) =>
    v && String(v).trim() !== '' ? String(v).trim() : MISSING_DATA;

  const navigate = useNavigate();

  return (
    <Card className="group overflow-hidden rounded-xl border border-white/10 bg-slate-950/40 transition-all hover:border-cyan-500/20">
        <CardContent className="p-0">
          {/* Header — בלי Link עוטף הכל: כפתור תיקיות לא יכול להיות בתוך <a> */}
          <div className="flex flex-col gap-2 px-4 pt-4 sm:px-5">
            <div className="flex items-start gap-3">
              <Link
                to={`/drivers/${driver.id}`}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-md sm:h-12 sm:w-12 sm:text-base ${
                  licenseStatus === 'expired'
                    ? 'bg-red-600'
                    : licenseStatus === 'warning'
                      ? 'bg-amber-600'
                      : 'bg-emerald-600'
                }`}
              >
                {(driver.full_name ?? '').trim().slice(0, 2) || '?'}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/drivers/${driver.id}`} className="block">
                  <h3 className="truncate text-base font-semibold text-slate-200 sm:text-lg hover:underline">
                    {driver.full_name}
                  </h3>
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={licenseStatus} />
                  {/* תיקיות — navigate בלבד כדי שלא יהיה <a> בתוך <a> */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs font-medium"
                    type="button"
                    title="תיקיות ניהול נהג"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // חייב להישאר בדף /drivers עם query — גלילה לבלוק התיקיות ב-DriverListPage
                      navigate(`/drivers?folders=${driver.id}`, { replace: false });
                      setTimeout(() => {
                        document.getElementById('driver-folders-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span className="hidden sm:inline">תיקיות</span>
                  </Button>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Link to={`/drivers/${driver.id}/edit`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDelete();
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {licenseUrgent && (
                <Badge className="border-0 bg-red-600 text-white hover:bg-red-600">
                  רישיון פג תוקף
                </Badge>
              )}
              {healthMissing && (
                <Badge className="border-0 bg-amber-500 text-amber-950 hover:bg-amber-500">
                  חסרה הצהרה
                </Badge>
              )}
            </div>
            {/* רכב משויך — ליד/מתחת לשם, לא בתחתית הכרטיס */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">רכב משויך</span>
              {assignedVehicles.length > 0 ? (
                assignedVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1 text-xs font-medium text-slate-200"
                  >
                    <Car className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{v.manufacturer} {v.model}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      ({v.plate_number})
                    </span>
                  </div>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Car className="h-3.5 w-3.5" />
                  אין רכב משויך
                </span>
              )}
            </div>
          </div>

          {/* 4 משבצות — כל אחת נפתחת בעמוד עריכה רק לאותה משבצת */}
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/10 bg-white/[0.02] px-4 py-4 sm:px-5 sm:grid-cols-2 xl:grid-cols-4">
            {/* personal — same order as Edit card 1 */}
            <SectionBlock sectionId="personal" driverId={driver.id}>
              <FieldRow label="שם מלא">{str(driver.full_name)}</FieldRow>
              <FieldRow label="תעודת זהות">{str(driver.id_number)}</FieldRow>
              <FieldRow label="תאריך לידה">{fmtDriverDate(driver.birth_date)}</FieldRow>
              <FieldRow label="טלפון" className="dir-ltr">
                {driver.phone && String(driver.phone).trim() !== '' ? (
                  <span className="inline-flex items-center gap-1 text-slate-200" dir="ltr">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {driver.phone}
                  </span>
                ) : (
                  MISSING_DATA
                )}
              </FieldRow>
              <FieldRow label="אימייל" className="dir-ltr">
                {driver.email && String(driver.email).trim() !== '' ? (
                  <span className="inline-flex min-w-0 items-center gap-1 text-slate-200" dir="ltr">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{driver.email}</span>
                  </span>
                ) : (
                  MISSING_DATA
                )}
              </FieldRow>
              <FieldRow label="רחוב">{str(driver.address)}</FieldRow>
            </SectionBlock>

            {/* organizational — Edit card 2 */}
            <SectionBlock sectionId="organizational" driverId={driver.id}>
              <FieldRow label="תפקיד">{str(driver.job_title)}</FieldRow>
              <FieldRow label="מחלקה">{str(driver.department)}</FieldRow>
            </SectionBlock>

            {/* licenses — Edit card 3 only (no 585 here) */}
            <SectionBlock sectionId="licenses" driverId={driver.id}>
              <FieldRow label="מספר רישיון נהיגה">{str(driver.license_number)}</FieldRow>
              <FieldRow label="תוקף רישיון נהיגה">
                {(() => {
                  const raw = driver.license_expiry;
                  const hasExpiry = raw && String(raw).trim() !== '';
                  if (!hasExpiry) return MISSING_DATA;
                  const formatted = fmtDriverDate(raw);
                  if (formatted === MISSING_DATA) return MISSING_DATA;
                  return (
                    <span className={licenseExpired ? 'font-semibold text-red-400' : 'text-slate-200'}>
                      {formatted}
                    </span>
                  );
                })()}
              </FieldRow>
              {driver.license_front_url ? (
                <FieldRow label="">
                  <a
                    href={driver.license_front_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-100 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    צפייה בסריקת רישיון
                  </a>
                </FieldRow>
              ) : (
                <FieldRow label="">
                  <Link
                    to={`/drivers/${driver.id}/edit`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    העלאת סריקת רישיון
                  </Link>
                </FieldRow>
              )}
            </SectionBlock>

            {/* safety — Edit card 4 */}
            <SectionBlock sectionId="safety" driverId={driver.id}>
              <FieldRow label="תאריך הצהרת בריאות">
                {fmtDriverDate(driver.health_declaration_date)}
              </FieldRow>
              <FieldRow label="תאריך הדרכת בטיחות">
                {fmtDriverDate(driver.safety_training_date)}
              </FieldRow>
              <FieldRow label='תאריך בדיקת רישיון ע״פ תקנה 585 ב׳'>
                {fmtDriverDate(driver.regulation_585b_date)}
              </FieldRow>
              {healthMissing && (
                <FieldRow label="">
                  <Link
                    to={`/drivers/${driver.id}/edit`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    העלאת הצהרת בריאות
                  </Link>
                </FieldRow>
              )}
            </SectionBlock>
          </div>
        </CardContent>
      </Card>
  );
}
