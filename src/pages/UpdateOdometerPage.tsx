import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useVehicles, useUpdateOdometer } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Loader2, Gauge, Car } from 'lucide-react';

export default function UpdateOdometerPage() {
  const navigate = useNavigate();
  const { data: vehicles } = useVehicles();
  const updateOdometer = useUpdateOdometer();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');

  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const newOdometer = parseInt(formData.get('new_odometer') as string);
    
    await updateOdometer.mutateAsync({
      id: selectedVehicle,
      odometer: newOdometer
    });

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
            <h1 className="font-bold text-xl">עדכון קילומטראז׳</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>עדכון מהיר</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>בחר רכב</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
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

              {selectedVehicleData && (
                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Car className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{selectedVehicleData.manufacturer} {selectedVehicleData.model}</h3>
                        <p className="text-sm text-muted-foreground">
                          קילומטראז׳ נוכחי: {selectedVehicleData.current_odometer.toLocaleString()} ק"מ
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div>
                <Label htmlFor="new_odometer">קילומטראז׳ חדש</Label>
                <Input 
                  id="new_odometer" 
                  name="new_odometer" 
                  type="number"
                  min={selectedVehicleData?.current_odometer || 0}
                  placeholder="הכנס קריאת מונה חדשה"
                  required
                  dir="ltr"
                  className="text-lg"
                />
                {selectedVehicleData && (
                  <p className="text-sm text-muted-foreground mt-1">
                    מינימום: {selectedVehicleData.current_odometer.toLocaleString()} ק"מ
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={isSubmitting || !selectedVehicle}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  עדכן קילומטראז׳
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
