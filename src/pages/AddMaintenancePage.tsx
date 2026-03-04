import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { useCreateMaintenanceLog } from '@/hooks/useMaintenance';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Loader2, Wrench } from 'lucide-react';

const SERVICE_TYPES = [
  'שמן ומסננים',
  'בלמים',
  'צמיגים',
  'תיקון מנוע',
  'תיקון גיר',
  'חשמל',
  'מיזוג אוויר',
  'טיפול תקופתי',
  'תיקון פח וצבע',
  'אחר'
];

export default function AddMaintenancePage() {
  const navigate = useNavigate();
  const { data: vehicles } = useVehicles();
  const createLog = useCreateMaintenanceLog();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [serviceType, setServiceType] = useState('');

  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);
  const suggestedNextKm = selectedVehicleData 
    ? selectedVehicleData.current_odometer + 15000 
    : null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const odometerReading = parseInt(formData.get('odometer_reading') as string);
    
    await createLog.mutateAsync({
      vehicle_id: selectedVehicle,
      service_date: formData.get('service_date') as string,
      service_type: serviceType,
      odometer_reading: odometerReading,
      garage_name: formData.get('garage_name') as string || null,
      cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
      notes: formData.get('notes') as string || null,
      invoice_url: null,
      created_by: user?.id || null
    });

    // Note: Vehicle odometer is automatically updated via database trigger

    navigate('/vehicles');
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">הוספת רישום טיפול</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>פרטי הטיפול</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>בחר רכב *</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle} required>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר רכב מהרשימה" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles?.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.manufacturer} {v.model} ({v.plate_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="service_date">תאריך טיפול *</Label>
                  <Input 
                    id="service_date" 
                    name="service_date" 
                    type="date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                <div>
                  <Label>סוג טיפול *</Label>
                  <Select value={serviceType} onValueChange={setServiceType} required>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר סוג" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="odometer_reading">קילומטראז׳ *</Label>
                  <Input 
                    id="odometer_reading" 
                    name="odometer_reading" 
                    type="number"
                    min={selectedVehicleData?.current_odometer || 0}
                    defaultValue={selectedVehicleData?.current_odometer || ''}
                    placeholder="קריאת מונה"
                    required
                    dir="ltr"
                  />
                  {selectedVehicleData && (
                    <p className="text-xs text-muted-foreground mt-1">
                      נוכחי: {selectedVehicleData.current_odometer.toLocaleString()} ק"מ
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="cost">עלות (₪)</Label>
                  <Input 
                    id="cost" 
                    name="cost" 
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="garage_name">שם המוסך</Label>
                  <Input 
                    id="garage_name" 
                    name="garage_name" 
                    placeholder="שם המוסך / נותן השירות"
                  />
                </div>

                {/* Next Maintenance Info */}
                {selectedVehicleData && (
                  <div className="col-span-2 p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">טיפול הבא מומלץ</p>
                    <p className="text-lg font-bold text-primary">
                      {suggestedNextKm?.toLocaleString()} ק"מ
                    </p>
                    <p className="text-xs text-muted-foreground">
                      (קילומטראז׳ נוכחי + 15,000 ק"מ)
                    </p>
                  </div>
                )}

                <div className="col-span-2">
                  <Label htmlFor="notes">הערות</Label>
                  <Textarea 
                    id="notes"
                    name="notes" 
                    placeholder="פרטים נוספים על הטיפול..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1" disabled={isSubmitting || !selectedVehicle || !serviceType}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  שמור רישום
                </Button>
                <Link to="/" className="flex-1">
                  <Button type="button" variant="outline" className="w-full">
                    ביטול
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
