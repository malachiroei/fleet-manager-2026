import { toast } from 'sonner';

export function suggestPeriodicInspectionToast(opts: {
  vehicleId: string;
  mode: 'service' | 'test';
  /** כבר במסך פרטי הרכב — ללא קישור ניווט */
  onVehicleDetailPage?: boolean;
}) {
  const title =
    opts.mode === 'service'
      ? 'לאחר עדכון טיפול: ביקורת תקופתית'
      : 'לאחר עדכון טסט: ביקורת תקופתית';

  const description = opts.onVehicleDetailPage
    ? 'מומלץ לעדכן ביקורת תקופתית — לחץ על «ביקורת תקופתית» בפעולות המהירות.'
    : 'מומלץ לעדכן ביקורת תקופתית בכרטיס הרכב (פעולות מהירות → ביקורת תקופתית).';

  if (opts.onVehicleDetailPage) {
    toast.info(title, { description, duration: 12000 });
    return;
  }

  toast.info(title, {
    description,
    duration: 14000,
    action: {
      label: 'מעבר לכרטיס',
      onClick: () => {
        window.location.assign(`/vehicles/${opts.vehicleId}`);
      },
    },
  });
}
