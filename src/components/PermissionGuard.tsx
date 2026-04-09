import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { accessAllowedByPermissionGuard } from '@/lib/allowedFeatures';
import { isFleetBootstrapOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import type { PermissionKey } from '@/lib/permissions';
import { Button } from '@/components/ui/button';

interface PermissionGuardProps {
  permission: PermissionKey;
  children: ReactNode;
}

function AccessDeniedNotice() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold text-white">אין הרשאת גישה</h1>
      <p className="text-sm leading-relaxed text-white/70">
        לחשבון או לפרופיל הנבחר אין הרשאה למסך הזה. אם נדרשת גישה (למשל «עריכת פרטי צי»
        בפרופיל המשתמש), פני למנהל המערכת.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          חזרה
        </Button>
        <Button type="button" asChild variant="default">
          <Link to="/">לוח בקרה</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * שער מסלול: תפקידים והרשאות (hasPermission) + allowed_features לנהגים/תתי־משתמשים.
 * מנהלי צי / אדמין / בעלים מזוהים — דילוג על allowed_features. ללא מערך תקין או ריק — כמו null.
 * סופר־אדמין — תמיד מורשה.
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { profile, user, hasPermission, isAdmin, isManager } = useAuth();
  const sessionEmail = resolveSessionEmail(profile, user);
  const bypassAllowedFeaturesSlice =
    isAdmin ||
    isManager ||
    profile?.is_system_admin === true ||
    isFleetBootstrapOwnerEmail(sessionEmail);

  if (
    accessAllowedByPermissionGuard(profile, permission, hasPermission, {
      bypassAllowedFeaturesSlice,
    })
  ) {
    return <>{children}</>;
  }

  return <AccessDeniedNotice />;
}
