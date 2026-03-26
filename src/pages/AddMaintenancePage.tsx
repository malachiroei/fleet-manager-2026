import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ClipboardList, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const SERVICE_TYPES = ['טיפול קטן', 'טיפול גדול', 'בלמים', 'העברת טסט'] as const;

export type MaintenanceServicePayload = {
  vehicleId: string;
  vehicleLabel: string;
  serviceType: string;
  currentKm: number;
  serviceDate: string;
  notes: string;
};

export default function AddMaintenancePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles();
  const [open, setOpen] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [currentKm, setCurrentKm] = useState('');
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedVehicle = vehicles?.find((v) => v.id === selectedVehicleId);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      navigate(-1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleId || !serviceType.trim()) {
      toast.error('נא לבחור רכב וסוג טיפול');
      return;
    }
    const km = parseInt(String(currentKm).replace(/\s/g, ''), 10);
    if (!Number.isFinite(km) || km < 0) {
      toast.error('נא להזין ק״מ תקין');
      return;
    }
    if (!serviceDate?.trim()) {
      toast.error('נא לבחור תאריך');
      return;
    }

    setSubmitting(true);
    try {
      const notesTrim = notes.trim();

      const { error } = await supabase.from('maintenance_records').insert({
        vehicle_id: selectedVehicleId,
        service_type: serviceType,
        odometer: km,
        date: serviceDate.trim(),
        notes: notesTrim.length > 0 ? notesTrim : null,
        created_by: user?.id ?? null,
      });

      if (error) {
        console.error('[MaintenanceService] insert failed', error);
        toast.error('שמירה נכשלה', {
          description: error.message,
        });
        return;
      }

      toast.success('הטיפול נרשם בהצלחה');
      setSelectedVehicleId('');
      setServiceType('');
      setCurrentKm('');
      setServiceDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setOpen(false);
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[40vh] bg-background">
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="left"
          className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0"
          dir="rtl"
        >
          <div className="p-6 pb-4 border-b border-border">
            <SheetHeader className="space-y-1 text-start">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <ClipboardList className="h-5 w-5" aria-hidden />
                </span>
                <SheetTitle className="text-lg">עדכן טיפול</SheetTitle>
              </div>
              <SheetDescription className="text-xs text-muted-foreground text-start">
                רישום טיפול בטבלת maintenance_records (דורש טבלה ו-RLS ב-Supabase).
              </SheetDescription>
            </SheetHeader>
          </div>

          <form onSubmit={(ev) => void handleSubmit(ev)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="space-y-2">
                <Label>בחירת רכב</Label>
                <Select
                  value={selectedVehicleId}
                  onValueChange={setSelectedVehicleId}
                  disabled={vehiclesLoading}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder={vehiclesLoading ? 'טוען צי…' : 'בחר רכב מהצי'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(vehicles ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.manufacturer} {v.model} — {v.plate_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>סוג טיפול</Label>
                <Select value={serviceType} onValueChange={setServiceType} required>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סוג" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maint-km">ק״מ נוכחי</Label>
                <Input
                  id="maint-km"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  dir="ltr"
                  className="text-start"
                  value={currentKm}
                  onChange={(e) => setCurrentKm(e.target.value)}
                  placeholder={selectedVehicle != null ? String(selectedVehicle.current_odometer) : '0'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maint-date">תאריך</Label>
                <Input
                  id="maint-date"
                  type="date"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maint-notes">הערות</Label>
                <Textarea
                  id="maint-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="פרטים נוספים…"
                />
              </div>
            </div>

            <SheetFooter className="p-6 pt-4 border-t border-border flex-col sm:flex-col gap-2">
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : null}
                שמירה
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => handleOpenChange(false)}>
                ביטול
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
