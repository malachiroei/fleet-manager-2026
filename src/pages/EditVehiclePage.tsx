import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useVehicle, useUpdateVehicle, useAssignDriverToVehicle, useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useAuth } from '@/hooks/useAuth';
import { usePricingLookup } from '@/hooks/usePricingData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Loader2, Car, Settings, Shield, Building, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <Link to="/vehicles"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
            <Skeleton className="h-6 w-48" />
          </div></div>
        </header>
        <main className="container py-6 space-y-4"><Skeleton className="h-48 w-full" /></main>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <Link to="/vehicles"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
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
      const newDriverId = driverValue || null;
      const oldDriverId = currentActiveDriverId || null;

      await updateVehicle.mutateAsync({
        id: vehicle.id,
        plate_number: formData.get('plate_number') as string,
        manufacturer: formData.get('manufacturer') as string,
        model: formData.get('model') as string,
        year: parseInt(formData.get('year') as string),
        engine_volume: formData.get('engine_volume') as string || null,
        color: formData.get('color') as string || null,
        ignition_code: formData.get('ignition_code') as string || null,
        is_active: activeValue,
        test_expiry: formData.get('test_expiry') as string,
        insurance_expiry: formData.get('insurance_expiry') as string,
        next_maintenance_km: formData.get('next_maintenance_km') ? parseInt(formData.get('next_maintenance_km') as string) : null,
        next_maintenance_date: formData.get('next_maintenance_date') as string || null,
        ownership_type: formData.get('ownership_type') as string || null,
        leasing_company_name: formData.get('leasing_company_name') as string || null,
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
      navigate(`/vehicles/${vehicle.id}`);
    } catch (error) {
      toast.error('שגיאה בעדכון הרכב');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to={`/vehicles/${vehicle.id}`}><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
            <h1 className="font-bold text-xl">עריכת רכב - {vehicle.plate_number}</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Car className="h-5 w-5 text-primary" /></div>
                <CardTitle>פרטי הרכב</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="plate_number">מספר רישוי *</Label>
                  <Input id="plate_number" name="plate_number" defaultValue={vehicle.plate_number} required dir="ltr" />
                </div>
                <div><Label htmlFor="manufacturer">יצרן *</Label><Input id="manufacturer" name="manufacturer" defaultValue={vehicle.manufacturer} required /></div>
                <div><Label htmlFor="model">דגם *</Label><Input id="model" name="model" defaultValue={vehicle.model} required /></div>
                <div><Label htmlFor="year">שנת ייצור *</Label><Input id="year" name="year" type="number" defaultValue={vehicle.year} required /></div>
                <div><Label htmlFor="engine_volume">נפח מנוע</Label><Input id="engine_volume" name="engine_volume" defaultValue={vehicle.engine_volume || ''} dir="ltr" /></div>
                <div><Label htmlFor="color">צבע</Label><Input id="color" name="color" defaultValue={vehicle.color || ''} /></div>
                <div><Label htmlFor="ignition_code">קוד הנעה</Label><Input id="ignition_code" name="ignition_code" defaultValue={vehicle.ignition_code || ''} dir="ltr" /></div>
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
                <Switch checked={activeValue} onCheckedChange={(val) => setIsActive(val)} />
              </div>
              <div>
                <Label>נהג מוקצה</Label>
                <Select value={driverValue || 'none'} onValueChange={(val) => setAssignedDriverId(val === 'none' ? '' : val)}>
                  <SelectTrigger><SelectValue placeholder="בחר נהג" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא הקצאה</SelectItem>
                    {drivers?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pickup_date">תאריך קליטה</Label>
                <Input id="pickup_date" name="pickup_date" type="date" defaultValue={vehicle.pickup_date || ''} />
              </div>
              <div>
                <Label htmlFor="purchase_date">תאריך קניה / תחילת עסקה</Label>
                <Input id="purchase_date" name="purchase_date" type="date" defaultValue={(vehicle as any).purchase_date || ''} />
              </div>
              <div>
                <Label htmlFor="sale_date">תאריך מכירה / סיום עסקה</Label>
                <Input id="sale_date" name="sale_date" type="date" defaultValue={(vehicle as any).sale_date || ''} />
              </div>
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
              <div className="grid grid-cols-2 gap-4">
                <div><Label htmlFor="test_expiry">תוקף טסט *</Label><Input id="test_expiry" name="test_expiry" type="date" defaultValue={vehicle.test_expiry} required /></div>
                <div><Label htmlFor="insurance_expiry">תוקף ביטוח *</Label><Input id="insurance_expiry" name="insurance_expiry" type="date" defaultValue={vehicle.insurance_expiry} required /></div>
                <div><Label htmlFor="next_maintenance_km">ק"מ לטיפול הבא</Label><Input id="next_maintenance_km" name="next_maintenance_km" type="number" defaultValue={vehicle.next_maintenance_km || ''} dir="ltr" /></div>
                <div><Label htmlFor="next_maintenance_date">תאריך טיפול הבא</Label><Input id="next_maintenance_date" name="next_maintenance_date" type="date" defaultValue={vehicle.next_maintenance_date || ''} /></div>
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
                <Select name="ownership_type" defaultValue={vehicle.ownership_type || ''}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג בעלות" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">בבעלות החברה</SelectItem>
                    <SelectItem value="leasing">ליסינג</SelectItem>
                    <SelectItem value="rental">השכרה</SelectItem>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="manufacturer_code">סמל יצרן</Label>
                  <Input 
                    id="manufacturer_code" 
                    name="manufacturer_code" 
                    value={manufacturerCode}
                    onChange={(e) => setManufacturerCode(e.target.value)}
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
                    onChange={(e) => setModelCode(e.target.value)}
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
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור שינויים
            </Button>
            <Link to={`/vehicles/${vehicle.id}`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">ביטול</Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
