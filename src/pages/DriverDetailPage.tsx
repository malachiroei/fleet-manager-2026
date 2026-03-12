import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useDriver } from '@/hooks/useDrivers';
import { useDriverDocuments } from '@/hooks/useDriverDocuments';
import { useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogClose, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowRight, User, CreditCard, Phone, Briefcase, Car, Edit, FileText, X, Eye, ExternalLink
} from 'lucide-react';
import type { ComplianceStatus, DriverDocument } from '@/types/fleet';
import { MISSING_DATA } from '@/components/DriverCard';
import type { DriverSectionId } from '@/lib/driverFieldMap';
import { DRIVER_SECTION_QUERY_PARAM } from '@/lib/driverFieldMap';

/** ערך להצגה — לעולם לא מסתיר שורה */
function orMissing(v: string | null | undefined): string {
  if (v == null || String(v).trim() === '') return MISSING_DATA;
  return String(v).trim();
}

function orMissingDate(v: string | null | undefined): string | null {
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return v;
}

function StatusBadge({ status, daysLeft }: { status: ComplianceStatus; daysLeft?: number }) {
  const config = {
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' }
  };
  const { label, className } = config[status];
  return (
    <div className="flex items-center gap-2">
      <Badge className={className}>{label}</Badge>
      {daysLeft !== undefined && status !== 'valid' && (
        <span className="text-xs text-muted-foreground">
          {daysLeft < 0 ? `פג לפני ${Math.abs(daysLeft)} ימים` : `${daysLeft} ימים`}
        </span>
      )}
    </div>
  );
}

function calculateStatusWithDays(expiryDate: string): { status: ComplianceStatus; daysLeft: number } {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const status: ComplianceStatus = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'warning' : 'valid';
  return { status, daysLeft };
}

function getDocumentUrl(path: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  if (path.startsWith('data:')) return path; // Support Base64 if any
  // Convert /src/assets/documents/... to http://localhost:3000/assets/documents/...
  return path.replace('/src/assets/documents', 'http://localhost:3000/assets/documents');
}

function FileCard({ title, src, onClick }: { title: string; src: string; onClick: () => void }) {
  const isPdf = /\.pdf(\?|$)/i.test(src) || src.includes('/pdf') || src.includes('content-type=application%2Fpdf');
  if (isPdf) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden cursor-pointer hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 p-3 no-underline"
      >
        <FileText className="h-10 w-10 text-red-400" />
        <p className="text-xs font-medium truncate text-center w-full text-foreground">{title}</p>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground absolute top-2 left-2" />
      </a>
    );
  }
  return (
    <div
      className="group relative aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden cursor-pointer hover:shadow-md transition-all"
      onClick={onClick}
    >
      <img src={src} alt={title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Eye className="text-white h-8 w-8" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
        <p className="text-white text-xs font-medium truncate text-center">{title}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, dir }: { label: string; value: string; dir?: 'ltr' }) {
  const missing = value === MISSING_DATA || value === '—';
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-base font-medium ${missing ? 'text-muted-foreground' : 'text-foreground'}`}
        dir={dir}
      >
        {value}
      </span>
    </div>
  );
}

/** שורת תאריך — תמיד מוצגת; בלי תאריך → חסר נתון באפור */
function CompInfoRow({ label, date }: { label: string; date: string | null | undefined }) {
  const raw = date && String(date).trim() !== '' ? date : null;
  if (!raw) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-base font-medium text-muted-foreground">{MISSING_DATA}</span>
      </div>
    );
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-base font-medium text-muted-foreground">{MISSING_DATA}</span>
      </div>
    );
  }
  const today = new Date();
  const daysLeft = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const color = daysLeft < 0 ? 'text-red-400' : daysLeft <= 30 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-base font-semibold ${color}`}>{d.toLocaleDateString('he-IL')}</span>
    </div>
  );
}

