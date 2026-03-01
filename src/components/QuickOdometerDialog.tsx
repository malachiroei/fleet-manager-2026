import { useState } from 'react';
import { useVehicles, useUpdateOdometer } from '@/hooks/useVehicles';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Car, Gauge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface QuickOdometerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function QuickOdometerDialog({ open, onOpenChange }: QuickOdometerDialogProps) {
  const { data: vehicles } = useVehicles();
  const updateOdometer = useUpdateOdometer();
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [newOdometer, setNewOdometer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVehicleData = vehicles?.find(v => v.id === selectedVehicle);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !newOdometer) return;

    const odometerValue = parseInt(newOdometer);
    if (selectedVehicleData && odometerValue < selectedVehicleData.current_odometer) {
      toast.error('קילומטראז׳ חדש חייב להיות גבוה מהנוכחי');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateOdometer.mutateAsync({
        id: selectedVehicle,
        odometer: odometerValue
      });
      toast.success('קילומטראז׳ עודכן בהצלחה');
      onOpenChange(false);
      setSelectedVehicle('');
      setNewOdometer('');
    } catch (error) {
      toast.error('שגיאה בעדכון קילומטראז׳');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            עדכון קילומטראז׳ מהיר
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{selectedVehicleData.manufacturer} {selectedVehicleData.model}</p>
                <p className="text-sm text-muted-foreground">
                  נוכחי: {selectedVehicleData.current_odometer.toLocaleString()} ק"מ
                </p>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="new_odometer">קילומטראז׳ חדש</Label>
            <Input 
              id="new_odometer" 
              type="number"
              value={newOdometer}
              onChange={(e) => setNewOdometer(e.target.value)}
              min={selectedVehicleData?.current_odometer || 0}
              placeholder="הכנס קריאת מונה"
              required
              dir="ltr"
              className="text-lg"
            />
            {selectedVehicleData && (
              <p className="text-xs text-muted-foreground mt-1">
                מינימום: {selectedVehicleData.current_odometer.toLocaleString()} ק"מ
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={isSubmitting || !selectedVehicle || !newOdometer}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              עדכן
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
