import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import AuthPage from "./pages/AuthPage";
import { ThemeProvider } from '@/hooks/useTheme';
import { ViewAsProvider } from '@/contexts/ViewAsContext';
import Footer from "@/components/layout/Footer";
import { VehicleSpecDirtyProvider } from "@/contexts/VehicleSpecDirtyContext";
import { PermissionGuard } from "@/components/PermissionGuard";
import {
  purgeAllClientStorageThisOrigin,
  FLEET_MANAGER_PRO_ORIGIN,
} from "@/lib/testDeployUpdate";
import { UpdateModal } from "@/components/UpdateModal";

const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const VehicleListPage = lazy(() => import("./pages/VehicleListPage"));
const AddVehiclePage = lazy(() => import("./pages/AddVehiclePage"));
const VehicleDetailPage = lazy(() => import("./pages/VehicleDetailPage"));
const DriverListPage = lazy(() => import("./pages/DriverListPage"));
const AddDriverPage = lazy(() => import("./pages/AddDriverPage"));
const DriverDetailPage = lazy(() => import("./pages/DriverDetailPage"));
const EditDriverPage = lazy(() => import("./pages/EditDriverPage"));
const DriverSectionEditPage = lazy(() => import("./pages/DriverSectionEditPage"));
const EditVehiclePage = lazy(() => import("./pages/EditVehiclePage"));
const CompliancePage = lazy(() => import("./pages/CompliancePage"));
const Procedure6ComplaintsPage = lazy(() => import("./pages/Procedure6ComplaintsPage"));
const AddMaintenancePage = lazy(() => import("./pages/AddMaintenancePage"));
const UpdateOdometerPage = lazy(() => import("./pages/UpdateOdometerPage"));
const VehicleDeliveryPage = lazy(() => import("./pages/VehicleDeliveryPage"));
const VehicleReturnPage = lazy(() => import("./pages/VehicleReturnPage"));
const ReplacementVehicleHubPage = lazy(() => import("./pages/ReplacementVehicleHubPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
import AdminCompliancePageEager from "./pages/AdminCompliancePage";
const AdminCompliancePageLazy = lazy(() => import("./pages/AdminCompliancePage"));
const AdminCompliancePage = import.meta.env.DEV ? AdminCompliancePageEager : AdminCompliancePageLazy;
const OrgSettingsPage = lazy(() => import("./pages/OrgSettingsPage"));
const TeamManagementPage = lazy(() => import("./pages/TeamManagementPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ScanReportPage = lazy(() => import("./pages/ScanReportPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const FormsPage = lazy(() => import("./pages/FormsPage"));
const EmployeeComplianceFormPage = lazy(() => import("./pages/employee/EmployeeComplianceFormPage"));
const UpdateComplianceRequestPage = lazy(() => import("./pages/UpdateComplianceRequestPage"));
const VehicleExternalRenewalPage = lazy(() => import("./pages/VehicleExternalRenewalPage"));
const VehicleHandoverWizard = lazy(() => import('./pages/VehicleHandoverWizard'));
const TransfersPage = lazy(() => import('./pages/TransfersPage'));
const ReportMileagePage = lazy(() => import("./pages/ReportMileagePage"));
const ServiceUpdatePage = lazy(() => import("./pages/ServiceUpdatePage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** 400 חוזר על שאילתות = עומס רשת וקיטועים; hooks יכולים לדרוס ל־retry ספציפי */
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

/** טעינת צ'אנק לפני mount — נפרד מ־Suspense בתוך AppLayout (דפים מחוץ למעטפת מוגנת). */
function AppShellFallback() {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 bg-[#060d18] px-6 text-sm text-white/80">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/25 border-t-cyan-300"
        aria-hidden
      />
      <span>טוען…</span>
    </div>
  );
}

/** נטען בדומיין הטסט: מנקה מטמון/SW/localStorage ומחזיר למקור (pro.com) */
function ForceUpdateProHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'force_update_pro') return;

    (async () => {
      try {
        await purgeAllClientStorageThisOrigin();
      } finally {
        window.location.replace(`${FLEET_MANAGER_PRO_ORIGIN}/`);
      }
    })();
  }, []);

  return null;
}

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

function AuthRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  /**
   * נחיתה מהזמנה: ?org_id=... — אסור לקפוץ ל-`/`, אחרת המוזמן רואה את האפליקציה
   * עם סשן ישן/של מזמין באותו דפדפן. AuthPage עצמו מוודא Sign-out לכל סשן קיים.
   */
  const search =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isInviteLanding = Boolean((search?.get('org_id') ?? '').trim());

  if (user && !isInviteLanding) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <Routes>
        <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vehicles" element={<PermissionGuard permission="vehicles"><VehicleListPage /></PermissionGuard>} />
          <Route path="/vehicles/add" element={<PermissionGuard permission="vehicles"><AddVehiclePage /></PermissionGuard>} />
          <Route path="/vehicles/odometer" element={<PermissionGuard permission="vehicles"><UpdateOdometerPage /></PermissionGuard>} />
          <Route path="/vehicles/service-update" element={<PermissionGuard permission="vehicles"><ServiceUpdatePage /></PermissionGuard>} />
          <Route path="/vehicles/:id" element={<PermissionGuard permission="vehicles"><VehicleDetailPage /></PermissionGuard>} />
          <Route path="/vehicles/:id/edit" element={<PermissionGuard permission="vehicles"><EditVehiclePage /></PermissionGuard>} />
          <Route path="/drivers" element={<PermissionGuard permission="drivers"><DriverListPage /></PermissionGuard>} />
          <Route path="/drivers/add" element={<PermissionGuard permission="drivers"><AddDriverPage /></PermissionGuard>} />
          <Route path="/drivers/:id/section/:sectionId" element={<PermissionGuard permission="drivers"><DriverSectionEditPage /></PermissionGuard>} />
          <Route path="/drivers/:id/edit" element={<PermissionGuard permission="drivers"><EditDriverPage /></PermissionGuard>} />
          <Route path="/drivers/:id" element={<PermissionGuard permission="drivers"><DriverDetailPage /></PermissionGuard>} />
          <Route path="/compliance" element={<PermissionGuard permission="compliance"><CompliancePage /></PermissionGuard>} />
          <Route path="/procedure6-complaints" element={<PermissionGuard permission="compliance"><Procedure6ComplaintsPage /></PermissionGuard>} />
          <Route path="/maintenance/add" element={<PermissionGuard permission="maintenance"><AddMaintenancePage /></PermissionGuard>} />
          <Route path="/vehicles/transfers" element={<PermissionGuard permission="handover"><TransfersPage /></PermissionGuard>} />
          <Route path="/handover/delivery" element={<PermissionGuard permission="vehicle_delivery"><VehicleDeliveryPage /></PermissionGuard>} />
          <Route path="/handover/return" element={<PermissionGuard permission="handover"><VehicleReturnPage /></PermissionGuard>} />
          <Route path="/handover/replacement" element={<PermissionGuard permission="replacement_car"><ReplacementVehicleHubPage /></PermissionGuard>} />
          <Route path="/handover/wizard" element={<PermissionGuard permission="handover"><VehicleHandoverWizard /></PermissionGuard>} />
          <Route path="/report-mileage" element={<PermissionGuard permission="report_mileage"><ReportMileagePage /></PermissionGuard>} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin-settings" element={<AdminSettingsPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/compliance" element={<AdminCompliancePage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/org-settings" element={<OrgSettingsPage />} />
          <Route path="/team" element={<TeamManagementPage />} />
          <Route path="/reports" element={<PermissionGuard permission="reports"><ReportsPage /></PermissionGuard>} />
          <Route path="/reports/scan" element={<PermissionGuard permission="reports"><ScanReportPage /></PermissionGuard>} />
          <Route path="/forms" element={<PermissionGuard permission="forms"><FormsPage /></PermissionGuard>} />
        </Route>
        <Route path="/employee/forms/:token" element={<EmployeeComplianceFormPage />} />
        <Route path="/update/:token" element={<UpdateComplianceRequestPage />} />
        <Route path="/vehicle-renewal/:token" element={<VehicleExternalRenewalPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ForceUpdateProHandler />
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ViewAsProvider>
            {/* מופע יחיד — כדי ש-getLastPath ישרוד מעבר בין Routes (אחרת כל ProtectedRoute מאפס את lastPathRef). */}
            <VehicleSpecDirtyProvider>
              <AppErrorBoundary>
                <div className="flex min-h-screen flex-col">
                  <div className="flex-1">
                    <AppRoutes />
                  </div>
                  <UpdateModal />
                  <Footer />
                </div>
              </AppErrorBoundary>
            </VehicleSpecDirtyProvider>
          </ViewAsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