const SECTION_ANCHOR_PREFIX = 'driver-section-';

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: driver, isLoading } = useDriver(id || '');
  const scrolledRef = useRef(false);

  // גלילה לאזור המתאים כשמגיעים מלחיצה על משבצת בכרטיס (/?section=personal|organizational|licenses|safety)
  const sectionParam = searchParams.get(DRIVER_SECTION_QUERY_PARAM);
  useEffect(() => {
    scrolledRef.current = false;
  }, [id, sectionParam]);

  useEffect(() => {
    const section = sectionParam as DriverSectionId | null;
    if (!section || !driver || scrolledRef.current) return;
    const valid: string[] = ['personal', 'organizational', 'licenses', 'safety'];
    if (!valid.includes(section)) return;
    const el = document.getElementById(`${SECTION_ANCHOR_PREFIX}${section}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      scrolledRef.current = true;
      const next = new URLSearchParams(searchParams);
      next.delete(DRIVER_SECTION_QUERY_PARAM);
      setSearchParams(next, { replace: true });
    }
  }, [driver, sectionParam, searchParams, setSearchParams]);
  const { data: dbDocuments } = useDriverDocuments(id || '');
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const [selectedImage, setSelectedImage] = useState<{ src: string; title: string } | null>(null);

  // assignedVehicles no longer used in hero (shown in list card instead)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/drivers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </header>
        <main className="container py-6 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/drivers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
              <h1 className="font-bold text-xl">נהג לא נמצא</h1>
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Card><CardContent className="p-4 sm:p-8 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">הנהג המבוקש לא נמצא במערכת</p>
            <Link to="/drivers"><Button className="mt-4">חזור לרשימת הנהגים</Button></Link>
          </CardContent></Card>
        </main>
      </div>
    );
  }

  const license = calculateStatusWithDays(driver.license_expiry);

  // Documents from driver_documents table (wizard + manually uploaded)
  const dbDocs: DriverDocument[] = dbDocuments ?? [];
  const dbUrls = new Set(dbDocs.map(d => d.file_url));

  // Legacy fields — only add if not already covered by a DB doc (avoids duplicates)
  const legacyDocs: DriverDocument[] = [];
  if (driver.license_front_url && !dbUrls.has(driver.license_front_url)) {
    legacyDocs.push({
      id: 'legacy-front',
      driver_id: driver.id,
      title: 'רישיון נהיגה (קדמי)',
      file_url: driver.license_front_url,
      created_at: new Date().toISOString()
    });
  }
  if (driver.license_back_url && !dbUrls.has(driver.license_back_url)) {
    legacyDocs.push({
      id: 'legacy-back',
      driver_id: driver.id,
      title: 'רישיון נהיגה (אחורי)',
      file_url: driver.license_back_url,
      created_at: new Date().toISOString()
    });
  }
  if (driver.health_declaration_url && !dbUrls.has(driver.health_declaration_url)) {
    legacyDocs.push({
      id: 'legacy-health',
      driver_id: driver.id,
      title: 'הצהרת בריאות',
      file_url: driver.health_declaration_url,
      created_at: new Date().toISOString()
    });
  }

  const allDocuments: DriverDocument[] = [...dbDocs, ...legacyDocs];
  void allDocuments; // available for future use (e.g. document folder)

  const assignedVehicles = (activeAssignments ?? [])
    .filter((a) => a.driver_id === driver.id && a.vehicle)
    .map((a) => a.vehicle!)
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link to="/drivers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
                <div>
                  <h1 className="font-bold text-xl text-foreground">{driver.full_name}</h1>
                  <p className="text-sm text-muted-foreground">ת.ז. {driver.id_number}</p>
                </div>
              </div>
              <Link to={`/drivers/${driver.id}/edit`}>
                <Button variant="outline" size="sm"><Edit className="h-4 w-4 ml-1" />עריכה</Button>
              </Link>
            </div>
            {/* רכב משויך — מתחת לשם, לא בתוך המשבצות */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="text-xs font-medium text-muted-foreground">רכב משויך</span>
              {assignedVehicles.length > 0 ? (
                assignedVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                  >
                    <Car className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate max-w-[200px]">{v.manufacturer} {v.model}</span>
                    <span className="text-xs text-muted-foreground">({v.plate_number})</span>
                  </div>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Car className="h-3.5 w-3.5" />
                  אין רכב משויך
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container space-y-5 py-6">
        <>
            {/* ── Two-column grid — קודם כרטיסי המידע (כמו בתמונה השנייה) ── */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Left column */}
              <div className="space-y-4">

                {/* Personal details — עוגן ל-section=personal */}
                <div id={`${SECTION_ANCHOR_PREFIX}personal`} className="scroll-mt-28" />
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-sky-500/10">
                        <User className="h-4 w-4 text-sky-400" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">פרטים אישיים</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <InfoRow label="ת.ז." value={orMissing(driver.id_number)} />
                    <InfoRow
                      label="תאריך לידה"
                      value={
                        orMissingDate(driver.birth_date)
                          ? new Date(driver.birth_date!).toLocaleDateString('he-IL')
                          : MISSING_DATA
                      }
                    />
                    <InfoRow label="עיר" value={orMissing(driver.city)} />
                    <InfoRow label="כתובת" value={orMissing(driver.address)} />
                    <InfoRow label="הערה 1" value={orMissing(driver.note1)} />
                    <InfoRow label="הערה 2" value={orMissing(driver.note2)} />
                    <InfoRow label="דירוג" value={orMissing(driver.rating)} />
                  </CardContent>
                </Card>

                {/* Contact */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-cyan-500/10">
                        <Phone className="h-4 w-4 text-cyan-400" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">פרטי קשר</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <InfoRow label="טלפון" value={orMissing(driver.phone)} dir="ltr" />
                    <InfoRow label="מייל" value={orMissing(driver.email)} dir="ltr" />
                  </CardContent>
                </Card>

              </div>

              {/* Right column */}
              <div className="space-y-4">

                {/* Employment — עוגן ל-section=organizational (תפקיד, מחלקה) */}
                <div id={`${SECTION_ANCHOR_PREFIX}organizational`} className="scroll-mt-28" />
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-purple-500/10">
                        <Briefcase className="h-4 w-4 text-purple-400" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">פרטי העסקה</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <InfoRow label="מ. עובד" value={orMissing(driver.employee_number)} />
                    <InfoRow label="קוד נהג" value={orMissing(driver.driver_code)} />
                    <InfoRow label="תפקיד" value={orMissing(driver.job_title)} />
                    <InfoRow label="מחלקה" value={orMissing(driver.department)} />
                    <InfoRow label="מחוז" value={orMissing(driver.division)} />
                    <InfoRow label="אזור" value={orMissing(driver.area)} />
                    <InfoRow label="קבוצה" value={orMissing(driver.group_name)} />
                    <InfoRow label="קוד קבוצה" value={orMissing(driver.group_code)} />
                    <InfoRow label="כשירות" value={orMissing(driver.eligibility)} />
                    <InfoRow
                      label="ת. תחילת עבודה"
                      value={
                        orMissingDate(driver.work_start_date)
                          ? new Date(driver.work_start_date!).toLocaleDateString('he-IL')
                          : MISSING_DATA
                      }
                    />
                  </CardContent>
                </Card>

                {/* License & Compliance — licenses + safety באותו כרטיס, שני עוגנים */}
                <div id={`${SECTION_ANCHOR_PREFIX}licenses`} className="scroll-mt-28" />
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-amber-500/10">
                        <CreditCard className="h-4 w-4 text-amber-400" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">רישיונות ותאימות</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {/* License — main row with status badge; מספר רישיון תמיד בשורה */}
                    <div className="flex items-center justify-between py-2 border-b border-border/30">
                      <div>
                        <p className="text-base font-semibold">רישיון נהיגה</p>
                        <p className="text-sm text-muted-foreground">
                          מס&apos; {orMissing(driver.license_number)}
                        </p>
                      </div>
                      <div className="text-left space-y-0.5">
                        <StatusBadge status={license.status} daysLeft={license.daysLeft} />
                        <p className="text-sm text-muted-foreground">
                          {orMissingDate(driver.license_expiry)
                            ? new Date(driver.license_expiry).toLocaleDateString('he-IL')
                            : MISSING_DATA}
                        </p>
                      </div>
                    </div>
                    <div id={`${SECTION_ANCHOR_PREFIX}safety`} className="scroll-mt-28 -mt-2 pt-2 border-t border-border/20" />
                    <CompInfoRow label="הצהרת בריאות" date={driver.health_declaration_date} />
                    <CompInfoRow label="הדרכת בטיחות" date={driver.safety_training_date} />
                    <CompInfoRow label="תקנה 585ב'" date={driver.regulation_585b_date} />
                    <CompInfoRow label="מבחן מעשי" date={driver.practical_driving_test_date} />
                    <CompInfoRow label="היתר בני משפחה" date={driver.family_permit_date} />
                    <InfoRow label="היתר נהיגה" value={orMissing(driver.driving_permit)} />
                    <InfoRow label="איש שטח" value={driver.is_field_person ? 'כן' : 'לא'} />
                  </CardContent>
                </Card>

              </div>
            </div>

            {/* תיקיות ניהול נהג הועברו לדף הרשימה (/drivers?folders=id) */}
        </>
      </main>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="w-[95vw] max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none text-white">
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <div className="absolute top-0 right-0 p-4 z-50">
              <button
                onClick={() => setSelectedImage(null)}
                className="bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            {selectedImage && (
              <div className="space-y-2 text-center">
                <img
                  src={selectedImage.src}
                  alt={selectedImage.title}
                  className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
                />
                <p className="text-lg font-medium drop-shadow-md">{selectedImage.title}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
