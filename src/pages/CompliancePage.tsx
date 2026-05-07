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
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';

function complianceAlertAdminHref(alert: ComplianceItem, canAccessAdminCenter: boolean): string | null {
  if (!canAccessAdminCenter) return null;
  const entityId = alert.entityId?.trim();
  if (!entityId) return null;
  return complianceAdminDeepLink({
    id: alert.id,
    type: alert.type,
    entityId,
    alertType: alert.alertType,
  });
}

/** מנהל: לחיצה → מרכז ציות + הדגשת שורה. שאר המשתמשים: אותו מראה ללא ניווט. */
function ExpiredAlertRow({ alert, children }: { alert: ComplianceItem; children: ReactNode }) {
  const { isAdmin, profile, user, hasPermission } = useAuth();
  const canAccessAdminCenter = Boolean(
    hasPermission('compliance') ||
      hasPermission('admin_access') ||
      isAdmin ||
      profile?.is_system_admin === true ||
      isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user)) ||
      isFleetOrgAdminFallbackEmail(resolveSessionEmail(profile, user)),
  );
  const href = complianceAlertAdminHref(alert, canAccessAdminCenter);
  const shell =
    'flex w-full items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-inherit no-underline';
  if (href) {
    return (
      <Link
        to={href}
        className={`${shell} cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
      >
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

  const expiredAlerts = alerts?.filter((a) => a.status === 'expired') || [];

  return (
    <FleetHudPageShell
      title="מרכז ציות ותקינות"
      subtitle="מרכז ציות — מעקב, ספים והודעות לעובדים; למטה סיכום המצב הגולמי."
    >
      <div className="mx-auto max-w-6xl pb-8">
        <ComplianceTower />
      </div>
      <section className="dashboard-status-stage dashboard-cyber-stage mx-auto max-w-5xl space-y-6 rounded-3xl border border-cyan-400/25 p-4 text-white sm:p-6">
        {/* סיכום — רק פג תוקף (כמו הרשימה למטה) */}
        <div className="grid grid-cols-1 gap-4">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-destructive">{expiredAlerts.length}</div>
              <div className="text-sm text-muted-foreground">פג תוקף</div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : expiredAlerts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
              <h2 className="text-xl font-semibold mb-2">הכל תקין!</h2>
              <p className="text-muted-foreground">אין פריטים שפג תוקף כרגע</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                פג תוקף ({expiredAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {expiredAlerts.map((alert) => (
                <ExpiredAlertRow key={alert.id} alert={alert}>
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
                </ExpiredAlertRow>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </FleetHudPageShell>
  );
}
