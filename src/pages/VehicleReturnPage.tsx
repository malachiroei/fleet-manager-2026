import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVehicles } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { supabase } from '@/integrations/supabase/client';
import {
  useCreateHandover,
  useLatestHandover,
  uploadHandoverPhoto,
  uploadSignature,
  archiveHandoverSubmission,
  sendHandoverNotificationEmail,
} from '@/hooks/useHandovers';
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
import VehicleDamage3DSelector from '@/components/VehicleDamage3DSelector';
import { ArrowRight, Loader2, RotateCcw, Camera, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  cloneEmptyDamageReport,
  hasAnyDamage,
  summarizeDamageReport,
} from '@/lib/vehicleDamage';

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

export default function VehicleReturnPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const createHandover = useCreateHandover();
  const { user } = useAuth();
  const signatureRef = useRef<SignaturePadRef>(null);
  const assignmentMode = searchParams.get('mode') === 'replacement' ? 'replacement' : 'permanent';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fuelLevel, setFuelLevel] = useState(4);
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [damageReport, setDamageReport] = useState(cloneEmptyDamageReport());
  
  // Photo states
  const [photoFront, setPhotoFront] = useState<File | null>(null);
  const [photoBack, setPhotoBack] = useState<File | null>(null);
  const [photoRight, setPhotoRight] = useState<File | null>(null);
  const [photoLeft, setPhotoLeft] = useState<File | null>(null);

  const { data: replacementEligibility = [], isLoading: replacementLoading } = useQuery({
    queryKey: ['replacement-return-eligibility'],
    enabled: assignmentMode === 'replacement',
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('vehicle_handovers')
        .select('vehicle_id, driver_id, handover_type, assignment_mode, handover_date')
        .order('handover_date', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const rows = (data ?? []) as Array<{
        vehicle_id: string;
        driver_id: string | null;
        handover_type: 'delivery' | 'return';
        assignment_mode?: 'permanent' | 'replacement' | null;
        handover_date: string;
      }>;

      const latestByVehicle = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (row.assignment_mode !== 'replacement') continue;
        if (!latestByVehicle.has(row.vehicle_id)) {
          latestByVehicle.set(row.vehicle_id, row);
        }
      }

      return Array.from(latestByVehicle.values()).filter((row) => row.handover_type === 'delivery');
    },
  });

  const eligibleVehicleIds = useMemo(
    () => new Set(replacementEligibility.map((item) => item.vehicle_id)),
    [replacementEligibility]
  );

  const vehicleOptions = useMemo(() => {
    if (assignmentMode !== 'replacement') return vehicles ?? [];
    return (vehicles ?? []).filter((vehicle) => eligibleVehicleIds.has(vehicle.id));
  }, [assignmentMode, vehicles, eligibleVehicleIds]);

  const replacementDriverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of replacementEligibility) {
      if (row.driver_id) map.set(row.vehicle_id, row.driver_id);
    }
    return map;
  }, [replacementEligibility]);

  useEffect(() => {
    if (assignmentMode !== 'replacement') return;
    if (!selectedVehicle) {
      setSelectedDriver('');
      return;
    }

    const driverId = replacementDriverMap.get(selectedVehicle) ?? '';
    setSelectedDriver(driverId);
  }, [assignmentMode, replacementDriverMap, selectedVehicle]);

  const { data: lastHandover } = useLatestHandover(selectedVehicle);
  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);
  const selectedDriverData = drivers?.find(d => d.id === selectedDriver);
  const allPhotosUploaded = photoFront && photoBack && photoRight && photoLeft;
  const futuristicCardClass = 'rounded-2xl border border-cyan-400/25 bg-gradient-to-b from-[#0d233b] to-[#08182d] shadow-[0_12px_32px_rgba(0,0,0,0.38)]';
  const fieldClass = 'h-11 rounded-xl border-cyan-300/25 bg-[#061325]/80 text-white placeholder:text-cyan-100/45 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] focus-visible:ring-cyan-300/45';
  const labelClass = 'mb-1.5 block text-xs font-semibold tracking-wide text-cyan-100/80';

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

    if (assignmentMode === 'replacement' && !eligibleVehicleIds.has(selectedVehicle)) {
      toast.error('ניתן להחזיר רק רכב חליפי שבוצעה עליו מסירה קודם');
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
    const damageSummary = summarizeDamageReport(damageReport);
    const mergedNotes = [
      notes.trim() || null,
      hasAnyDamage(damageReport) ? `דיווח נזק: ${damageSummary}` : null,
    ]
      .filter(Boolean)
      .join('\n');

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
        toast.warning('ההחזרה תירשם, אך חלק מהתמונות לא נשמרו בשרת');
      }

      // Upload signature
      const signatureDataUrl = signatureRef.current?.getDataUrl();
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        try {
          signatureUrl = await uploadSignature(signatureDataUrl, selectedVehicle, 'return');
        } catch (signatureError) {
          console.error('Signature upload error:', signatureError);
          toast.warning('ההחזרה תירשם, אך החתימה לא נשמרה בשרת');
        }
      }

      // Create handover record
      const handover = await createHandover.mutateAsync({
        vehicle_id: selectedVehicle,
        driver_id: selectedDriver,
        handover_type: 'return',
        assignment_mode: assignmentMode as any,
        handover_date: new Date().toISOString(),
        odometer_reading: parseInt(odometer),
        fuel_level: fuelLevel,
        photo_front_url: frontUrl,
        photo_back_url: backUrl,
        photo_right_url: rightUrl,
        photo_left_url: leftUrl,
        signature_url: signatureUrl,
        notes: mergedNotes || null,
        created_by: user?.id || null,
      });

      let reportUrl = '';
      try {
        const archived = await archiveHandoverSubmission({
          handoverId: handover.id,
          handoverType: 'return',
          vehicleId: selectedVehicle,
          vehicleLabel: `${selectedVehicleData?.manufacturer ?? ''} ${selectedVehicleData?.model ?? ''} (${selectedVehicleData?.plate_number ?? ''})`.trim(),
          driverId: selectedDriver,
          driverLabel: selectedDriverData?.full_name ?? 'לא ידוע',
          odometerReading: parseInt(odometer),
          fuelLevel,
          notes: mergedNotes || null,
          assignmentMode,
          damageReport,
          photoUrls: {
            front: frontUrl,
            back: backUrl,
            right: rightUrl,
            left: leftUrl,
          },
          signatureUrl,
          createdBy: user?.id ?? null,
          includeDriverArchive: true,
        });

        const data = archived.handover;
        console.log('Persisted PDF URL:', data.pdf_url);
        reportUrl = archived.handover.pdf_url;
        queryClient.invalidateQueries({ queryKey: ['active-driver-vehicle-assignments'] });
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
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
          handoverType: 'return',
          vehicleLabel: `${selectedVehicleData?.manufacturer ?? ''} ${selectedVehicleData?.model ?? ''} (${selectedVehicleData?.plate_number ?? ''})`.trim(),
          driverLabel: selectedDriverData?.full_name ?? 'לא ידוע',
          odometerReading: parseInt(odometer),
          fuelLevel,
          notes: mergedNotes || null,
          assignmentMode,
          damageSummary,
          reportUrl,
        });
      } catch (emailError) {
        console.error('Email notification error:', emailError);
        const msg = emailError instanceof Error ? emailError.message : 'שגיאה לא ידועה';
        toast.warning(`הטופס נשמר, אך שליחת המייל נכשלה: ${msg}`);
      }

      toast.success(assignmentMode === 'replacement' ? 'החזרת רכב חליפי נרשמה בהצלחה' : 'החזרת רכב נרשמה בהצלחה');
      navigate('/');
    } catch (error) {
      console.error('Error creating handover:', error);
      toast.error(`שגיאה ברישום החזרת הרכב: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <main className="container py-6 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehicle & Driver Selection */}
          <Card className={futuristicCardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RotateCcw className="h-5 w-5 text-primary" />
                פרטי ההחזרה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={labelClass}>בחר רכב *</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="בחר רכב מהרשימה" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 bg-card border border-border shadow-xl">
                    {vehicleOptions.map(v => (
                      <SelectItem key={v.id} value={v.id} className="py-2 leading-snug">
                        {v.manufacturer} {v.model} ({v.plate_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignmentMode === 'replacement' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    מוצגים רק רכבים חליפיים שנמצאים כרגע בסטטוס מסירה פעילה.
                  </p>
                )}
              </div>

              <div>
                <Label className={labelClass}>סוג החזרה</Label>
                <div className="rounded-xl border border-cyan-300/25 bg-[#061325]/70 px-3 py-2.5 text-sm text-cyan-50/90">
                  {assignmentMode === 'replacement' ? 'החזרת רכב חליפי' : 'החזרת רכב קבוע'}
                </div>
              </div>

              <div>
                <Label className={labelClass}>בחר נהג *</Label>
                <Select
                  value={selectedDriver}
                  onValueChange={setSelectedDriver}
                  disabled={assignmentMode === 'replacement'}
                >
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="בחר נהג מהרשימה" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 bg-card border border-border shadow-xl">
                    {drivers?.map(d => (
                      <SelectItem key={d.id} value={d.id} className="py-2 leading-snug">
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignmentMode === 'replacement' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    הנהג נבחר אוטומטית לפי המסירה החליפית האחרונה של הרכב.
                  </p>
                )}
              </div>

              {/* Comparison with delivery */}
              {lastHandover && (
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      נתוני מסירה לשוואה
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="odometer" className={labelClass}>קילומטראז׳ *</Label>
                  <Input
                    id="odometer"
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    min={lastHandover?.odometer_reading || selectedVehicleData?.current_odometer || 0}
                    placeholder="קריאת מונה"
                    required
                    dir="ltr"
                    className={fieldClass}
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

          <Card className={futuristicCardClass}>
            <CardHeader>
              <CardTitle className="text-lg">סימון נזקים לפי צד ברכב</CardTitle>
            </CardHeader>
            <CardContent>
              <VehicleDamage3DSelector value={damageReport} onChange={setDamageReport} />
            </CardContent>
          </Card>

          {/* Photos */}
          <Card className={futuristicCardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="h-5 w-5 text-primary" />
                צילום הרכב (4 זוויות)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="חזית" onPhotoCapture={setPhotoFront} required disabled={isSubmitting} /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="אחור" onPhotoCapture={setPhotoBack} required disabled={isSubmitting} /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="צד ימין" onPhotoCapture={setPhotoRight} required disabled={isSubmitting} /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="צד שמאל" onPhotoCapture={setPhotoLeft} required disabled={isSubmitting} /></div>
              </div>
            </CardContent>
          </Card>

          {/* Signature */}
          <Card className={futuristicCardClass}>
            <CardHeader>
              <CardTitle className="text-lg">חתימת הנהג</CardTitle>
            </CardHeader>
            <CardContent>
              <SignaturePad ref={signatureRef} onSign={setHasSignature} />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className={futuristicCardClass}>
            <CardContent className="pt-6">
              <Label htmlFor="notes" className={labelClass}>הערות</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות לגבי מצב הרכב, נזקים חדשים וכו׳..."
                rows={3}
                className="rounded-xl border-cyan-300/25 bg-[#061325]/80 text-white placeholder:text-cyan-100/45 focus-visible:ring-cyan-300/45"
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="fixed bottom-12 left-0 right-0 p-4 bg-[#020617]/95 backdrop-blur-sm border-t border-white/10">
            <div className="container">
              <Button 
                type="submit" 
                className="w-full rounded-2xl border border-cyan-200/45 bg-[linear-gradient(180deg,rgba(56,189,248,0.65)_0%,rgba(59,130,246,0.55)_48%,rgba(14,116,144,0.85)_100%)] py-6 text-base font-bold text-white shadow-[0_14px_28px_rgba(14,165,233,0.34)] hover:translate-y-[-1px] hover:brightness-110" 
                size="lg"
                disabled={
                  isSubmitting ||
                  !selectedVehicle ||
                  !selectedDriver ||
                  !allPhotosUploaded ||
                  !hasSignature ||
                  (assignmentMode === 'replacement' && vehicleOptions.length === 0)
                }
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                {assignmentMode === 'replacement' ? 'אשר החזרת רכב חליפי' : 'אשר החזרת רכב'}
              </Button>
              {assignmentMode === 'replacement' && replacementLoading && (
                <p className="mt-2 text-center text-xs text-muted-foreground">טוען רשימת רכבים חליפיים...</p>
              )}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
