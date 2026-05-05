import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateVehicle, useAssignDriverToVehicle } from '@/hooks/useVehicles';
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
import { Loader2, Car, FileText, Shield, Upload, Settings, Building, Gauge, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { normalizePlateNumber } from '@/lib/plateNumber';

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const createVehicle = useCreateVehicle();
  const assignDriverToVehicle = useAssignDriverToVehicle();
  const { data: drivers } = useDrivers();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [assignedDriverId, setAssignedDriverId] = useState<string>('');
  const [ownershipType, setOwnershipType] = useState<string>('');
  const [leasingCompanyName, setLeasingCompanyName] = useState<string>('');
  const [manufacturerCode, setManufacturerCode] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [taxValuePrice, setTaxValuePrice] = useState('');
  const [taxValueYear, setTaxValueYear] = useState('');
  const [adjustedPrice, setAdjustedPrice] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [lastOdometerDate, setLastOdometerDate] = useState('');
  const [testExpiry, setTestExpiry] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [nextMaintenanceDate, setNextMaintenanceDate] = useState('');

  // Auto-fetch pricing data based on codes
  const { data: pricingData } = usePricingLookup(
    manufacturerCode || null, 
    modelCode || null
  );

  useEffect(() => {
    if (!pricingData) return;

    setTaxValuePrice(pricingData.usage_value?.toString() || '');
    setTaxValueYear(pricingData.usage_year?.toString() || '');
    setAdjustedPrice(pricingData.adjusted_price?.toString() || '');
  }, [pricingData]);

  useEffect(() => {
    if (ownershipType !== 'ליסינג' && leasingCompanyName) {
      setLeasingCompanyName('');
    }
  }, [ownershipType, leasingCompanyName]);

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
      if (!testExpiry.trim() || !insuranceExpiry.trim()) {
        toast.error('נא למלא תאריכי תוקף לטסט ולביטוח');
        setIsSubmitting(false);
        return;
      }

      const createdVehicle = await createVehicle.mutateAsync({
        plate_number: plateRaw,
        manufacturer: formData.get('manufacturer') as string,
        model: formData.get('model') as string,
        year: parseInt(formData.get('year') as string),
        current_odometer: parseInt(formData.get('current_odometer') as string) || 0,
        next_maintenance_km: formData.get('next_maintenance_km') 
          ? parseInt(formData.get('next_maintenance_km') as string) 
          : null,
        next_maintenance_date: nextMaintenanceDate.trim() || null,
        test_expiry: testExpiry,
        insurance_expiry: insuranceExpiry,
        // New fields
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
        is_active: isActive,
        assigned_driver_id: null,
        pickup_date: pickupDate.trim() || null,
        road_ascent_year: formData.get('road_ascent_year') 
          ? parseInt(formData.get('road_ascent_year') as string) 
          : null,
        road_ascent_month: formData.get('road_ascent_month')
          ? parseInt(formData.get('road_ascent_month') as string)
          : null,
        ownership_type: ownershipType || null,
        leasing_company_name: ownershipType === 'ליסינג' ? (leasingCompanyName || null) : null,
        safety_officer: formData.get('safety_officer') as string || null,
        last_odometer_date: lastOdometerDate.trim() || null,
        manufacturer_code: manufacturerCode || null,
        model_code: modelCode || null,
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
        chassis_number: formData.get('chassis_number') as string || null,
        average_fuel_consumption: formData.get('average_fuel_consumption')
          ? parseFloat(formData.get('average_fuel_consumption') as string)
          : null
      });

      if (assignedDriverId) {
        await assignDriverToVehicle.mutateAsync({
          vehicleId: createdVehicle.id,
          driverId: assignedDriverId,
          assignedBy: user?.id ?? null,
        });
      }

      toast.success('הרכב נוסף בהצלחה');
      navigate('/vehicles');
    } catch (error) {
      toast.error('שגיאה בהוספת הרכב');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fleet-screen-page text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl">הוספת רכב חדש</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Car className="h-5 w-5 text-primary" />
                </div>
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
                    placeholder="82667304"
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

                <div>
                  <Label htmlFor="manufacturer">יצרן *</Label>
                  <Input 
                    id="manufacturer" 
                    name="manufacturer" 
                    placeholder="טויוטה"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="model">דגם *</Label>
                  <Input 
                    id="model" 
                    name="model" 
                    placeholder="קורולה"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="year">שנת רישום *</Label>
                  <Input 
                    id="year" 
                    name="year" 
                    type="number" 
                    min="1990"
                    max={new Date().getFullYear() + 1}
                    placeholder="2023"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="engine_volume">נפח מנוע</Label>
                  <Input 
                    id="engine_volume" 
                    name="engine_volume" 
                    placeholder="1600"
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="color">צבע</Label>
                  <Input 
                    id="color" 
                    name="color" 
                    placeholder="לבן"
                  />
                </div>

                <div>
                  <Label htmlFor="ignition_code">קוד הנעה</Label>
                  <Input 
                    id="ignition_code" 
                    name="ignition_code" 
                    placeholder="1234"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label htmlFor="fuel_type">סוג דלק</Label>
                  <Select name="fuel_type">
                    <SelectTrigger>
                      <SelectValue placeholder="בחר סוג דלק" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="בנזין">בנזין</SelectItem>
                      <SelectItem value="סולר">סולר</SelectItem>
                      <SelectItem value="חשמל">חשמל</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="vehicle_standard">התקן</Label>
                  <Input id="vehicle_standard" name="vehicle_standard" placeholder="למשל Euro 6" />
                </div>
                <div>
                  <Label htmlFor="vat_recognized">מע״מ מוכר</Label>
                  <Input id="vat_recognized" name="vat_recognized" type="number" step="0.01" min="0" placeholder="למשל 17" dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="monthly_total_cost">עלות ליסינג חודשית</Label>
                  <Input id="monthly_total_cost" name="monthly_total_cost" type="number" step="0.01" min="0" placeholder="למשל 3200" dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="base_index">מדד בסיס</Label>
                  <Input id="base_index" name="base_index" type="number" step="0.01" min="0" placeholder="למשל 100.5" dir="ltr" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Operational Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Settings className="h-5 w-5 text-accent" />
                </div>
                <CardTitle>מידע תפעולי</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">רכב פעיל</Label>
                <Switch
                  id="is_active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              <div>
                <Label htmlFor="assigned_driver">נהג מוקצה</Label>
              <Select value={assignedDriverId} onValueChange={(val) => setAssignedDriverId(val === "none" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר נהג" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא הקצאה</SelectItem>
                    {drivers?.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <FleetDatePicker id="pickup_date" label="תאריך קליטה לחברה" value={pickupDate} onChange={setPickupDate} />
              <div>
                <Label htmlFor="safety_officer">קצין בטיחות</Label>
                <Input
                  id="safety_officer"
                  name="safety_officer"
                  placeholder="שם קצין בטיחות"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="current_odometer">קילומטראז׳ נוכחי</Label>
                  <Input 
                    id="current_odometer" 
                    name="current_odometer" 
                    type="number" 
                    min="0"
                    placeholder="50000"
                    dir="ltr"
                  />
                </div>

                <FleetDatePicker id="last_odometer_date" label='תאריך עדכון ק"מ' value={lastOdometerDate} onChange={setLastOdometerDate} />
              </div>
            </CardContent>
          </Card>

          {/* Registration Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <Shield className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle>רישום ותוקף מסמכים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="road_ascent_year">שנת עלייה לכביש</Label>
                  <Input 
                    id="road_ascent_year" 
                    name="road_ascent_year" 
                    type="number"
                    min="1990"
                    max={new Date().getFullYear() + 1}
                    placeholder="2023"
                  />
                </div>

                <div>
                  <Label htmlFor="road_ascent_month">חודש עלייה לכביש</Label>
                  <Input 
                    id="road_ascent_month" 
                    name="road_ascent_month" 
                    type="number"
                    min="1"
                    max="12"
                    placeholder="1"
                  />
                </div>

                <FleetDatePicker id="test_expiry" label="תוקף טסט *" value={testExpiry} onChange={setTestExpiry} />
                <FleetDatePicker id="insurance_expiry" label="תוקף ביטוח *" value={insuranceExpiry} onChange={setInsuranceExpiry} />

                <div>
                  <Label htmlFor="next_maintenance_km">ק"מ לטיפול הבא</Label>
                  <Input 
                    id="next_maintenance_km" 
                    name="next_maintenance_km" 
                    type="number" 
                    min="0"
                    placeholder="60000"
                    dir="ltr"
                  />
                </div>

                <FleetDatePicker id="next_maintenance_date" label="תאריך טיפול הבא" value={nextMaintenanceDate} onChange={setNextMaintenanceDate} />
              </div>
            </CardContent>
          </Card>

          {/* Ownership Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Building className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle>בעלות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ownership_type">סוג בעלות</Label>
                <Select name="ownership_type" value={ownershipType} onValueChange={setOwnershipType}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סוג בעלות" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ליסינג">ליסינג</SelectItem>
                    <SelectItem value="רכב זמני">רכב זמני</SelectItem>
                    <SelectItem value="רכב בבעלות חברה">רכב בבעלות חברה</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="leasing_company_name">שם חברת ליסינג</Label>
                {ownershipType === 'ליסינג' ? (
                  <Select
                    name="leasing_company_name"
                    value={leasingCompanyName}
                    onValueChange={setLeasingCompanyName}
                  >
                    <SelectTrigger id="leasing_company_name">
                      <SelectValue placeholder="בחר חברת ליסינג" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="הרץ">הרץ</SelectItem>
                      <SelectItem value="פריים ליס">פריים ליס</SelectItem>
                      <SelectItem value="יוניון">יוניון</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="leasing_company_name"
                    name="leasing_company_name"
                    value=""
                    disabled
                    placeholder="לא רלוונטי לבעלות/רכב זמני"
                    readOnly
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pricing/Tax Data */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <CardTitle>נתוני מחירון ומס</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="manufacturer_code">קוד תוצר *</Label>
                  <Input 
                    id="manufacturer_code" 
                    name="manufacturer_code"
                    value={manufacturerCode}
                    onChange={(e) => setManufacturerCode(e.target.value)}
                    placeholder="001"
                    dir="ltr"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="model_code">קוד דגם *</Label>
                  <Input 
                    id="model_code" 
                    name="model_code"
                    value={modelCode}
                    onChange={(e) => setModelCode(e.target.value)}
                    placeholder="1234"
                    dir="ltr"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="chassis_number">מספר שלדה</Label>
                  <Input 
                    id="chassis_number" 
                    name="chassis_number" 
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
                    onChange={(e) => setTaxValuePrice(e.target.value)}
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
                    onChange={(e) => setTaxValueYear(e.target.value)}
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
                    onChange={(e) => setAdjustedPrice(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="140000"
                    dir="ltr"
                  />
                </div>
              </div>

              {pricingData && (
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-green-600">נתונים נמצאו במחירון:</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">שווי שימוש: </span>
                      <span className="font-medium">₪{pricingData.usage_value?.toLocaleString() || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">שנת שימוש: </span>
                      <span className="font-medium">{pricingData.usage_year || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">מחירון מתואם: </span>
                      <span className="font-medium">₪{pricingData.adjusted_price?.toLocaleString() || '-'}</span>
                    </div>
                  </div>
                </div>
              )}

              {manufacturerCode && modelCode && !pricingData && (
                <p className="text-sm text-amber-600">לא נמצאו נתוני מחירון עבור קוד זה. נא להעלות קובץ מחירון.</p>
              )}
            </CardContent>
          </Card>

          {/* Document Uploads */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle>מסמכים</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-not-allowed opacity-60">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm font-medium">רישיון רכב</span>
                  <span className="text-xs text-muted-foreground">בקרוב</span>
                </div>
                <div className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-not-allowed opacity-60">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm font-medium">תעודת ביטוח</span>
                  <span className="text-xs text-muted-foreground">בקרוב</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור רכב
            </Button>
            <Link to="/vehicles" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                ביטול
              </Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
