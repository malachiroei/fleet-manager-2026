import { useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useDriver } from '@/hooks/useDrivers';
import DriverFolders from '@/components/DriverFolders';
import { useDriverDocuments } from '@/hooks/useDriverDocuments';
import { useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogClose, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowRight, User, CreditCard, Phone, Mail, MapPin, Briefcase, Car, Edit, Shield, FileText, X, Eye, ExternalLink
} from 'lucide-react';
import type { ComplianceStatus, DriverDocument } from '@/types/fleet';

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
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground" dir={dir}>{value}</span>
    </div>
  );
}

function CompInfoRow({ label, date }: { label: string; date: string }) {
  const d = new Date(date);
  const today = new Date();
  const daysLeft = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const color = daysLeft < 0 ? 'text-red-400' : daysLeft <= 30 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${color}`}>{d.toLocaleDateString('he-IL')}</span>
    </div>
  );
}

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const section = location.hash.replace('#', '') || 'overview';
  const isDriverFolders = section === 'driver-folders';
  const { data: driver, isLoading } = useDriver(id || '');
  const { data: dbDocuments } = useDriverDocuments(id || '');
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const [selectedImage, setSelectedImage] = useState<{ src: string; title: string } | null>(null);

  const assignedVehicles = (activeAssignments ?? [])
    .filter((assignment) => assignment.driver_id === id)
    .map((assignment) => assignment.vehicle)
    .filter((vehicle): vehicle is NonNullable<(typeof activeAssignments)[number]['vehicle']> => !!vehicle);

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
          <Card><CardContent className="p-8 text-center">
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

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
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
        </div>
      </header>

      {/* Tab navigation */}
      <div className="sticky top-[65px] z-10 bg-card border-b border-border">
        <div className="container">
          <nav className="flex gap-1 overflow-x-auto" aria-label="סעיפי נהג">
            {[
              { label: 'סקירה', hash: '' },
              { label: 'תיקיות ניהול', hash: '#driver-folders' },
            ].map(({ label, hash }) => {
              const active = hash === '' ? (!section || section === 'overview') : section === hash.slice(1);
              return (
                <Link
                  key={hash}
                  to={`/drivers/${driver.id}${hash}`}
                  className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="container py-6 space-y-4">
        {/* Folders view */}
        {isDriverFolders && <DriverFolders driver={driver} />}

        {!isDriverFolders && (
          <>
            {/* ── Hero card ─────────────────────────────────────── */}
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-l from-primary via-accent/50 to-primary/20" />
              <CardContent className="p-5">
                <div className="flex items-start gap-5">
                  {/* Avatar */}
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg ${
                    license.status === 'expired' ? 'bg-red-600' : license.status === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'
                  }`}>
                    {driver.full_name.trim().slice(0, 2)}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-foreground">{driver.full_name}</h2>
                      <StatusBadge status={license.status} daysLeft={license.daysLeft} />
                      {!driver.is_active && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground border border-border">לא פעיל</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                      <span>ת.ז. {driver.id_number}</span>
                      {driver.driver_code && <span>קוד: {driver.driver_code}</span>}
                      {driver.employee_number && <span>מ. עובד: {driver.employee_number}</span>}
                      {driver.job_title && <span>{driver.job_title}</span>}
                      {driver.department && <span>{driver.department}</span>}
                    </div>
                    {/* Assigned vehicles chips */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assignedVehicles.length > 0 ? (
                        assignedVehicles.map((v) => (
                          <Link
                            key={v.id}
                            to={`/vehicles/${v.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary px-3 py-1 text-xs hover:bg-primary/20 transition-colors"
                          >
                            <Car className="h-3 w-3" />
                            {v.manufacturer} {v.model} · {v.plate_number}
                          </Link>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">אין רכב משויך</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Two-column grid ───────────────────────────────── */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Left column */}
              <div className="space-y-4">

                {/* Personal details */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-sky-500/10">
                        <User className="h-4 w-4 text-sky-400" />
                      </div>
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">פרטים אישיים</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <InfoRow label="ת.ז." value={driver.id_number} />
                    {driver.birth_date && (
                      <InfoRow label="תאריך לידה" value={new Date(driver.birth_date).toLocaleDateString('he-IL')} />
                    )}
                    {driver.city && <InfoRow label="עיר" value={driver.city} />}
                    {driver.address && <InfoRow label="כתובת" value={driver.address} />}
                    {driver.note1 && <InfoRow label="הערה 1" value={driver.note1} />}
                    {driver.note2 && <InfoRow label="הערה 2" value={driver.note2} />}
                    {driver.rating && <InfoRow label="דירוג" value={driver.rating} />}
                  </CardContent>
                </Card>

                {/* Contact */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-cyan-500/10">
                        <Phone className="h-4 w-4 text-cyan-400" />
                      </div>
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">פרטי קשר</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {driver.phone && <InfoRow label="טלפון" value={driver.phone} dir="ltr" />}
                    {driver.email && <InfoRow label="מייל" value={driver.email} dir="ltr" />}
                    {!driver.phone && !driver.email && (
                      <p className="text-sm text-muted-foreground py-1">לא הוזנו פרטי קשר</p>
                    )}
                  </CardContent>
                </Card>

              </div>

              {/* Right column */}
              <div className="space-y-4">

                {/* Employment */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-purple-500/10">
                        <Briefcase className="h-4 w-4 text-purple-400" />
                      </div>
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">פרטי העסקה</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {driver.employee_number && <InfoRow label="מ. עובד" value={driver.employee_number} />}
                    {driver.driver_code && <InfoRow label="קוד נהג" value={driver.driver_code} />}
                    {driver.job_title && <InfoRow label="תפקיד" value={driver.job_title} />}
                    {driver.department && <InfoRow label="מחלקה" value={driver.department} />}
                    {driver.division && <InfoRow label="מחוז" value={driver.division} />}
                    {driver.area && <InfoRow label="אזור" value={driver.area} />}
                    {driver.group_name && <InfoRow label="קבוצה" value={driver.group_name} />}
                    {driver.group_code && <InfoRow label="קוד קבוצה" value={driver.group_code} />}
                    {driver.eligibility && <InfoRow label="כשירות" value={driver.eligibility} />}
                    {driver.work_start_date && (
                      <InfoRow label="ת. תחילת עבודה" value={new Date(driver.work_start_date).toLocaleDateString('he-IL')} />
                    )}
                    {!driver.employee_number && !driver.job_title && !driver.department && (
                      <p className="text-sm text-muted-foreground py-1">לא הוזנו פרטי העסקה</p>
                    )}
                  </CardContent>
                </Card>

                {/* License & Compliance */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-amber-500/10">
                        <CreditCard className="h-4 w-4 text-amber-400" />
                      </div>
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">רישיונות ותאימות</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {/* License — main row with status badge */}
                    <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                      <div>
                        <p className="text-sm font-medium">רישיון נהיגה</p>
                        {driver.license_number && (
                          <p className="text-xs text-muted-foreground">מס' {driver.license_number}</p>
                        )}
                      </div>
                      <div className="text-left space-y-0.5">
                        <StatusBadge status={license.status} daysLeft={license.daysLeft} />
                        <p className="text-xs text-muted-foreground">{new Date(driver.license_expiry).toLocaleDateString('he-IL')}</p>
                      </div>
                    </div>
                    {driver.health_declaration_date && (
                      <CompInfoRow label="הצהרת בריאות" date={driver.health_declaration_date} />
                    )}
                    {driver.safety_training_date && (
                      <CompInfoRow label="הדרכת בטיחות" date={driver.safety_training_date} />
                    )}
                    {driver.regulation_585b_date && (
                      <CompInfoRow label="תקנה 585ב'" date={driver.regulation_585b_date} />
                    )}
                    {driver.practical_driving_test_date && (
                      <CompInfoRow label="מבחן מעשי" date={driver.practical_driving_test_date} />
                    )}
                    {driver.family_permit_date && (
                      <CompInfoRow label="היתר בני משפחה" date={driver.family_permit_date} />
                    )}
                    {driver.driving_permit && (
                      <InfoRow label="היתר נהיגה" value={driver.driving_permit} />
                    )}
                    {driver.is_field_person && (
                      <InfoRow label="איש שטח" value="כן" />
                    )}
                  </CardContent>
                </Card>

              </div>
            </div>

            {/* ── Scanned Documents ─────────────────────────────── */}
            {allDocuments.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-blue-500/10">
                      <FileText className="h-4 w-4 text-blue-400" />
                    </div>
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">מסמכים סרוקים</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {allDocuments.map((doc) => (
                    <FileCard
                      key={doc.id}
                      title={doc.title}
                      src={getDocumentUrl(doc.file_url)!}
                      onClick={() => setSelectedImage({ src: getDocumentUrl(doc.file_url)!, title: doc.title })}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none text-white">
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
