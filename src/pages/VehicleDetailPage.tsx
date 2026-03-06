import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useVehicle, useUpdateVehicle, useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { useDriver } from '@/hooks/useDrivers';
import { useHandovers } from '@/hooks/useHandovers';
import { usePricingLookup, useSyncVehicleFromPricing } from '@/hooks/usePricingData';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import type { ComplianceStatus } from '@/types/fleet';
import { VehicleFolders } from '@/components/VehicleFolders';

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

function HandoverHistoryList({ handovers }: { handovers: any[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {handovers.map((h: any) => {
        const isOpen = openId === h.id;
        const date = new Date(h.handover_date);
        const dateStr = date.toLocaleDateString('he-IL');
        const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        return (
          <div id={`handover-${h.id}`} key={h.id} className="rounded-lg border border-border overflow-hidden">
            {/* Compact row */}
            <button
              onClick={() => setOpenId(isOpen ? null : h.id)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/60 transition-colors text-sm"
            >
              <div className="flex items-center gap-3">
                <Badge variant={h.handover_type === 'delivery' ? 'default' : 'secondary'} className="text-xs">
                  {h.handover_type === 'delivery' ? 'מסירה' : 'החזרה'}
                </Badge>
                <span className="font-medium">{dateStr}</span>
                <span className="text-muted-foreground">{timeStr}</span>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {/* Expanded details */}
            {isOpen && (
              <div className="px-4 py-3 space-y-3 border-t border-border bg-background">
                {h.driver && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{h.driver.full_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" />
                    {h.odometer_reading.toLocaleString()} ק&quot;מ
                  </span>
                  <span className="flex items-center gap-1">
                    <Fuel className="h-3.5 w-3.5" />
                    {h.fuel_level}/8
                  </span>
                </div>
                {(h.photo_front_url || h.photo_back_url || h.photo_right_url || h.photo_left_url) && (
                  <div className="grid grid-cols-4 gap-2">
                    {[h.photo_front_url, h.photo_back_url, h.photo_right_url, h.photo_left_url].filter(Boolean).map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`תמונה ${i + 1}`} className="rounded border border-border aspect-square object-cover w-full" />
                      </a>
                    ))}
                  </div>
                )}
                {h.signature_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">חתימה:</p>
                    <img src={h.signature_url} alt="חתימה" className="h-10 bg-white rounded border border-border px-2" />
                  </div>
                )}
                {h.notes && <p className="text-sm text-muted-foreground">{h.notes}</p>}
                {h.pdf_url && (
                  <a
                    href={h.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    צפה בטופס PDF
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { data: vehicle, isLoading } = useVehicle(id || '');
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const currentAssignedDriverId = (activeAssignments ?? []).find((assignment) => assignment.vehicle_id === vehicle?.id)?.driver_id ?? '';
  const { data: assignedDriver } = useDriver(currentAssignedDriverId || '');
  const { data: handovers } = useHandovers(id);
  const updateVehicle = useUpdateVehicle();
  const syncFromPricing = useSyncVehicleFromPricing();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const section = location.hash.replace('#', '');
  const isOverviewSection = section === 'overview';
  const isTaxSection = section === 'tax-data';
  const isHandoverSection = section === 'handover-history';
  const isDocumentsSection = section === 'vehicle-documents';
  const isFoldersSection    = section === 'vehicle-folders';

  const { data: vehicleDocuments = [], refetch: refetchVehicleDocuments } = useQuery({
    queryKey: ['vehicle-documents', vehicle?.id],
    enabled: !!vehicle?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_documents' as any)
        .select('id, title, file_url, created_at')
        .eq('vehicle_id', vehicle!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; file_url: string; created_at: string }>;
    },
  });
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
      <div className="min-h-screen bg-[#020617] text-white">
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
      <div className="min-h-screen bg-[#020617] text-white">
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

  const handleDocumentUpload = async (file: File | null) => {
    if (!file || !vehicle) return;

    setIsUploadingDocument(true);
    try {
      const fileName = `vehicle-files/${vehicle.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('vehicle-documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('vehicle-documents')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('vehicle_documents' as any)
        .insert({
          vehicle_id: vehicle.id,
          title: file.name,
          file_url: data.publicUrl,
          document_type: 'manual',
        });

      if (insertError) throw insertError;

      await refetchVehicleDocuments();
    } finally {
      setIsUploadingDocument(false);
    }
  };

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
    <div className="min-h-screen bg-[#020617] text-white">
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

      {/* Tab navigation */}
      <div className="sticky top-[65px] z-10 bg-card border-b border-border">
        <div className="container">
          <nav className="flex gap-1 overflow-x-auto" aria-label="סעיפי רכב">
            {[
              { label: 'סקירה', hash: '' },
              { label: 'נתוני מס', hash: '#tax-data' },
              { label: 'מסירות', hash: '#handover-history' },
              { label: 'תיקייות ניהול', hash: '#vehicle-folders' },
              { label: 'מסמכים', hash: '#vehicle-documents' },
            ].map(({ label, hash }) => {
              const active = hash === '' ? (!section || section === 'overview') : section === hash.slice(1);
              return (
                <Link
                  key={hash}
                  to={`/vehicles/${vehicle.id}${hash}`}
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
        {/* Basic Info */}
        {!isHandoverSection && !isTaxSection && !isDocumentsSection && <Card>
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
        </Card>}

        {/* Pricing / Tax Data - All 19 columns */}
        {isTaxSection && (
        <Card id="tax-data">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>נתוני מס</CardTitle>
              </div>
              {vehicle.manufacturer_code && vehicle.model_code ? (
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
                  סנכרון נתונים
                </Button>
              ) : (
                <Link to={`/vehicles/${vehicle.id}/edit`}>
                  <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
                    <Edit className="h-4 w-4 ml-1" />
                    הגדר קוד תוצר/דגם
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(!vehicle.manufacturer_code || !vehicle.model_code) && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                <span className="text-amber-400 text-lg leading-none mt-0.5">⚠️</span>
                <div className="space-y-1">
                  <p className="font-medium text-amber-300">חסרים קודי יצרן/דגם</p>
                  <p className="text-amber-400/80">
                    כדי לסנכרן נתוני מס ושווי שימוש, יש להגדיר{' '}
                    {!vehicle.manufacturer_code && <strong>קוד תוצר</strong>}
                    {!vehicle.manufacturer_code && !vehicle.model_code && ' ו'}
                    {!vehicle.model_code && <strong>קוד דגם</strong>}
                    {' '}בדף עריכת הרכב.
                  </p>
                  <Link to={`/vehicles/${vehicle.id}/edit`} className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline underline-offset-2 text-xs font-medium">
                    <Edit className="h-3 w-3" />
                    פתח עריכת רכב
                  </Link>
                </div>
              </div>
            )}
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
        )}

        {/* Odometer */}
        {(isOverviewSection || !section) && (
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
        )}

        {/* Compliance */}
        {(isOverviewSection || !section) && (
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
        )}

        {/* Maintenance */}
        {(isOverviewSection || !section) && (vehicle.next_maintenance_date || vehicle.next_maintenance_km) && (
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
        {(isOverviewSection || !section) && (
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
        )}

        {/* Ownership Info */}
        {(isOverviewSection || !section) && (vehicle.ownership_type || vehicle.leasing_company_name) && (
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
        {isHandoverSection && (
        <Card id="handover-history">
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
              <HandoverHistoryList handovers={handovers} />
            ) : (
              <p className="text-muted-foreground">אין היסטוריית מסירות</p>
            )}
          </CardContent>
        </Card>
        )}

        {/* Vehicle Folders */}
        {isFoldersSection && <VehicleFolders vehicle={vehicle} />}

        {/* Vehicle Documents */}
        {isDocumentsSection && (
          <Card id="vehicle-documents">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle>מסמכים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  onChange={(event) => handleDocumentUpload(event.target.files?.[0] ?? null)}
                  disabled={isUploadingDocument}
                />
                {isUploadingDocument && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {vehicleDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין מסמכים לרכב זה</p>
              ) : (
                <div className="space-y-2">
                  {vehicleDocuments.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-md border border-border p-2 text-foreground hover:bg-muted"
                    >
                      <span>{doc.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('he-IL')}</span>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
