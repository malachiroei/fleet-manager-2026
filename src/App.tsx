import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import VehicleListPage from "./pages/VehicleListPage";
import AddVehiclePage from "./pages/AddVehiclePage";
import VehicleDetailPage from "./pages/VehicleDetailPage";
import DriverListPage from "./pages/DriverListPage";
import AddDriverPage from "./pages/AddDriverPage";
import DriverDetailPage from "./pages/DriverDetailPage";
import EditDriverPage from "./pages/EditDriverPage";
import EditVehiclePage from "./pages/EditVehiclePage";
import CompliancePage from "./pages/CompliancePage";
import Procedure6ComplaintsPage from "./pages/Procedure6ComplaintsPage";
import AddMaintenancePage from "./pages/AddMaintenancePage";
import UpdateOdometerPage from "./pages/UpdateOdometerPage";
import VehicleDeliveryPage from "./pages/VehicleDeliveryPage";
import VehicleReturnPage from "./pages/VehicleReturnPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import NotFound from "./pages/NotFound";
import ScanReportPage from "./pages/ScanReportPage";
import ReportsPage from "./pages/ReportsPage";
import VehicleHandoverWizard from './pages/VehicleHandoverWizard';
import { ThemeProvider } from '@/hooks/useTheme';
const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
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
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/vehicles" element={<ProtectedRoute><VehicleListPage /></ProtectedRoute>} />
      <Route path="/vehicles/add" element={<ProtectedRoute><AddVehiclePage /></ProtectedRoute>} />
      <Route path="/vehicles/odometer" element={<ProtectedRoute><UpdateOdometerPage /></ProtectedRoute>} />
      <Route path="/vehicles/:id" element={<ProtectedRoute><VehicleDetailPage /></ProtectedRoute>} />
      <Route path="/drivers" element={<ProtectedRoute><DriverListPage /></ProtectedRoute>} />
      <Route path="/drivers/add" element={<ProtectedRoute><AddDriverPage /></ProtectedRoute>} />
      <Route path="/drivers/:id" element={<ProtectedRoute><DriverDetailPage /></ProtectedRoute>} />
      <Route path="/drivers/:id/edit" element={<ProtectedRoute><EditDriverPage /></ProtectedRoute>} />
      <Route path="/vehicles/:id/edit" element={<ProtectedRoute><EditVehiclePage /></ProtectedRoute>} />
      <Route path="/compliance" element={<ProtectedRoute><CompliancePage /></ProtectedRoute>} />
      <Route path="/procedure6-complaints" element={<ProtectedRoute><Procedure6ComplaintsPage /></ProtectedRoute>} />
      <Route path="/maintenance/add" element={<ProtectedRoute><AddMaintenancePage /></ProtectedRoute>} />
      <Route path="/handover/delivery" element={<ProtectedRoute><VehicleDeliveryPage /></ProtectedRoute>} />
      <Route path="/handover/return" element={<ProtectedRoute><VehicleReturnPage /></ProtectedRoute>} />
      <Route path="/handover/wizard" element={<ProtectedRoute><VehicleHandoverWizard /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute><AdminSettingsPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/reports/scan" element={<ProtectedRoute><ScanReportPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppErrorBoundary>
            <AppRoutes />
          </AppErrorBoundary>
          
          {/* האינדיקטור לגרסת הטסט - מוצג רק בדומיין טסט או localhost */}
          {(window.location.hostname === 'manager-2026-test.vercel.app' || window.location.hostname === 'localhost') && (
            <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm font-bold z-[99999] shadow-[0_-2px_10px_rgba(0,0,0,0.3)] tracking-widest">
              גרסה זו היא גרסת טסט (TEST-BRANCH) - נא לא להסתמך על הנתונים
            </div>
          )}
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
