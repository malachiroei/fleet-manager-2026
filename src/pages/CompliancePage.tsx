import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useComplianceAlerts, type ComplianceItem } from '@/hooks/useDashboard';
import { useAuth } from '@/hooks/useAuth';
import { complianceAdminDeepLink } from '@/lib/complianceAdminDeepLink';
import { ComplianceTower } from '@/components/compliance/ComplianceTower';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Car, User, CheckCircle } from 'lucide-react';
import type { ComplianceStatus } from '@/types/fleet';

function complianceAlertAdminHref(alert: ComplianceItem, isAdmin: boolean): string | null {
  if (!isAdmin) return null;
  const entityId = alert.entityId?.trim();
  if (!entityId) return null;
  return complianceAdminDeepLink({
    id: alert.id,
    type: alert.type,
    entityId,
    alertType: alert.alertType,
  });
}

function AlertListRow({
  alert,
  variant,
  children,
}: {
  alert: ComplianceItem;
  variant: 'expired' | 'warning';
  children: ReactNode;
}) {
  const { isAdmin } = useAuth();
  const href = complianceAlertAdminHref(alert, Boolean(isAdmin));
  const shell =
    variant === 'expired'
      ? 'flex w-full items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20'
      : 'flex w-full items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20';
  const interactive =
    variant === 'expired'
      ? 'cursor-pointer transition-colors hover:bg-destructive/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60'
      : 'cursor-pointer transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
  if (href) {
    return (
      <Link to={href} className={`${shell} ${interactive}`}>
        {children}
      </Link>
    );
  }
  return <div className={shell}>{children}</div>;
}

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
    <FleetHudPageShell
      title="מרכז ציות ותקינות"
      subtitle="מגדל ציות — מעקב, ספים והודעות לעובדים; למטה סיכום המצב הגולמי."
    >
      <div className="mx-auto max-w-6xl pb-8">
        <ComplianceTower />
      </div>
      <section className="dashboard-status-stage dashboard-cyber-stage mx-auto max-w-5xl space-y-6 rounded-3xl border border-cyan-400/25 p-4 text-white sm:p-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  {expiredAlerts.map((alert) => (
                    <AlertListRow key={alert.id} alert={alert} variant="expired">
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
                    </AlertListRow>
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
                  {warningAlerts.map((alert) => (
                    <AlertListRow key={alert.id} alert={alert} variant="warning">
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
                    </AlertListRow>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>
    </FleetHudPageShell>
  );
}
