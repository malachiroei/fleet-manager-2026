import { useEffect, useState, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVehicles, fetchActiveDriverAssignments } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import {
  useCreateHandover,
  uploadHandoverPhoto,
  uploadSignature,
  archiveHandoverSubmission,
  type AssignmentMode,
} from '@/hooks/useHandovers';
import { useAuth } from '@/hooks/useAuth';
import { useOrgDocuments } from '@/hooks/useOrgDocuments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';
import FuelLevelSelector from '@/components/FuelLevelSelector';
import PhotoUpload from '@/components/PhotoUpload';
import VehicleDamage3DSelector from '@/components/VehicleDamage3DSelector';
import { ArrowRight, ArrowLeft, Loader2, Truck, Camera } from 'lucide-react';
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

export default function VehicleDeliveryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: orgDocuments } = useOrgDocuments();
  const createHandover = useCreateHandover();
  const { user } = useAuth();
  const signatureRef = useRef<SignaturePadRef>(null);
  const replacementApprovalSignatureRef = useRef<SignaturePadRef>(null);
  const forcedMode = searchParams.get('mode') === 'replacement' ? 'replacement' : 'permanent';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const assignmentMode: AssignmentMode = forcedMode;
  const [odometer, setOdometer] = useState('');
  const [fuelLevel, setFuelLevel] = useState(4);
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [replacementApprovalChecked, setReplacementApprovalChecked] = useState(false);
  const [hasReplacementApprovalSignature, setHasReplacementApprovalSignature] = useState(false);
  const [damageReport, setDamageReport] = useState(cloneEmptyDamageReport());
  const [selectedDeliveryFormIds, setSelectedDeliveryFormIds] = useState<string[]>([]);
  
  // Photo states
  const [photoFront, setPhotoFront] = useState<File | null>(null);
  const [photoBack, setPhotoBack] = useState<File | null>(null);
  const [photoRight, setPhotoRight] = useState<File | null>(null);
  const [photoLeft, setPhotoLeft] = useState<File | null>(null);

  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);
  const selectedDriverData = drivers?.find(d => d.id === selectedDriver);
  const allPhotosUploaded = photoFront && photoBack && photoRight && photoLeft;
  const futuristicCardClass = 'rounded-2xl border border-cyan-400/25 bg-gradient-to-b from-[#0d233b] to-[#08182d] shadow-[0_12px_32px_rgba(0,0,0,0.38)]';
  const fieldClass = 'h-11 rounded-xl border-cyan-300/25 bg-[#061325]/80 text-white placeholder:text-cyan-100/45 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] focus-visible:ring-cyan-300/45';
  const labelClass = 'mb-1.5 block text-xs font-semibold tracking-wide text-cyan-100/80';

  const availableDeliveryForms = (orgDocuments ?? []).filter((doc) => doc.is_active);

  useEffect(() => {
    if (availableDeliveryForms.length === 0) return;
    setSelectedDeliveryFormIds((current) => {
      if (current.length > 0) {
        const existing = new Set(availableDeliveryForms.map((doc) => doc.id));
        return current.filter((id) => existing.has(id));
      }
      const defaults = availableDeliveryForms
        .filter((doc) => Boolean(doc.include_in_delivery))
        .map((doc) => doc.id);
      return defaults.length > 0 ? defaults : availableDeliveryForms.map((doc) => doc.id);
    });
  }, [availableDeliveryForms]);

  const toggleDeliveryForm = (formId: string, checked: boolean) => {
    setSelectedDeliveryFormIds((current) => {
      if (checked) return Array.from(new Set([...current, formId]));
      return current.filter((id) => id !== formId);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
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

    if (assignmentMode === 'replacement') {
      if (!replacementApprovalChecked) {
        toast.error('נא לאשר את הצהרת מסירת הרכב החליפי');
        return;
      }

      if (replacementApprovalSignatureRef.current?.isEmpty()) {
        toast.error('נא לחתום על טופס האישור לרכב חליפי');
        return;
      }
    }

    const existingActiveAssignments = await fetchActiveDriverAssignments(selectedDriver, selectedVehicle);
    if (existingActiveAssignments.length > 0) {
      const approved = window.confirm('שים לב, לנהג זה כבר משויך רכב. האם ברצונך להחליף את הרכב הקיים?');
      if (!approved) {
        return;
      }
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
        notes: mergedNotes || null,
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
          notes: mergedNotes || null,
          damageReport,
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

      toast.success(assignmentMode === 'replacement' ? 'מסירת רכב חליפי נרשמה בהצלחה' : 'מסירת רכב נרשמה בהצלחה');

      // Always continue to the wizard. Final email/send is executed only at
      // the wizard completion step ("סיים וחתום").
      const wizardUrl =
        `/handover/wizard?vehicleId=${selectedVehicle}&driverId=${selectedDriver}` +
        `&handoverId=${encodeURIComponent(handover.id)}` +
        `&reportUrl=${encodeURIComponent(reportUrl)}` +
        `&mode=${assignmentMode}` +
        `&selectedForms=${encodeURIComponent(selectedDeliveryFormIds.join(','))}`;

      window.location.assign(wizardUrl);
    } catch (error) {
      console.error('Error creating handover:', error);
      toast.error(`שגיאה ברישום מסירת הרכב: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.history.length > 1) {
                  window.history.back();
                  return;
                }
                window.location.assign('/');
              }}
              aria-label="חזרה"
            >
                <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="font-bold text-xl">מסירת רכב קבוע</h1>
            <div className="mr-auto">
              <Button type="button" variant="outline" size="sm" onClick={() => window.location.assign('/')}>
                יציאה
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehicle & Driver Selection */}
          <Card className={futuristicCardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-primary" />
                פרטי המסירה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={labelClass}>בחר רכב *</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger className={fieldClass}>
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
                <Label className={labelClass}>בחר נהג *</Label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger className={fieldClass}>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="odometer" className={labelClass}>קילומטראז׳ *</Label>
                  <Input
                    id="odometer"
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    min={selectedVehicleData?.current_odometer || 0}
                    placeholder={selectedVehicleData ? `מינימום: ${selectedVehicleData.current_odometer}` : 'קריאת מונה'}
                    required
                    dir="ltr"
                    className={fieldClass}
                  />
                </div>
              </div>

              <FuelLevelSelector value={fuelLevel} onChange={setFuelLevel} />
            </CardContent>
          </Card>

          <Card className={futuristicCardClass}>
            <CardHeader>
              <CardTitle className="text-lg">בחירת טפסים למסירה זו</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {availableDeliveryForms.length === 0 ? (
                <p className="text-sm text-cyan-100/70">לא נמצאו טפסים שסומנו להצגה במסירה במרכז הטפסים.</p>
              ) : (
                availableDeliveryForms.map((form) => (
                  <label key={form.id} className="flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-[#061325]/50 px-3 py-2 text-sm text-cyan-50/95">
                    <Checkbox
                      checked={selectedDeliveryFormIds.includes(form.id)}
                      onCheckedChange={(checked) => toggleDeliveryForm(form.id, checked === true)}
                    />
                    <span>{form.title}</span>
                  </label>
                ))
              )}
              <p className="text-xs text-cyan-100/65">ניתן לשנות שוב את הבחירה גם בתוך אשף המסירה.</p>
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
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="חזית" onPhotoCapture={setPhotoFront} required /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="אחור" onPhotoCapture={setPhotoBack} required /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="צד ימין" onPhotoCapture={setPhotoRight} required /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="צד שמאל" onPhotoCapture={setPhotoLeft} required /></div>
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

          {assignmentMode === 'replacement' && (
            <Card className={futuristicCardClass}>
              <CardHeader>
                <CardTitle className="text-lg">אישור עובד למסירת רכב חליפי</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-cyan-300/25 bg-[#061325]/75 p-4 text-sm text-cyan-50/95">
                  <p className="mb-2 font-semibold">הצהרת עובד/ת:</p>
                  <p>אני מאשר/ת שקיבלתי רכב חליפי תקין, קיבלתי הסבר על השימוש ברכב, ואני מתחייב/ת להחזירו בהתאם לנהלי החברה.</p>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-[#061325]/50 px-3 py-2 text-sm text-cyan-50/95">
                  <Checkbox
                    checked={replacementApprovalChecked}
                    onCheckedChange={(checked) => setReplacementApprovalChecked(checked === true)}
                  />
                  <span>קראתי ואני מאשר/ת את ההצהרה</span>
                </label>

                <div>
                  <Label className={labelClass}>חתימת העובד על אישור נפרד</Label>
                  <SignaturePad ref={replacementApprovalSignatureRef} onSign={setHasReplacementApprovalSignature} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card className={futuristicCardClass}>
            <CardContent className="pt-6">
              <Label htmlFor="notes" className={labelClass}>הערות</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות לגבי מצב הרכב..."
                rows={3}
                className="rounded-xl border-cyan-300/25 bg-[#061325]/80 text-white placeholder:text-cyan-100/45 focus-visible:ring-cyan-300/45"
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="fixed bottom-12 left-0 right-0 p-4">
            <div className="container flex justify-center">
              <Button 
                type="submit" 
                className="gap-2 min-w-[280px] rounded-2xl bg-cyan-500 px-8 py-6 text-base font-bold text-[#020617] shadow-[0_14px_28px_rgba(14,165,233,0.34)] hover:bg-cyan-400" 
                size="lg"
                disabled={
                  isSubmitting ||
                  !selectedVehicle ||
                  !selectedDriver ||
                  !allPhotosUploaded ||
                  !hasSignature ||
                  (assignmentMode === 'replacement' && (!replacementApprovalChecked || !hasReplacementApprovalSignature))
                }
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                המשך לחתימה על טפסים
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
