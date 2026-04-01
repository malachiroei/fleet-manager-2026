import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Dashboard from "./pages/Dashboard";
import VehicleListPage from "./pages/VehicleListPage";
import AddVehiclePage from "./pages/AddVehiclePage";
import VehicleDetailPage from "./pages/VehicleDetailPage";
import DriverListPage from "./pages/DriverListPage";
import AddDriverPage from "./pages/AddDriverPage";
import DriverDetailPage from "./pages/DriverDetailPage";
import EditDriverPage from "./pages/EditDriverPage";
import DriverSectionEditPage from "./pages/DriverSectionEditPage";
import EditVehiclePage from "./pages/EditVehiclePage";
import CompliancePage from "./pages/CompliancePage";
import Procedure6ComplaintsPage from "./pages/Procedure6ComplaintsPage";
import AddMaintenancePage from "./pages/AddMaintenancePage";
import UpdateOdometerPage from "./pages/UpdateOdometerPage";
import VehicleDeliveryPage from "./pages/VehicleDeliveryPage";
import VehicleReturnPage from "./pages/VehicleReturnPage";
import ReplacementVehicleHubPage from "./pages/ReplacementVehicleHubPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import OrgSettingsPage from "./pages/OrgSettingsPage";
import TeamManagementPage from "./pages/TeamManagementPage";
import NotFound from "./pages/NotFound";
import ScanReportPage from "./pages/ScanReportPage";
import ReportsPage from "./pages/ReportsPage";
import FormsPage from "./pages/FormsPage";
import VehicleHandoverWizard from './pages/VehicleHandoverWizard';
import TransfersPage from './pages/TransfersPage';
import ReportMileagePage from "./pages/ReportMileagePage";
import ServiceUpdatePage from "./pages/ServiceUpdatePage";
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
const queryClient = new QueryClient();

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

function ProtectedRoute({ children }: { children: ReactNode }) {
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
    <VehicleSpecDirtyProvider>
      <AppLayout>{children}</AppLayout>
    </VehicleSpecDirtyProvider>
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

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/vehicles" element={<ProtectedRoute><PermissionGuard permission="vehicles"><VehicleListPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/vehicles/add" element={<ProtectedRoute><PermissionGuard permission="vehicles"><AddVehiclePage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/vehicles/odometer" element={<ProtectedRoute><PermissionGuard permission="vehicles"><UpdateOdometerPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/vehicles/service-update" element={<ProtectedRoute><PermissionGuard permission="vehicles"><ServiceUpdatePage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/vehicles/:id" element={<ProtectedRoute><PermissionGuard permission="vehicles"><VehicleDetailPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/vehicles/:id/edit" element={<ProtectedRoute><PermissionGuard permission="vehicles"><EditVehiclePage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/drivers" element={<ProtectedRoute><PermissionGuard permission="drivers"><DriverListPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/drivers/add" element={<ProtectedRoute><PermissionGuard permission="drivers"><AddDriverPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/drivers/:id/section/:sectionId" element={<ProtectedRoute><PermissionGuard permission="drivers"><DriverSectionEditPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/drivers/:id" element={<ProtectedRoute><PermissionGuard permission="drivers"><DriverDetailPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/drivers/:id/edit" element={<ProtectedRoute><PermissionGuard permission="drivers"><EditDriverPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/compliance" element={<ProtectedRoute><PermissionGuard permission="compliance"><CompliancePage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/procedure6-complaints" element={<ProtectedRoute><PermissionGuard permission="compliance"><Procedure6ComplaintsPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/maintenance/add" element={<ProtectedRoute><PermissionGuard permission="maintenance"><AddMaintenancePage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/vehicles/transfers" element={<ProtectedRoute><PermissionGuard permission="handover"><TransfersPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/handover/delivery" element={<ProtectedRoute><PermissionGuard permission="vehicle_delivery"><VehicleDeliveryPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/handover/return" element={<ProtectedRoute><PermissionGuard permission="handover"><VehicleReturnPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/handover/replacement" element={<ProtectedRoute><PermissionGuard permission="replacement_car"><ReplacementVehicleHubPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/handover/wizard" element={<ProtectedRoute><PermissionGuard permission="handover"><VehicleHandoverWizard /></PermissionGuard></ProtectedRoute>} />
      <Route path="/report-mileage" element={<ProtectedRoute><PermissionGuard permission="report_mileage"><ReportMileagePage /></PermissionGuard></ProtectedRoute>} />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute>
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center bg-[#020617] text-sm text-white/70">
                  טוען הגדרות…
                </div>
              }
            >
              <AdminSettingsPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-settings"
        element={
          <ProtectedRoute>
            <AdminSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
      <Route path="/admin/org-settings" element={<ProtectedRoute><OrgSettingsPage /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><TeamManagementPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><PermissionGuard permission="reports"><ReportsPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/reports/scan" element={<ProtectedRoute><PermissionGuard permission="reports"><ScanReportPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="/forms" element={<ProtectedRoute><PermissionGuard permission="forms"><FormsPage /></PermissionGuard></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
            <AppErrorBoundary>
              <div className="flex min-h-screen flex-col">
                <div className="flex-1">
                  <AppRoutes />
                </div>
                <UpdateModal />
                <Footer />
              </div>
            </AppErrorBoundary>
          </ViewAsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
