import { Link } from 'react-router-dom';
import { useComplianceAlerts } from '@/hooks/useDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, AlertTriangle, Car, User, CheckCircle } from 'lucide-react';
import type { ComplianceStatus } from '@/types/fleet';

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const config = {
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' }
  };

  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

export default function CompliancePage() {
  const { data: alerts, isLoading } = useComplianceAlerts();

  const expiredAlerts = alerts?.filter(a => a.status === 'expired') || [];
  const warningAlerts = alerts?.filter(a => a.status === 'warning') || [];

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">מרכז ציות ותקינות</h1>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-destructive">{expiredAlerts.length}</div>
              <div className="text-sm text-muted-foreground">פג תוקף</div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{warningAlerts.length}</div>
              <div className="text-sm text-muted-foreground">אזהרות</div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : alerts?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
              <h2 className="text-xl font-semibold mb-2">הכל תקין!</h2>
              <p className="text-muted-foreground">אין פריטים הדורשים טיפול כרגע</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Expired Items */}
            {expiredAlerts.length > 0 && (
              <Card className="border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    פג תוקף ({expiredAlerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {expiredAlerts.map(alert => (
                    <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${alert.type === 'vehicle' ? 'bg-primary/10' : 'bg-accent/10'}`}>
                          {alert.type === 'vehicle' ? (
                            <Car className="h-5 w-5 text-primary" />
                          ) : (
                            <User className="h-5 w-5 text-accent" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{alert.name}</div>
                          <div className="text-sm text-muted-foreground">{alert.alertType}</div>
                        </div>
                      </div>
                      <div className="text-left">
                        <StatusBadge status={alert.status} />
                        <div className="text-xs text-muted-foreground mt-1">
                          {alert.expiryDate && new Date(alert.expiryDate).toLocaleDateString('he-IL')}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Warning Items */}
            {warningAlerts.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-5 w-5" />
                    אזהרות ({warningAlerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {warningAlerts.map(alert => (
                    <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${alert.type === 'vehicle' ? 'bg-primary/10' : 'bg-accent/10'}`}>
                          {alert.type === 'vehicle' ? (
                            <Car className="h-5 w-5 text-primary" />
                          ) : (
                            <User className="h-5 w-5 text-accent" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{alert.name}</div>
                          <div className="text-sm text-muted-foreground">{alert.alertType}</div>
                        </div>
                      </div>
                      <div className="text-left">
                        <StatusBadge status={alert.status} />
                        <div className="text-xs text-muted-foreground mt-1">
                          {alert.expiryDate && new Date(alert.expiryDate).toLocaleDateString('he-IL')}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
