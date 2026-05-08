import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Gauge, Loader2, Search, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVehicles } from '@/hooks/useVehicles';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HudPhotoSlot } from '@/components/HudPhotoSlot';

const DOCS_BUCKET = 'vehicle-documents';

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

async function uploadMileagePhoto(vehicleId: string, file: File): Promise<string> {
  const ext = sanitizeFileExt(file.name);
  const uid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `vehicle-files/${vehicleId}/mileage_${uid}.${ext}`;
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
  });
  if (error) throw error;
  const { data } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(path);
  return String(data?.publicUrl ?? '');
}

function uniqueNonEmpty(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = (raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export type MileageUpdateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the vehicle picker is locked to this vehicle. */
  lockedVehicleId?: string | null;
};

export function MileageUpdateDialog({ open, onOpenChange, lockedVehicleId }: MileageUpdateDialogProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectFromQuery = (searchParams.get('vehicle') ?? '').trim();
  const queryClient = useQueryClient();

  const { user, profile, activeOrgId } = useAuth();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();

  const lockedId = (lockedVehicleId ?? preselectFromQuery ?? '').trim();
  const isLocked = Boolean(lockedId);

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isLocked) setSelectedVehicleId(lockedId);
  }, [open, isLocked, lockedId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    const base = !q
      ? vehicles
      : vehicles.filter((v) => {
          const plate = (v.plate_number ?? '').toLowerCase();
          const internal = (v.internal_number ?? '').toLowerCase();
          const label = `${v.manufacturer ?? ''} ${v.model ?? ''}`.toLowerCase();
          const hay = `${plate} ${internal} ${label}`.trim();
          const tokens = q.split(/\s+/).filter(Boolean);
          const tokenMatch = tokens.length > 0 && tokens.every((t) => hay.includes(t));
          return plate.includes(q) || internal.includes(q) || label.includes(q) || hay.includes(q) || tokenMatch;
        });
    const sid = selectedVehicleId.trim();
    if (!sid) return base;
    const chosen = vehicles.find((v) => v.id === sid);
    if (!chosen || base.some((v) => v.id === sid)) return base;
    return [chosen, ...base];
  }, [vehicleSearch, vehicles, selectedVehicleId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('יש להתחבר לפני עדכון ק״מ');
      navigate('/auth');
      return;
    }
    if (!selectedVehicle) {
      toast.error('נא לבחור רכב');
      return;
    }
    const odo = Number(odometer);
    if (!Number.isFinite(odo) || odo <= 0) {
      toast.error('נא להזין קילומטראז׳ תקין');
      return;
    }

    // Soft check: don’t block, just warn.
    const current = Number(selectedVehicle.current_odometer ?? 0);
    if (Number.isFinite(current) && current > 0 && odo < current) {
      toast.error(`ק״מ חדש נמוך מהקיים במערכת (${current.toLocaleString('he-IL')})`);
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        photoUrl = await uploadMileagePhoto(selectedVehicle.id, photoFile);
      }

      const res = await supabase.functions.invoke('update-mileage', {
        body: {
          vehicle_id: selectedVehicle.id,
          odometer_value: odo,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        },
      });

      if (res.error) {
        const msg = res.error.message || 'שליחה נכשלה';
        toast.error(msg);
        return;
      }

      const payload = res.data as { ok?: boolean; error?: string; recipients?: string[] } | null;
      if (!payload?.ok) {
        toast.error(payload?.error || 'השרת לא אישר שמירה');
        return;
      }

      const orgId = selectedVehicle.org_id ?? profile?.org_id ?? activeOrgId ?? null;
      void queryClient.invalidateQueries({ queryKey: ['vehicle', selectedVehicle.id, orgId] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['vehicle-documents', selectedVehicle.id] });

      const recipients = uniqueNonEmpty(payload?.recipients ?? []);
      toast.success('עודכן בהצלחה', {
        description: recipients.length ? `נשלח מייל ל־${recipients.join(', ')}` : undefined,
      });

      onOpenChange(false);
      setPhotoFile(null);
      setOdometer('');
      if (!isLocked) setSelectedVehicleId('');
      setVehicleSearch('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שליחה נכשלה';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-sky-400" />
            עדכון ק״מ
          </DialogTitle>
          <DialogDescription>
            בחרו רכב, הזינו ק״מ נוכחי, וצירפו צילום לוח שעונים (לא חובה).
          </DialogDescription>
        </DialogHeader>

        {vehiclesLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!isLocked ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mileage-search" className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    חיפוש רכב
                  </Label>
                  <Input
                    id="mileage-search"
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    placeholder="לדוגמה: 12-345-67 / פנימי / דגם"
                    className="text-base"
                    dir="ltr"
                    autoComplete="off"
                  />
                  {vehicleSearch.trim() ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setVehicleSearch('')}
                    >
                      <X className="h-3.5 w-3.5 ml-1" />
                      נקה חיפוש
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>בחר רכב</Label>
                  <Select
                    value={selectedVehicleId}
                    onValueChange={(next) => {
                      setSelectedVehicleId(next);
                      setVehicleSearch('');
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="בחר רכב מהרשימה" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plate_number}
                          {v.internal_number ? ` · ${v.internal_number}` : ''} · {v.manufacturer} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    מציג {filteredVehicles.length.toLocaleString('he-IL')} מתוך {vehicles.length.toLocaleString('he-IL')} רכבים
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-sm">
                <span className="text-muted-foreground">רכב נבחר:</span>{' '}
                <span className="font-semibold" dir="ltr">
                  {selectedVehicle?.plate_number ?? '—'}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mileage-odo">ק״מ נוכחי</Label>
              <Input
                id="mileage-odo"
                type="number"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="הכנס קריאת מונה"
                required
                dir="ltr"
                className="h-11 text-base"
              />
              {selectedVehicle?.current_odometer != null ? (
                <p className="text-[11px] text-muted-foreground">
                  נוכחי במערכת: {Number(selectedVehicle.current_odometer).toLocaleString('he-IL')} ק״מ
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>צילום לוח שעונים (אופציונלי)</Label>
              <HudPhotoSlot
                file={photoFile}
                onFileChange={setPhotoFile}
                imageAlt="לוח שעונים"
                disabled={submitting}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                ביטול
              </Button>
              <Button type="submit" disabled={submitting || !selectedVehicleId.trim() || !odometer.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                שלח עדכון
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

