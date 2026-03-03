import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useVehicles, fetchActiveDriverAssignments } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import {
  useCreateHandover,
  uploadHandoverPhoto,
  uploadSignature,
  archiveHandoverSubmission,
  sendHandoverNotificationEmail,
  type AssignmentMode,
} from '@/hooks/useHandovers';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import FuelLevelSelector from '@/components/FuelLevelSelector';
import PhotoUpload from '@/components/PhotoUpload';
import { ArrowRight, Loader2, Truck, Camera } from 'lucide-react';
import { toast } from 'sonner';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return 'שגיאה לא ידועה';
}

export default function VehicleDeliveryPage() {
  const navigate = useNavigate();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const createHandover = useCreateHandover();
  const { user } = useAuth();
  const signatureRef = useRef<SignaturePadRef>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('permanent');
  const [odometer, setOdometer] = useState('');
  const [fuelLevel, setFuelLevel] = useState(4);
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  
  // Photo states
  const [photoFront, setPhotoFront] = useState<File | null>(null);
  const [photoBack, setPhotoBack] = useState<File | null>(null);
  const [photoRight, setPhotoRight] = useState<File | null>(null);
  const [photoLeft, setPhotoLeft] = useState<File | null>(null);

  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);
  const selectedDriverData = drivers?.find(d => d.id === selectedDriver);
  const allPhotosUploaded = photoFront && photoBack && photoRight && photoLeft;

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

    const existingActiveAssignments = await fetchActiveDriverAssignments(selectedDriver, selectedVehicle);
    if (existingActiveAssignments.length > 0) {
      const approved = window.confirm('שים לב, לנהג זה כבר משויך רכב. האם ברצונך להחליף את הרכב הקיים?');
      if (!approved) {
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Upload photos
      const photoResults = await Promise.allSettled([
        uploadHandoverPhoto(photoFront, selectedVehicle, 'front'),
        uploadHandoverPhoto(photoBack, selectedVehicle, 'back'),
        uploadHandoverPhoto(photoRight, selectedVehicle, 'right'),
        uploadHandoverPhoto(photoLeft, selectedVehicle, 'left'),
      ]);

      const frontUrl = photoResults[0].status === 'fulfilled' ? photoResults[0].value : null;
      const backUrl = photoResults[1].status === 'fulfilled' ? photoResults[1].value : null;
      const rightUrl = photoResults[2].status === 'fulfilled' ? photoResults[2].value : null;
      const leftUrl = photoResults[3].status === 'fulfilled' ? photoResults[3].value : null;

      if (photoResults.some((result) => result.status === 'rejected')) {
        toast.warning('המסירה תירשם, אך חלק מהתמונות לא נשמרו בשרת');
      }

      // Upload signature
      const signatureDataUrl = signatureRef.current?.getDataUrl();
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        try {
          signatureUrl = await uploadSignature(signatureDataUrl, selectedVehicle, 'delivery');
        } catch (signatureError) {
          console.error('Signature upload error:', signatureError);
          toast.warning('המסירה תירשם, אך החתימה לא נשמרה בשרת');
        }
      }

      // Create handover record
      const handover = await createHandover.mutateAsync({
        vehicle_id: selectedVehicle,
        driver_id: selectedDriver,
        handover_type: 'delivery',
        assignment_mode: assignmentMode as any,
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

      let reportUrl = '';
      try {
        const archived = await archiveHandoverSubmission({
          handoverId: handover.id,
          handoverType: 'delivery',
          assignmentMode,
          vehicleId: selectedVehicle,
          vehicleLabel: `${selectedVehicleData?.manufacturer ?? ''} ${selectedVehicleData?.model ?? ''} (${selectedVehicleData?.plate_number ?? ''})`.trim(),
          driverId: selectedDriver,
          driverLabel: selectedDriverData?.full_name ?? 'לא ידוע',
          odometerReading: parseInt(odometer),
          fuelLevel,
          notes: notes || null,
          photoUrls: {
            front: frontUrl,
            back: backUrl,
            right: rightUrl,
            left: leftUrl,
          },
          signatureUrl,
          createdBy: user?.id ?? null,
          includeDriverArchive: assignmentMode === 'permanent',
        });

        const data = archived.handover;
        console.log('Persisted PDF URL:', data.pdf_url);
        reportUrl = archived.handover.pdf_url;
      } catch (archiveError) {
        console.error('Archive form copy error:', archiveError);
        const message = archiveError instanceof Error ? archiveError.message : 'שגיאה לא ידועה';
        toast.error(`שמירת PDF נכשלה: ${message}`);
        return;
      }

      if (!reportUrl) {
        toast.error('שמירת PDF נכשלה: לא התקבל קישור קובץ');
        return;
      }

      try {
        await sendHandoverNotificationEmail({
          handoverId: handover.id,
          vehicleId: selectedVehicle,
          handoverType: 'delivery',
          assignmentMode,
          vehicleLabel: `${selectedVehicleData?.manufacturer ?? ''} ${selectedVehicleData?.model ?? ''} (${selectedVehicleData?.plate_number ?? ''})`.trim(),
          driverLabel: selectedDriverData?.full_name ?? 'לא ידוע',
          odometerReading: parseInt(odometer),
          fuelLevel,
          notes: notes || null,
          reportUrl,
        });
      } catch (emailError) {
        console.error('Email notification error:', emailError);
        toast.warning('הטופס נשמר, אך שליחת המייל נכשלה');
      }

      toast.success('מסירת רכב נרשמה בהצלחה');
      navigate('/');
    } catch (error) {
      console.error('Error creating handover:', error);
      toast.error(`שגיאה ברישום מסירת הרכב: ${getErrorMessage(error)}`);
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
            <h1 className="font-bold text-xl">מסירת רכב</h1>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehicle & Driver Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-primary" />
                פרטי המסירה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>בחר רכב *</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר רכב מהרשימה" />
                  </SelectTrigger>
                  <SelectContent className="z-[100000] max-h-72 bg-card border border-border shadow-xl">
                    {vehicles?.map(v => (
                      <SelectItem key={v.id} value={v.id} className="py-2 leading-snug">
                        {v.manufacturer} {v.model} ({v.plate_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>סוג מסירה *</Label>
                <Select value={assignmentMode} onValueChange={(value) => setAssignmentMode(value as AssignmentMode)}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סוג מסירה" />
                  </SelectTrigger>
                  <SelectContent className="z-[100000] bg-card border border-border shadow-xl">
                    <SelectItem value="permanent">מסירה קבועה (משייכת נהג לרכב)</SelectItem>
                    <SelectItem value="replacement">מסירת רכב חליפי (ללא שיוך קבוע)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>בחר נהג *</Label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר נהג מהרשימה" />
                  </SelectTrigger>
                  <SelectContent className="z-[100000] max-h-72 bg-card border border-border shadow-xl">
                    {drivers?.map(d => (
                      <SelectItem key={d.id} value={d.id} className="py-2 leading-snug">
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="odometer">קילומטראז׳ *</Label>
                  <Input
                    id="odometer"
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    min={selectedVehicleData?.current_odometer || 0}
                    placeholder={selectedVehicleData ? `מינימום: ${selectedVehicleData.current_odometer}` : 'קריאת מונה'}
                    required
                    dir="ltr"
                  />
                </div>
              </div>

              <FuelLevelSelector value={fuelLevel} onChange={setFuelLevel} />
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
                placeholder="הערות נוספות לגבי מצב הרכב..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="fixed bottom-12 left-0 right-0 p-4 bg-background border-t border-border">
            <div className="container">
              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={isSubmitting || !selectedVehicle || !selectedDriver || !allPhotosUploaded || !hasSignature}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                אשר מסירת רכב
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
