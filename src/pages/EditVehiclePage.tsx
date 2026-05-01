import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  useVehicleSpecDirty,
  DIRTY_SOURCE_VEHICLE_EDIT,
} from '@/contexts/VehicleSpecDirtyContext';
import { useVehicle, useUpdateVehicle, useAssignDriverToVehicle, useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useAuth } from '@/hooks/useAuth';
import { usePricingLookup } from '@/hooks/usePricingData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Car, Settings, Shield, Building, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { ownershipSelectDefault } from '@/lib/vehicleOwnership';
import { normalizePlateNumber } from '@/lib/plateNumber';

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const complianceReturnTo = (location.state as { complianceReturnTo?: string } | null)?.complianceReturnTo?.trim() ?? '';
  const { data: vehicle, isLoading } = useVehicle(id || '');
  const { data: drivers } = useDrivers();
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const updateVehicle = useUpdateVehicle();
  const assignDriverToVehicle = useAssignDriverToVehicle();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [assignedDriverId, setAssignedDriverId] = useState<string | null>(null);
  const [manufacturerCode, setManufacturerCode] = useState<string>('');
  const [modelCode, setModelCode] = useState<string>('');
  const [taxValuePrice, setTaxValuePrice] = useState<string>('');
  const [taxValueYear, setTaxValueYear] = useState<string>('');
  const [adjustedPrice, setAdjustedPrice] = useState<string>('');
  const { setDirty, tryNavigate } = useVehicleSpecDirty();

  const slice10 = (x: string | null | undefined) =>
    x && String(x).length >= 10 ? String(x).slice(0, 10) : '';
  const [vehPickup, setVehPickup] = useState('');
  const [vehPurchase, setVehPurchase] = useState('');
  const [vehSale, setVehSale] = useState('');
  const [vehTest, setVehTest] = useState('');
  const [vehIns, setVehIns] = useState('');
  const [vehNextMaint, setVehNextMaint] = useState('');
  const [vehNextInspection, setVehNextInspection] = useState('');
  const [vehLastService, setVehLastService] = useState('');
  const datesInitForId = useRef<string | null>(null);

  useEffect(() => {
    return () => setDirty(DIRTY_SOURCE_VEHICLE_EDIT, false);
  }, [setDirty]);

  const markVehicleEditDirty = () => setDirty(DIRTY_SOURCE_VEHICLE_EDIT, true);

  const { data: pricingData } = usePricingLookup(
    manufacturerCode || null,
    modelCode || null
  );

  useEffect(() => {
    if (!vehicle) return;

    setManufacturerCode(vehicle.manufacturer_code || '');
    setModelCode(vehicle.model_code || '');
    setTaxValuePrice(vehicle.tax_value_price?.toString() || '');
    setTaxValueYear(vehicle.tax_year?.toString() || '');
    setAdjustedPrice(vehicle.adjusted_price?.toString() || '');
  }, [vehicle]);

  useEffect(() => {
    if (!vehicle?.id) return;
    if (datesInitForId.current === vehicle.id) return;
    datesInitForId.current = vehicle.id;
    setVehPickup(slice10(vehicle.pickup_date));
    setVehPurchase(slice10((vehicle as { purchase_date?: string | null }).purchase_date));
    setVehSale(slice10((vehicle as { sale_date?: string | null }).sale_date));
    setVehTest(slice10(vehicle.test_expiry));
    setVehIns(slice10(vehicle.insurance_expiry));
    setVehNextMaint(slice10(vehicle.next_maintenance_date));
    setVehNextInspection(slice10(vehicle.next_inspection_date));
    setVehLastService(slice10(vehicle.last_service_date));
  }, [vehicle]);

  useEffect(() => {
    const h = location.hash.replace(/^#/, '').trim();
    if (!h || !vehicle?.id) return;
    requestAnimationFrame(() => {
      document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [vehicle?.id, location.hash]);

  useEffect(() => {
    if (!pricingData) return;

    setTaxValuePrice(pricingData.usage_value?.toString() || '');
    setTaxValueYear(pricingData.usage_year?.toString() || '');
    setAdjustedPrice(pricingData.adjusted_price?.toString() || '');
  }, [pricingData]);

  // Initialize state from vehicle data
  const activeValue = isActive ?? vehicle?.is_active ?? true;
  const currentActiveDriverId = (activeAssignments ?? []).find((assignment) => assignment.vehicle_id === vehicle?.id)?.driver_id ?? '';
  const driverValue = assignedDriverId ?? currentActiveDriverId;

  if (isLoading) {
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <Skeleton className="h-6 w-48" />
          </div></div>
        </header>
        <main className="container py-6 space-y-4"><Skeleton className="h-48 w-full" /></main>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <h1 className="font-bold text-xl">רכב לא נמצא</h1>
          </div></div>
        </header>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      const plateRaw = normalizePlateNumber(formData.get('plate_number') as string);
      if (!plateRaw) {
        toast.error('נא להזין מספר רישוי (ספרות בלבד)');
        setIsSubmitting(false);
        return;
      }
      if (!vehTest.trim() || !vehIns.trim()) {
        toast.error('נא למלא תאריכי תוקף לטסט ולביטוח');
        setIsSubmitting(false);
        return;
      }

      const newDriverId = driverValue || null;
      const oldDriverId = currentActiveDriverId || null;

      await updateVehicle.mutateAsync({
        id: vehicle.id,
        plate_number: plateRaw,
        manufacturer: formData.get('manufacturer') as string,
        model: formData.get('model') as string,
        year: parseInt(formData.get('year') as string),
        road_ascent_year: (() => {
          const v = (formData.get('road_ascent_year') as string)?.trim();
          if (!v) return null;
          const n = parseInt(v, 10);
          return Number.isNaN(n) ? null : n;
        })(),
        road_ascent_month: (() => {
          const v = (formData.get('road_ascent_month') as string)?.trim();
          if (!v) return null;
          const n = parseInt(v, 10);
          if (Number.isNaN(n) || n < 1 || n > 12) return null;
          return n;
        })(),
        engine_volume: formData.get('engine_volume') as string || null,
        color: formData.get('color') as string || null,
        ignition_code: formData.get('ignition_code') as string || null,
        fuel_type: formData.get('fuel_type') as string || null,
        vehicle_standard: formData.get('vehicle_standard') as string || null,
        vat_recognized: (() => {
          const raw = (formData.get('vat_recognized') as string)?.trim();
          if (!raw) return null;
          const n = parseFloat(raw.replace(',', '.'));
          return Number.isNaN(n) ? null : n;
        })(),
        monthly_total_cost: (() => {
          const raw = (formData.get('monthly_total_cost') as string)?.trim();
          if (!raw) return null;
          const n = parseFloat(raw.replace(',', '.'));
          return Number.isNaN(n) ? null : n;
        })(),
        base_index: (() => {
          const raw = (formData.get('base_index') as string)?.trim();
          if (!raw) return null;
          const n = parseFloat(raw.replace(',', '.'));
          return Number.isNaN(n) ? null : n;
        })(),
        is_active: activeValue,
        test_expiry: vehTest,
        insurance_expiry: vehIns,
        next_inspection_date: vehNextInspection.trim() || null,
        next_maintenance_km: formData.get('next_maintenance_km') ? parseInt(formData.get('next_maintenance_km') as string) : null,
        next_maintenance_date: vehNextMaint.trim() || null,
        last_service_date: vehLastService.trim() || null,
        last_service_km: (() => {
          const v = (formData.get('last_service_km') as string)?.trim();
          if (!v) return null;
          const n = parseInt(v, 10);
          return Number.isNaN(n) ? null : n;
        })(),
        service_interval_km: (() => {
          const v = (formData.get('service_interval_km') as string)?.trim();
          if (!v) return null;
          const n = parseInt(v, 10);
          return Number.isNaN(n) ? null : n;
        })(),
        ownership_type: formData.get('ownership_type') as string || null,
        leasing_company_name: formData.get('leasing_company_name') as string || null,
        safety_officer: formData.get('safety_officer') as string || null,
        pickup_date: formData.get('pickup_date') as string || null,
        purchase_date: formData.get('purchase_date') as string || null,
        sale_date: formData.get('sale_date') as string || null,
        // Operational costs fields
        tax_value_price: taxValuePrice
          ? parseFloat(taxValuePrice)
          : null,
        tax_year: taxValueYear
          ? parseInt(taxValueYear)
          : null,
        adjusted_price: adjustedPrice
          ? parseFloat(adjustedPrice)
          : null,
        model_code: modelCode || null,
        manufacturer_code: manufacturerCode || null,
        chassis_number: formData.get('chassis_number') as string || null,
        average_fuel_consumption: formData.get('average_fuel_consumption')
          ? parseFloat(formData.get('average_fuel_consumption') as string)
          : null
      });

      if (newDriverId !== oldDriverId) {
        await assignDriverToVehicle.mutateAsync({
          vehicleId: vehicle.id,
          driverId: newDriverId,
          assignedBy: user?.id ?? null,
        });
      }

      toast.success('הרכב עודכן בהצלחה');
      setDirty(DIRTY_SOURCE_VEHICLE_EDIT, false);
      if (!complianceReturnTo) {
        navigate(`/vehicles/${vehicle.id}`);
      }
    } catch (error) {
      toast.error('שגיאה בעדכון הרכב');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fleet-screen-page text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl">עריכת רכב - {normalizePlateNumber(vehicle.plate_number)}</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          onInput={markVehicleEditDirty}
          onChange={markVehicleEditDirty}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Car className="h-5 w-5 text-primary" /></div>
                <CardTitle>פרטי הרכב</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="plate_number">מספר רישוי *</Label>
                  <Input
                    id="plate_number"
                    name="plate_number"
                    defaultValue={normalizePlateNumber(vehicle.plate_number)}
                    required
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]+"
                    title="ספרות בלבד, ללא מקפים"
                    onChange={(e) => {
                      const el = e.target;
                      const next = normalizePlateNumber(el.value);
                      if (el.value !== next) el.value = next;
                    }}
                  />
                </div>
                <div><Label htmlFor="manufacturer">יצרן *</Label><Input id="manufacturer" name="manufacturer" defaultValue={vehicle.manufacturer} required /></div>
                <div><Label htmlFor="model">דגם *</Label><Input id="model" name="model" defaultValue={vehicle.model} required /></div>
                <div><Label htmlFor="year">שנת ייצור *</Label><Input id="year" name="year" type="number" defaultValue={vehicle.year} required /></div>
                <div><Label htmlFor="road_ascent_year">שנת עליה לכביש</Label><Input id="road_ascent_year" name="road_ascent_year" type="number" min="1990" max={new Date().getFullYear() + 1} defaultValue={vehicle.road_ascent_year ?? ''} /></div>
                <div><Label htmlFor="road_ascent_month">חודש עליה לכביש</Label><Input id="road_ascent_month" name="road_ascent_month" type="number" min="1" max="12" defaultValue={vehicle.road_ascent_month ?? ''} /></div>
                <div><Label htmlFor="engine_volume">נפח מנוע</Label><Input id="engine_volume" name="engine_volume" defaultValue={vehicle.engine_volume || ''} dir="ltr" /></div>
                <div><Label htmlFor="color">צבע</Label><Input id="color" name="color" defaultValue={vehicle.color || ''} /></div>
                <div><Label htmlFor="ignition_code">קוד הנעה</Label><Input id="ignition_code" name="ignition_code" defaultValue={vehicle.ignition_code || ''} dir="ltr" /></div>
                <div>
                  <Label htmlFor="fuel_type">סוג דלק</Label>
                  <Select name="fuel_type" defaultValue={vehicle.fuel_type || undefined}>
                    <SelectTrigger><SelectValue placeholder="בחר סוג דלק" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="בנזין">בנזין</SelectItem>
                      <SelectItem value="סולר">סולר</SelectItem>
                      <SelectItem value="חשמל">חשמל</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label htmlFor="vehicle_standard">התקן</Label><Input id="vehicle_standard" name="vehicle_standard" defaultValue={vehicle.vehicle_standard || ''} /></div>
                <div>
                  <Label htmlFor="vat_recognized">מע״מ מוכר</Label>
                  <Input id="vat_recognized" name="vat_recognized" type="number" step="0.01" min="0" defaultValue={vehicle.vat_recognized ?? ''} dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="monthly_total_cost">עלות ליסינג חודשית</Label>
                  <Input id="monthly_total_cost" name="monthly_total_cost" type="number" step="0.01" min="0" defaultValue={vehicle.monthly_total_cost ?? ''} dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="base_index">מדד בסיס</Label>
                  <Input id="base_index" name="base_index" type="number" step="0.01" min="0" defaultValue={vehicle.base_index ?? ''} dir="ltr" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10"><Settings className="h-5 w-5 text-accent" /></div>
                <CardTitle>מידע תפעולי</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>רכב פעיל</Label>
                <Switch checked={activeValue} onCheckedChange={(val) => { markVehicleEditDirty(); setIsActive(val); }} />
              </div>
              <div>
                <Label>נהג מוקצה</Label>
                <Select value={driverValue || 'none'} onValueChange={(val) => { markVehicleEditDirty(); setAssignedDriverId(val === 'none' ? '' : val); }}>
                  <SelectTrigger><SelectValue placeholder="בחר נהג" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא הקצאה</SelectItem>
                    {drivers?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FleetDatePicker id="pickup_date" label="תאריך קליטה" value={vehPickup} onChange={setVehPickup} />
              <div>
                <Label htmlFor="safety_officer">קצין בטיחות</Label>
                <Input id="safety_officer" name="safety_officer" defaultValue={vehicle.safety_officer || ''} />
              </div>
              <FleetDatePicker id="purchase_date" label="תאריך קניה / תחילת עסקה" value={vehPurchase} onChange={setVehPurchase} />
              <FleetDatePicker id="sale_date" label="תאריך מכירה / סיום עסקה" value={vehSale} onChange={setVehSale} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10"><Shield className="h-5 w-5 text-amber-600" /></div>
                <CardTitle>תוקף מסמכים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FleetDatePicker id="test_expiry" label="תוקף טסט *" value={vehTest} onChange={setVehTest} />
                <FleetDatePicker id="insurance_expiry" label="תוקף ביטוח *" value={vehIns} onChange={setVehIns} />
                <FleetDatePicker
                  id="next_inspection_date"
                  label="ביקורת תקופתית הבאה (6 חודשים)"
                  value={vehNextInspection}
                  onChange={(v) => {
                    markVehicleEditDirty();
                    setVehNextInspection(v);
                  }}
                />
                <div><Label htmlFor="next_maintenance_km">ק"מ לטיפול הבא</Label><Input id="next_maintenance_km" name="next_maintenance_km" type="number" defaultValue={vehicle.next_maintenance_km || ''} dir="ltr" /></div>
                <FleetDatePicker id="next_maintenance_date" label="תאריך טיפול הבא" value={vehNextMaint} onChange={setVehNextMaint} />
                <FleetDatePicker id="last_service_date" label="תאריך טיפול אחרון" value={vehLastService} onChange={setVehLastService} />
                <div><Label htmlFor="last_service_km">ק״מ טיפול אחרון</Label><Input id="last_service_km" name="last_service_km" type="number" defaultValue={vehicle.last_service_km ?? ''} dir="ltr" placeholder="למשל 45000" /></div>
                <div><Label htmlFor="service_interval_km">מרווח טיפול מומלץ (ק״מ, יצרן)</Label><Input id="service_interval_km" name="service_interval_km" type="number" defaultValue={vehicle.service_interval_km ?? ''} dir="ltr" placeholder="למשל 15000" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10"><Building className="h-5 w-5 text-purple-600" /></div>
                <CardTitle>בעלות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ownership_type">סוג בעלות</Label>
                <Select name="ownership_type" defaultValue={ownershipSelectDefault(vehicle.ownership_type)}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג בעלות" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="הרץ">הרץ</SelectItem>
                    <SelectItem value="יוניון מוביליטי">יוניון מוביליטי</SelectItem>
                    <SelectItem value="פריים ליס">פריים ליס</SelectItem>
                    <SelectItem value="rental">השכרה (ישן)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="leasing_company_name">שם חברת ליסינג</Label>
                <Input id="leasing_company_name" name="leasing_company_name" defaultValue={vehicle.leasing_company_name || ''} />
              </div>
            </CardContent>
          </Card>

          {/* Operational Costs */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10"><DollarSign className="h-5 w-5 text-green-600" /></div>
                <CardTitle>עלויות תפעול</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="manufacturer_code">סמל יצרן</Label>
                  <Input 
                    id="manufacturer_code" 
                    name="manufacturer_code" 
                    value={manufacturerCode}
                    onChange={(e) => { markVehicleEditDirty(); setManufacturerCode(e.target.value); }}
                    placeholder="001"
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="model_code">סמל דגם</Label>
                  <Input 
                    id="model_code" 
                    name="model_code" 
                    value={modelCode}
                    onChange={(e) => { markVehicleEditDirty(); setModelCode(e.target.value); }}
                    placeholder="1234"
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="chassis_number">מספר שלדה</Label>
                  <Input 
                    id="chassis_number" 
                    name="chassis_number" 
                    defaultValue={vehicle.chassis_number || ''}
                    placeholder="VIN123456789"
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="average_fuel_consumption">צריכת דלק ממוצעת (ל׳/100 ק״מ)</Label>
                  <Input 
                    id="average_fuel_consumption" 
                    name="average_fuel_consumption" 
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={vehicle.average_fuel_consumption?.toString() || ''}
                    placeholder="7.5"
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="tax_value_price">מחיר שווי</Label>
                  <Input 
                    id="tax_value_price" 
                    name="tax_value_price" 
                    value={taxValuePrice}
                    onChange={(e) => { markVehicleEditDirty(); setTaxValuePrice(e.target.value); }}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="150000"
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="tax_value_year">שנת שווי</Label>
                  <Input 
                    id="tax_value_year" 
                    name="tax_value_year" 
                    value={taxValueYear}
                    onChange={(e) => { markVehicleEditDirty(); setTaxValueYear(e.target.value); }}
                    type="number"
                    min="1990"
                    max={new Date().getFullYear() + 1}
                    placeholder="2023"
                  />
                </div>

                <div>
                  <Label htmlFor="adjusted_price">מחיר מתואם</Label>
                  <Input 
                    id="adjusted_price" 
                    name="adjusted_price" 
                    value={adjustedPrice}
                    onChange={(e) => { markVehicleEditDirty(); setAdjustedPrice(e.target.value); }}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="140000"
                    dir="ltr"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור שינויים
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => tryNavigate(`/vehicles/${vehicle.id}`)}>ביטול</Button>
          </div>
        </form>
      </main>
    </div>
  );
}
