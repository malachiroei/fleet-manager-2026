import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVehicles, useDeleteVehicle } from '@/hooks/useVehicles';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  ArrowRight, 
  Plus, 
  Search, 
  Car,
  Trash2,
  Edit,
  Eye
} from 'lucide-react';
import type { Vehicle, ComplianceStatus } from '@/types/fleet';

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const config = {
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' }
  };

  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

function VehicleCard({ vehicle, onDelete, canEdit }: { 
  vehicle: Vehicle; 
  onDelete: () => void;
  canEdit: boolean;
}) {
  const calculateStatus = (expiryDate: string): ComplianceStatus => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'warning';
    return 'valid';
  };

  const testStatus = calculateStatus(vehicle.test_expiry);
  const insuranceStatus = calculateStatus(vehicle.insurance_expiry);
  const worstStatus = testStatus === 'expired' || insuranceStatus === 'expired' 
    ? 'expired' 
    : (testStatus === 'warning' || insuranceStatus === 'warning' ? 'warning' : 'valid');

  return (
    <Card className="card-hover">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Car className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{vehicle.manufacturer} {vehicle.model}</h3>
              <p className="text-sm text-muted-foreground">{vehicle.plate_number}</p>
            </div>
          </div>
          <StatusBadge status={worstStatus} />
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">שנה:</span> {vehicle.year}
          </div>
          <div>
            <span className="text-muted-foreground">ק"מ:</span> {vehicle.current_odometer.toLocaleString()}
          </div>
          <div>
            <span className="text-muted-foreground">טסט:</span> {new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}
          </div>
          <div>
            <span className="text-muted-foreground">ביטוח:</span> {new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Link to={`/vehicles/${vehicle.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1">
              <Eye className="h-4 w-4" />
              צפייה
            </Button>
          </Link>
          {canEdit && (
            <>
              <Link to={`/vehicles/${vehicle.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const deleteVehicle = useDeleteVehicle();
  const { isManager } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredVehicles = vehicles?.filter(v => 
    v.plate_number.includes(search) ||
    v.manufacturer.includes(search) ||
    v.model.includes(search)
  );

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('vehicles.title')}</h1>
          <p className="text-slate-500 mt-1">{t('vehicles.subtitle')}</p>
        </div>
        <Link to="/vehicles/add">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('vehicles.addVehicle')}
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('vehicles.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Content */}
      <div>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : filteredVehicles?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('vehicles.noVehicles')}</p>
              <Link to="/vehicles/add">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('vehicles.addNewVehicle')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredVehicles?.map(vehicle => (
              <VehicleCard 
                key={vehicle.id} 
                vehicle={vehicle} 
                onDelete={() => setDeleteId(vehicle.id)}
                canEdit={isManager}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vehicles.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('vehicles.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  deleteVehicle.mutate(deleteId);
                  setDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
