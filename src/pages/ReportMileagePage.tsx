import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Wrench } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { MileageUpdateDialog } from '@/components/mileage/MileageUpdateDialog';

export default function ReportMileagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vehicleIdFromQuery = (searchParams.get('vehicle') ?? '').trim();
  const { loading } = useAuth();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (loading) return;
    setOpen(true);
  }, [loading]);

  return (
    <FleetHudPageShell
      title="עדכון ק״מ"
      subtitle="עדכון חדש: בחירת רכב + חיפוש + ק״מ + צילום (אופציונלי)"
      headerAside={
        <Link to="/vehicles/service-update" className="w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full gap-2 border-cyan-500/40 bg-white/5 font-semibold text-cyan-100 hover:bg-cyan-500/10 sm:w-auto"
          >
            <Wrench className="h-4 w-4 shrink-0" />
            עדכון טיפול
          </Button>
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl px-4 pb-28 sm:px-6">
        <MileageUpdateDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) navigate('/', { replace: true });
          }}
          lockedVehicleId={vehicleIdFromQuery || null}
        />
      </div>

    </FleetHudPageShell>
  );
}
