import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDriver } from '@/hooks/useDrivers';
import { useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogClose, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowRight, User, CreditCard, Phone, Mail, MapPin, Briefcase, Car, Edit, Shield, FileText, X, Eye
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

function DocumentThumbnail({ title, src, onClick }: { title: string; src: string; onClick: () => void }) {
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

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: driver, isLoading } = useDriver(id || '');
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

  // Combine header-level legacy docs with the dynamic array
  const allDocuments: DriverDocument[] = [
    ...(driver.documents || []),
  ];

  // ALWAYS check and add legacy fields if they exist (backward compatibility AND mixed mode)
  if (driver.license_front_url) {
    allDocuments.push({
      id: 'legacy-front',
      driver_id: driver.id,
      title: 'רישיון נהיגה (קדמי)',
      file_url: driver.license_front_url,
      created_at: new Date().toISOString()
    });
  }
  if (driver.license_back_url) {
    allDocuments.push({
      id: 'legacy-back',
      driver_id: driver.id,
      title: 'רישיון נהיגה (אחורי)',
      file_url: driver.license_back_url,
      created_at: new Date().toISOString()
    });
  }
  if (driver.health_declaration_url) {
    allDocuments.push({
      id: 'legacy-health',
      driver_id: driver.id,
      title: 'הצהרת בריאות',
      file_url: driver.health_declaration_url,
      created_at: new Date().toISOString()
    });
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/drivers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
              <div>
                <h1 className="font-bold text-xl">{driver.full_name}</h1>
                <p className="text-sm text-muted-foreground">ת.ז. {driver.id_number}</p>
              </div>
            </div>
            <Link to={`/drivers/${driver.id}/edit`}>
              <Button variant="outline" size="sm"><Edit className="h-4 w-4 ml-1" />עריכה</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-4">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                <User className="h-5 w-5 text-accent" />
              </div>
              <CardTitle>פרטי קשר</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {driver.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span dir="ltr">{driver.phone}</span>
              </div>
            )}
            {driver.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span dir="ltr">{driver.email}</span>
              </div>
            )}
            {driver.address && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{driver.address}</span>
              </div>
            )}
            {!driver.phone && !driver.email && !driver.address && (
              <p className="text-muted-foreground">לא הוזנו פרטי קשר</p>
            )}
          </CardContent>
        </Card>

        {/* Professional */}
        {(driver.job_title || driver.department) && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>מידע מקצועי</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {driver.job_title && <div><p className="text-sm text-muted-foreground">תפקיד</p><p className="font-medium">{driver.job_title}</p></div>}
              {driver.department && <div><p className="text-sm text-muted-foreground">מחלקה</p><p className="font-medium">{driver.department}</p></div>}
            </CardContent>
          </Card>
        )}

        {/* License & Compliance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <CreditCard className="h-5 w-5 text-amber-600" />
              </div>
              <CardTitle>רישיון ותאימות</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">רישיון נהיגה</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(driver.license_expiry).toLocaleDateString('he-IL')}
                </p>
              </div>
              <StatusBadge status={license.status} daysLeft={license.daysLeft} />
            </div>
            {driver.license_number && (
              <div className="text-sm"><span className="text-muted-foreground">מספר רישיון: </span>{driver.license_number}</div>
            )}
            {driver.health_declaration_date && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">הצהרת בריאות</p>
                  <p className="text-sm text-muted-foreground">{new Date(driver.health_declaration_date).toLocaleDateString('he-IL')}</p>
                </div>
              </div>
            )}
            {driver.safety_training_date && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">הדרכת בטיחות</p>
                  <p className="text-sm text-muted-foreground">{new Date(driver.safety_training_date).toLocaleDateString('he-IL')}</p>
                </div>
              </div>
            )}
            {driver.regulation_585b_date && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">תקנה 585ב'</p>
                  <p className="text-sm text-muted-foreground">{new Date(driver.regulation_585b_date).toLocaleDateString('he-IL')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scanned Documents */}
        {/* Scanned Documents */}
        {allDocuments.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle>מסמכים סרוקים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {allDocuments.map((doc) => (
                <DocumentThumbnail
                  key={doc.id}
                  title={doc.title}
                  src={getDocumentUrl(doc.file_url)!}
                  onClick={() => setSelectedImage({ src: getDocumentUrl(doc.file_url)!, title: doc.title })}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Assigned Vehicles */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Car className="h-5 w-5 text-green-600" />
              </div>
              <CardTitle>רכבים מוקצים</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {assignedVehicles.length > 0 ? (
              <div className="space-y-2">
                {assignedVehicles.map((vehicle) => (
                  <Link
                    key={vehicle.id}
                    to={`/vehicles/${vehicle.id}`}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Car className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{vehicle.manufacturer} {vehicle.model}</p>
                      <p className="text-sm text-muted-foreground">{vehicle.plate_number}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">אין רכבים מוקצים</p>
            )}
          </CardContent>
        </Card>
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
