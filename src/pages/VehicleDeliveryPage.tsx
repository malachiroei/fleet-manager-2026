import { toast } from 'sonner';
import { useEffect, useState, useRef, useMemo, useCallback, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  useVehicleSpecDirty,
  DIRTY_SOURCE_VEHICLE_DELIVERY,
  VEHICLE_DELIVERY_PATH,
} from '@/contexts/VehicleSpecDirtyContext';
import { useVehicles, fetchActiveDriverAssignments } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { supabase } from '@/integrations/supabase/client';
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setDirty, tryNavigate, getDeliveryExitConfirmed } = useVehicleSpecDirty();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: orgDocuments } = useOrgDocuments();
  const createHandover = useCreateHandover();
  const { user, profile, activeOrgId } = useAuth();
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

  /** דף תמיד מרונדר; יציאה רק עם ניקוי dirty ואז navigate — בלי return null */
  const deliveryDirty = useMemo(() => {
    if (selectedVehicle) return true;
    if (selectedDriver) return true;
    if (odometer.trim() !== '') return true;
    if (notes.trim() !== '') return true;
    if (photoFront || photoBack || photoRight || photoLeft) return true;
    if (hasSignature) return true;
    if (replacementApprovalChecked || hasReplacementApprovalSignature) return true;
    if (hasAnyDamage(damageReport)) return true;
    return false;
  }, [
    selectedVehicle,
    selectedDriver,
    odometer,
    notes,
    photoFront,
    photoBack,
    photoRight,
    photoLeft,
    hasSignature,
    replacementApprovalChecked,
    hasReplacementApprovalSignature,
    damageReport,
  ]);

  useEffect(() => {
    // אחרי אישור יציאה — לא מחזירים dirty (מונע לולאה וניווט תקוע)
    if (getDeliveryExitConfirmed()) return;
    setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, deliveryDirty);
  }, [deliveryDirty, setDirty, getDeliveryExitConfirmed]);

  // ניקוי כפוי כשהנתיב כבר לא דף מסירה (הגנה כפולה עם ה-Provider)
  useEffect(() => {
    const onDelivery =
      location.pathname === VEHICLE_DELIVERY_PATH ||
      location.pathname.startsWith(`${VEHICLE_DELIVERY_PATH}/`);
    if (!onDelivery) {
      setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, false);
    }
  }, [location.pathname, setDirty]);

  useEffect(() => {
    return () => setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, false);
  }, [setDirty]);

  useEffect(() => {
    const onGoHome = () => {
      flushSync(() => {
        setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, false);
      });
      setSelectedVehicle('');
      setSelectedDriver('');
      setOdometer('');
      setFuelLevel(4);
      setNotes('');
      setHasSignature(false);
      setReplacementApprovalChecked(false);
      setHasReplacementApprovalSignature(false);
      setDamageReport(cloneEmptyDamageReport());
      setSelectedDeliveryFormIds([]);
      setPhotoFront(null);
      setPhotoBack(null);
      setPhotoRight(null);
      setPhotoLeft(null);
    };
    window.addEventListener('app:go-home', onGoHome as EventListener);
    return () => window.removeEventListener('app:go-home', onGoHome as EventListener);
  }, [setDirty]);

  const exitDelivery = useCallback(
    (targetPath: string) => {
      if (deliveryDirty) {
        if (!window.confirm('ישנם שינויים לא שמורים, האם לצאת בכל זאת?')) return;
        // סדר קשיח: קודם setDirty(false) בסינכרון, אחר כך navigate בלבד (בלי return null)
        flushSync(() => {
          setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, false);
        });
      }
      // ניווט מלא — אותה בעיית דסינכרון Router/DOM כמו ב-tryNavigate
      const url =
        targetPath.startsWith('http')
          ? targetPath
          : targetPath.startsWith('/')
            ? `${window.location.origin}${targetPath}`
            : `${window.location.origin}/${targetPath}`;
      window.location.assign(url);
    },
    [deliveryDirty, setDirty]
  );

  const toggleDeliveryForm = (formId: string, checked: boolean) => {
    setSelectedDeliveryFormIds((current) => {
      if (checked) return Array.from(new Set([...current, formId]));
      return current.filter((id) => id !== formId);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!selectedVehicle || !selectedDriver) {
      try {
        toast.error('נא לבחור רכב ונהג');
      } catch {
        // non-blocking
      }
      return;
    }

    // Keep flow resilient: prefer profile.org_id, fallback to activeOrgId (selected org switcher)
    let orgId: string | null = profile?.org_id || activeOrgId || null;
    if (!orgId && user?.id) {
      // Fallback from DB so org_id won't block submission:
      // pick the newest org membership, and verify it exists in organizations.
      const { data: membership, error: memErr } = await (supabase as any)
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const memberOrgId = (membership as any)?.org_id as string | undefined;
      if (!memErr && memberOrgId) {
        const { data: orgRow, error: orgErr } = await (supabase as any)
          .from('organizations')
          .select('id')
          .eq('id', memberOrgId)
          .maybeSingle();
        const verifiedOrgId = (orgRow as any)?.id as string | undefined;
        if (!orgErr && verifiedOrgId) orgId = verifiedOrgId;
      }
    }
    if (!orgId) {
      try {
        toast.error('שגיאה: לא נמצאה חברה פעילה למשתמש. נסה לבחור חברה או להתחבר מחדש.');
      } catch {
        // non-blocking
      }
      return;
    }

    if (signatureRef.current?.isEmpty()) {
      try {
        toast.error('נא לחתום על הטופס');
      } catch {
        // non-blocking
      }
      return;
    }

    if (assignmentMode === 'replacement') {
      if (!replacementApprovalChecked) {
        try {
          toast.error('נא לאשר את הצהרת מסירת הרכב החליפי');
        } catch {
          // non-blocking
        }
        return;
      }

      if (replacementApprovalSignatureRef.current?.isEmpty()) {
        try {
          toast.error('נא לחתום על טופס האישור לרכב חליפי');
        } catch {
          // non-blocking
        }
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
      const optionalUploads = [
        photoFront ? uploadHandoverPhoto(photoFront, selectedVehicle, 'front') : Promise.resolve(null),
        photoBack ? uploadHandoverPhoto(photoBack, selectedVehicle, 'back') : Promise.resolve(null),
        photoRight ? uploadHandoverPhoto(photoRight, selectedVehicle, 'right') : Promise.resolve(null),
        photoLeft ? uploadHandoverPhoto(photoLeft, selectedVehicle, 'left') : Promise.resolve(null),
      ];
      const photoResults = await Promise.allSettled(optionalUploads);

      const frontUrl = photoResults[0].status === 'fulfilled' ? photoResults[0].value : null;
      const backUrl = photoResults[1].status === 'fulfilled' ? photoResults[1].value : null;
      const rightUrl = photoResults[2].status === 'fulfilled' ? photoResults[2].value : null;
      const leftUrl = photoResults[3].status === 'fulfilled' ? photoResults[3].value : null;

      if (photoResults.some((result) => result.status === 'rejected')) {
        try {
          toast.warning('המסירה תירשם, אך חלק מהתמונות לא נשמרו בשרת');
        } catch {
          // non-blocking
        }
      }

      // Upload signature
      const signatureDataUrl = signatureRef.current?.getDataUrl();
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        try {
          signatureUrl = await uploadSignature(signatureDataUrl, selectedVehicle, 'delivery');
        } catch (signatureError) {
          console.error('Signature upload error:', signatureError);
          try {
            toast.warning('המסירה תירשם, אך החתימה לא נשמרה בשרת');
          } catch {
            // non-blocking
          }
        }
      }

      // Create handover record
      const handover = await createHandover.mutateAsync({
        org_id: orgId,
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

      // If profile.org_id was missing, we can still resolve org from the created handover row
      // (kept for continuity/debugging; wizard/email flow doesn't rely on it directly here)
      const resolvedOrgId = profile?.org_id || (handover as any)?.org_id;

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
        queryClient.invalidateQueries({ queryKey: ['active-driver-vehicle-assignments'] });
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        queryClient.invalidateQueries({ queryKey: ['drivers'] });
        queryClient.invalidateQueries({ queryKey: ['driver', selectedDriver] });
        queryClient.invalidateQueries({ queryKey: ['handover-history'] });
      } catch (archiveError) {
        console.error('Archive form copy error:', archiveError);
        const message = archiveError instanceof Error ? archiveError.message : 'שגיאה לא ידועה';
        try {
          toast.error(`שמירת PDF נכשלה: ${message}`);
        } catch {
          // non-blocking
        }
        return;
      }

      if (!reportUrl) {
        try {
          toast.error('שמירת PDF נכשלה: לא התקבל קישור קובץ');
        } catch {
          // non-blocking
        }
        return;
      }

      try {
        toast.success(assignmentMode === 'replacement' ? 'מסירת רכב חליפי נרשמה בהצלחה' : 'מסירת רכב נרשמה בהצלחה');
      } catch {
        // non-blocking
      }

      // Always continue to the wizard. Final email/send is executed only at
      // the wizard completion step ("סיים וחתום").
      const wizardUrl =
        `/handover/wizard?vehicleId=${selectedVehicle}&driverId=${selectedDriver}` +
        `&handoverId=${encodeURIComponent(handover.id)}` +
        `&reportUrl=${encodeURIComponent(reportUrl)}` +
        `&mode=${assignmentMode}` +
        `&odometer=${encodeURIComponent(odometer)}` +
        `&fuelLevel=${encodeURIComponent(String(fuelLevel))}` +
        `&damageNotes=${encodeURIComponent(hasAnyDamage(damageReport) ? damageSummary : '')}` +
        `&selectedForms=${encodeURIComponent(selectedDeliveryFormIds.join(','))}`;

      setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, false);
      window.location.assign(wizardUrl);
    } catch (error) {
      console.error('Error creating handover:', error);
      try {
        toast.error(`שגיאה ברישום מסירת הרכב: ${getErrorMessage(error)}`);
      } catch {
        // non-blocking
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#020617] text-white">
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
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="חזית" onPhotoCapture={setPhotoFront} disabled={isSubmitting} /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="אחור" onPhotoCapture={setPhotoBack} disabled={isSubmitting} /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="צד ימין" onPhotoCapture={setPhotoRight} disabled={isSubmitting} /></div>
                <div className="rounded-xl border border-cyan-300/20 bg-[#061325]/70 p-3"><PhotoUpload label="צד שמאל" onPhotoCapture={setPhotoLeft} disabled={isSubmitting} /></div>
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

          {/* Submit — sticky בתוך ה-main במקום fixed ל-viewport, כדי שלא יישאר "רפאים" מעל דף אחר אחרי ניווט */}
          <div className="sticky bottom-0 left-0 right-0 z-10 bg-[#020617]/95 pb-4 pt-4 backdrop-blur-sm">
            <div className="container flex justify-center">
              <Button 
                type="submit" 
                className="gap-2 min-w-[280px] rounded-2xl bg-cyan-500 px-8 py-6 text-base font-bold text-[#020617] shadow-[0_14px_28px_rgba(14,165,233,0.34)] hover:bg-cyan-400" 
                size="lg"
                disabled={
                  isSubmitting ||
                  !selectedVehicle ||
                  !selectedDriver ||
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
