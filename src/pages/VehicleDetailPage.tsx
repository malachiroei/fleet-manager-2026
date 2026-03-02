import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVehicle, useUpdateVehicle } from '@/hooks/useVehicles';
import { useDriver } from '@/hooks/useDrivers';
import { useHandovers } from '@/hooks/useHandovers';
import { usePricingLookup, useSyncVehicleFromPricing } from '@/hooks/usePricingData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowRight, 
  Car,
  Calendar,
  Gauge,
  FileText,
  User,
  Wrench,
  Shield,
  Edit,
  ClipboardList,
  Fuel,
  Camera,
  RefreshCw,
  Loader2,
  Zap
} from 'lucide-react';
import type { ComplianceStatus } from '@/types/fleet';

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

function calculateStatus(expiryDate: string): { status: ComplianceStatus; daysLeft: number } {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const status: ComplianceStatus = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'warning' : 'valid';
  return { status, daysLeft };
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: vehicle, isLoading } = useVehicle(id || '');
  const { data: assignedDriver } = useDriver(vehicle?.assigned_driver_id || '');
  const { data: handovers } = useHandovers(id);
  const updateVehicle = useUpdateVehicle();
  const syncFromPricing = useSyncVehicleFromPricing();
  const [isSyncing, setIsSyncing] = useState(false);
  const { data: pricingLookup } = usePricingLookup(
    vehicle?.manufacturer_code || null,
    vehicle?.model_code || null,
    vehicle?.year || null
  );

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !handovers || handovers.length === 0) return;

    const target = document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [handovers]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/vehicles">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
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

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/vehicles">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="font-bold text-xl">רכב לא נמצא</h1>
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">הרכב המבוקש לא נמצא במערכת</p>
              <Link to="/vehicles">
                <Button className="mt-4">חזור לרשימת הרכבים</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const test = calculateStatus(vehicle.test_expiry);
  const insurance = calculateStatus(vehicle.insurance_expiry);
  const taxValuePrice = vehicle.tax_value_price ?? pricingLookup?.usage_value ?? null;
  const taxValueYear = vehicle.tax_year ?? pricingLookup?.usage_year ?? null;
  const adjustedPrice = vehicle.adjusted_price ?? pricingLookup?.adjusted_price ?? null;

  const handleSyncFromPricing = async () => {
    if (!vehicle.manufacturer_code || !vehicle.model_code || !vehicle.year) {
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncFromPricing.mutateAsync({
        vehicleId: vehicle.id,
        manufacturerCode: vehicle.manufacturer_code,
        modelCode: vehicle.model_code,
        year: vehicle.year,
      });
      // Update local vehicle with pricing data
      const p = result.pricingRow;
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        tax_value_price: p.usage_value,
        tax_year: p.usage_year,
        adjusted_price: p.adjusted_price,
        vehicle_type_code: p.vehicle_type_code,
        model_description: p.model_description,
        fuel_type: p.fuel_type,
        commercial_name: p.commercial_name,
        is_automatic: p.is_automatic,
        drive_type: p.drive_type,
        green_score: p.green_score,
        pollution_level: p.pollution_level,
        engine_volume: p.engine_volume_cc?.toString() || vehicle.engine_volume,
        weight: p.weight,
        list_price: p.list_price,
        effective_date: p.effective_date,
      });
    } catch {
      // handled by mutation
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/vehicles">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-bold text-xl">{vehicle.manufacturer} {vehicle.model}</h1>
                <p className="text-sm text-muted-foreground">{vehicle.plate_number}</p>
              </div>
            </div>
            <Link to={`/vehicles/${vehicle.id}/edit`}>
              <Button variant="outline" size="sm"><Edit className="h-4 w-4 ml-1" />עריכה</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-4">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>פרטי הרכב</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">יצרן</p>
                <p className="font-medium">{vehicle.manufacturer}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">דגם</p>
                <p className="font-medium">{vehicle.model}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">שנה</p>
                <p className="font-medium">{vehicle.year}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">מספר רישוי</p>
                <p className="font-medium" dir="ltr">{vehicle.plate_number}</p>
              </div>
              {vehicle.color && (
                <div>
                  <p className="text-sm text-muted-foreground">צבע</p>
                  <p className="font-medium">{vehicle.color}</p>
                </div>
              )}
              {vehicle.engine_volume && (
                <div>
                  <p className="text-sm text-muted-foreground">נפח מנוע</p>
                  <p className="font-medium">{vehicle.engine_volume}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pricing / Tax Data - All 19 columns */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>נתוני מחירון</CardTitle>
              </div>
              {vehicle.manufacturer_code && vehicle.model_code && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncFromPricing}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 ml-1" />
                  )}
                  סנכרון מהמחירון
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              {/* A - שנת מס */}
              <div>
                <p className="text-sm text-muted-foreground">שנת מס</p>
                <p className="font-medium">{taxValueYear || '-'}</p>
              </div>
              {/* B - שנת רישום */}
              <div>
                <p className="text-sm text-muted-foreground">שנת רישום</p>
                <p className="font-medium">{vehicle.year}</p>
              </div>
              {/* C - קוד סוג רכב */}
              <div>
                <p className="text-sm text-muted-foreground">קוד סוג רכב</p>
                <p className="font-medium">{vehicle.vehicle_type_code || '-'}</p>
              </div>
              {/* D - קוד תוצר */}
              <div>
                <p className="text-sm text-muted-foreground">קוד תוצר</p>
                <p className="font-medium font-mono">{vehicle.manufacturer_code || '-'}</p>
              </div>
              {/* E - שם תוצר */}
              <div>
                <p className="text-sm text-muted-foreground">שם תוצר</p>
                <p className="font-medium">{vehicle.manufacturer}</p>
              </div>
              {/* F - קוד דגם */}
              <div>
                <p className="text-sm text-muted-foreground">קוד דגם</p>
                <p className="font-medium font-mono">{vehicle.model_code || '-'}</p>
              </div>
              {/* G - תאור דגם */}
              <div>
                <p className="text-sm text-muted-foreground">תיאור דגם</p>
                <p className="font-medium">{vehicle.model_description || '-'}</p>
              </div>
              {/* H - סוג דלק */}
              <div>
                <p className="text-sm text-muted-foreground">סוג דלק</p>
                <p className="font-medium">{vehicle.fuel_type || '-'}</p>
              </div>
              {/* I - כינוי מסחרי */}
              <div>
                <p className="text-sm text-muted-foreground">כינוי מסחרי</p>
                <p className="font-medium">{vehicle.commercial_name || '-'}</p>
              </div>
              {/* J - אוטומט */}
              <div>
                <p className="text-sm text-muted-foreground">אוטומטי</p>
                <p className="font-medium">{vehicle.is_automatic === true ? 'כן' : vehicle.is_automatic === false ? 'לא' : '-'}</p>
              </div>
              {/* K - סוג הנעה */}
              <div>
                <p className="text-sm text-muted-foreground">סוג הנעה</p>
                <p className="font-medium">{vehicle.drive_type || '-'}</p>
              </div>
              {/* L - ציון ירוק */}
              <div>
                <p className="text-sm text-muted-foreground">ציון ירוק</p>
                <p className="font-medium">{vehicle.green_score ?? '-'}</p>
              </div>
              {/* M - דרגת זיהום */}
              <div>
                <p className="text-sm text-muted-foreground">דרגת זיהום</p>
                <p className="font-medium">{vehicle.pollution_level ?? '-'}</p>
              </div>
              {/* N - נפח מנוע */}
              <div>
                <p className="text-sm text-muted-foreground">נפח מנוע (סמ״ק)</p>
                <p className="font-medium">{vehicle.engine_volume || '-'}</p>
              </div>
              {/* O - משקל */}
              <div>
                <p className="text-sm text-muted-foreground">משקל (ק״ג)</p>
                <p className="font-medium">{vehicle.weight ?? '-'}</p>
              </div>
              {/* P - תאריך תחולה */}
              <div>
                <p className="text-sm text-muted-foreground">תאריך תחולה</p>
                <p className="font-medium">{vehicle.effective_date || '-'}</p>
              </div>
              {/* Q - מחיר מחירון */}
              <div>
                <p className="text-sm text-muted-foreground">מחיר מחירון</p>
                <p className="font-medium">{vehicle.list_price ? `₪${vehicle.list_price.toLocaleString()}` : '-'}</p>
              </div>
              {/* R - מחיר מתואם */}
              <div>
                <p className="text-sm text-muted-foreground">מחיר מתואם</p>
                <p className="font-medium">{adjustedPrice ? `₪${adjustedPrice.toLocaleString()}` : '-'}</p>
              </div>
              {/* S - שווי שימוש */}
              <div>
                <p className="text-sm text-muted-foreground">שווי שימוש</p>
                <p className="font-medium">{taxValuePrice ? `₪${taxValuePrice.toLocaleString()}` : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Odometer */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <Gauge className="h-5 w-5 text-accent" />
              </div>
              <CardTitle>מד אוץ</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{vehicle.current_odometer.toLocaleString()}</span>
              <span className="text-muted-foreground">ק"מ</span>
            </div>
            {vehicle.last_odometer_date && (
              <p className="text-sm text-muted-foreground mt-1">
                עודכן לאחרונה: {new Date(vehicle.last_odometer_date).toLocaleDateString('he-IL')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Compliance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <CardTitle>תקינות</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">טסט</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}
                </p>
              </div>
              <StatusBadge status={test.status} daysLeft={test.daysLeft} />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">ביטוח</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}
                </p>
              </div>
              <StatusBadge status={insurance.status} daysLeft={insurance.daysLeft} />
            </div>
          </CardContent>
        </Card>

        {/* Maintenance */}
        {(vehicle.next_maintenance_date || vehicle.next_maintenance_km) && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Wrench className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle>טיפול הבא</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {vehicle.next_maintenance_date && (
                <div>
                  <p className="text-sm text-muted-foreground">תאריך</p>
                  <p className="font-medium">
                    {new Date(vehicle.next_maintenance_date).toLocaleDateString('he-IL')}
                  </p>
                </div>
              )}
              {vehicle.next_maintenance_km && (
                <div>
                  <p className="text-sm text-muted-foreground">קילומטראז'</p>
                  <p className="font-medium">{vehicle.next_maintenance_km.toLocaleString()} ק"מ</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Assigned Driver */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <CardTitle>נהג מוקצה</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {assignedDriver ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{assignedDriver.full_name}</p>
                  {assignedDriver.phone && (
                    <p className="text-sm text-muted-foreground">{assignedDriver.phone}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">אין נהג מוקצה</p>
            )}
          </CardContent>
        </Card>

        {/* Ownership Info */}
        {(vehicle.ownership_type || vehicle.leasing_company_name) && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle>בעלות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {vehicle.ownership_type && (
                <div>
                  <p className="text-sm text-muted-foreground">סוג בעלות</p>
                  <p className="font-medium">{vehicle.ownership_type}</p>
                </div>
              )}
              {vehicle.leasing_company_name && (
                <div>
                  <p className="text-sm text-muted-foreground">חברת ליסינג</p>
                  <p className="font-medium">{vehicle.leasing_company_name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Handover History */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>היסטוריית מסירות</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {handovers && handovers.length > 0 ? (
              <div className="space-y-3">
                {handovers.map((h: any) => (
                  <div id={`handover-${h.id}`} key={h.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant={h.handover_type === 'delivery' ? 'default' : 'secondary'}>
                        {h.handover_type === 'delivery' ? 'מסירה' : 'החזרה'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(h.handover_date).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                    {h.driver && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{h.driver.full_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3.5 w-3.5" />
                        {h.odometer_reading.toLocaleString()} ק"מ
                      </span>
                      <span className="flex items-center gap-1">
                        <Fuel className="h-3.5 w-3.5" />
                        {h.fuel_level}/8
                      </span>
                    </div>
                    {(h.photo_front_url || h.photo_back_url || h.photo_right_url || h.photo_left_url) && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {[h.photo_front_url, h.photo_back_url, h.photo_right_url, h.photo_left_url].filter(Boolean).map((url: string, i: number) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt={`תמונה ${i + 1}`} className="rounded border border-border aspect-square object-cover w-full" />
                          </a>
                        ))}
                      </div>
                    )}
                    {h.signature_url && (
                      <div className="mt-1">
                        <p className="text-xs text-muted-foreground mb-1">חתימה:</p>
                        <img src={h.signature_url} alt="חתימה" className="h-10 bg-white rounded border border-border px-2" />
                      </div>
                    )}
                    {h.notes && (
                      <p className="text-sm text-muted-foreground">{h.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">אין היסטוריית מסירות</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
