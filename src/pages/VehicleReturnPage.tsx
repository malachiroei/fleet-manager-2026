import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useCreateHandover, useLatestHandover, uploadHandoverPhoto, uploadSignature } from '@/hooks/useHandovers';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import FuelLevelSelector from '@/components/FuelLevelSelector';
import PhotoUpload from '@/components/PhotoUpload';
import { ArrowRight, Loader2, RotateCcw, Camera, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function VehicleReturnPage() {
  const navigate = useNavigate();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const createHandover = useCreateHandover();
  const { user } = useAuth();
  const signatureRef = useRef<SignaturePadRef>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fuelLevel, setFuelLevel] = useState(4);
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  
  // Photo states
  const [photoFront, setPhotoFront] = useState<File | null>(null);
  const [photoBack, setPhotoBack] = useState<File | null>(null);
  const [photoRight, setPhotoRight] = useState<File | null>(null);
  const [photoLeft, setPhotoLeft] = useState<File | null>(null);

  const { data: lastHandover } = useLatestHandover(selectedVehicle);
  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);
  const allPhotosUploaded = photoFront && photoBack && photoRight && photoLeft;

  // Calculate differences from delivery
  const odometerDiff = lastHandover && odometer 
    ? parseInt(odometer) - lastHandover.odometer_reading 
    : null;
  const fuelDiff = lastHandover ? fuelLevel - lastHandover.fuel_level : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedVehicle || !selectedDriver) {
      toast.error('נא לבחור רכב ונהג');
      return;
    }

    if (!allPhotosUploaded) {
      toast.error('נא לצלם את הרכב מכל 4 הזוויות');
      return;
    }

    if (signatureRef.current?.isEmpty()) {
      toast.error('נא לחתום על הטופס');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload photos
      const [frontUrl, backUrl, rightUrl, leftUrl] = await Promise.all([
        uploadHandoverPhoto(photoFront, selectedVehicle, 'front'),
        uploadHandoverPhoto(photoBack, selectedVehicle, 'back'),
        uploadHandoverPhoto(photoRight, selectedVehicle, 'right'),
        uploadHandoverPhoto(photoLeft, selectedVehicle, 'left'),
      ]);

      // Upload signature
      const signatureDataUrl = signatureRef.current?.getDataUrl();
      const signatureUrl = signatureDataUrl 
        ? await uploadSignature(signatureDataUrl, selectedVehicle, 'return')
        : null;

      // Create handover record
      await createHandover.mutateAsync({
        vehicle_id: selectedVehicle,
        driver_id: selectedDriver,
        handover_type: 'return',
        handover_date: new Date().toISOString(),
        odometer_reading: parseInt(odometer),
        fuel_level: fuelLevel,
        photo_front_url: frontUrl,
        photo_back_url: backUrl,
        photo_right_url: rightUrl,
        photo_left_url: leftUrl,
        signature_url: signatureUrl,
        notes: notes || null,
        created_by: user?.id || null,
      });

      toast.success('החזרת רכב נרשמה בהצלחה');
      navigate('/');
    } catch (error) {
      console.error('Error creating handover:', error);
      toast.error('שגיאה ברישום החזרת הרכב');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">החזרת רכב</h1>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehicle & Driver Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RotateCcw className="h-5 w-5 text-primary" />
                פרטי ההחזרה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>בחר רכב *</Label>
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

              <div>
                <Label>בחר נהג *</Label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר נהג מהרשימה" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers?.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Comparison with delivery */}
              {lastHandover && (
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      נתוני מסירה לשוואה
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">ק"מ במסירה:</span>
                        <span className="mr-1 font-medium">{lastHandover.odometer_reading.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">דלק במסירה:</span>
                        <span className="mr-1 font-medium">{lastHandover.fuel_level}/8</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="odometer">קילומטראז׳ *</Label>
                  <Input
                    id="odometer"
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    min={lastHandover?.odometer_reading || selectedVehicleData?.current_odometer || 0}
                    placeholder="קריאת מונה"
                    required
                    dir="ltr"
                  />
                  {odometerDiff !== null && odometerDiff > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      נסיעה: +{odometerDiff.toLocaleString()} ק"מ
                    </p>
                  )}
                </div>
              </div>

              <FuelLevelSelector value={fuelLevel} onChange={setFuelLevel} />
              {fuelDiff !== null && (
                <p className={`text-xs ${fuelDiff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {fuelDiff === 0 ? 'ללא שינוי ברמת הדלק' : 
                    fuelDiff > 0 ? `+${fuelDiff}/8 דלק מהמסירה` : 
                    `${fuelDiff}/8 דלק מהמסירה`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="h-5 w-5 text-primary" />
                צילום הרכב (4 זוויות)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <PhotoUpload
                  label="חזית"
                  onPhotoCapture={setPhotoFront}
                  required
                />
                <PhotoUpload
                  label="אחור"
                  onPhotoCapture={setPhotoBack}
                  required
                />
                <PhotoUpload
                  label="צד ימין"
                  onPhotoCapture={setPhotoRight}
                  required
                />
                <PhotoUpload
                  label="צד שמאל"
                  onPhotoCapture={setPhotoLeft}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Signature */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">חתימת הנהג</CardTitle>
            </CardHeader>
            <CardContent>
              <SignaturePad ref={signatureRef} onSign={setHasSignature} />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="pt-6">
              <Label htmlFor="notes">הערות</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות לגבי מצב הרכב, נזקים חדשים וכו׳..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
            <div className="container">
              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={isSubmitting || !selectedVehicle || !selectedDriver || !allPhotosUploaded || !hasSignature}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                אשר החזרת רכב
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
