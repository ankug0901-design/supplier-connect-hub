import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PurchaseOrders from "./pages/PurchaseOrders";
import PODetail from "./pages/PODetail";
import Invoices from "./pages/Invoices";
import InvoiceUpload from "./pages/InvoiceUpload";
import Payments from "./pages/Payments";
import DeliveryChallan from "./pages/DeliveryChallan";
import Shipments from "./pages/Shipments";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminSuppliers from "./pages/admin/AdminSuppliers";
import AdminRegistrations from "./pages/admin/AdminRegistrations";
import AdminRfq from "./pages/admin/AdminRfq";
import AdminAiInsights from "./pages/admin/AdminAiInsights";
import AdminThreeWayMatch from "./pages/admin/AdminThreeWayMatch";
import AdminPagePermissions from "./pages/admin/AdminPagePermissions";
import AdminUserRoles from "./pages/admin/AdminUserRoles";
import RfqRequests from "./pages/RfqRequests";
import ResetPassword from "./pages/ResetPassword";
import { SupplierSectionGuard } from "./components/SupplierSectionGuard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function DashboardRedirect() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Navigate to="/admin" replace /> : <Dashboard />;
}

function AppRoutes() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          isLoading ? (
            <div className="flex h-screen items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : isAuthenticated ? (
            <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />
          ) : (
            <Login />
          )
        }
      />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />
      <Route path="/rfq-requests" element={<ProtectedRoute><SupplierSectionGuard sectionKey="rfq-requests"><RfqRequests /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/purchase-orders" element={<ProtectedRoute><SupplierSectionGuard sectionKey="purchase-orders"><PurchaseOrders /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/purchase-orders/:id" element={<ProtectedRoute><SupplierSectionGuard sectionKey="purchase-orders"><PODetail /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute><SupplierSectionGuard sectionKey="invoices"><Invoices /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/invoices/upload" element={<ProtectedRoute><SupplierSectionGuard sectionKey="invoices"><InvoiceUpload /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><SupplierSectionGuard sectionKey="payments"><Payments /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/delivery-challan" element={<ProtectedRoute><SupplierSectionGuard sectionKey="delivery-challan"><DeliveryChallan /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/shipments" element={<ProtectedRoute><SupplierSectionGuard sectionKey="shipments"><Shipments /></SupplierSectionGuard></ProtectedRoute>} />
      <Route path="/awb" element={<Navigate to="/shipments" replace />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/suppliers" element={<AdminRoute><AdminSuppliers /></AdminRoute>} />
      <Route path="/admin/registrations" element={<AdminRoute><AdminRegistrations /></AdminRoute>} />
      <Route path="/admin/rfq" element={<AdminRoute><AdminRfq /></AdminRoute>} />
      <Route path="/admin/ai-insights" element={<AdminRoute><AdminAiInsights /></AdminRoute>} />
      <Route path="/admin/three-way-match" element={<AdminRoute><AdminThreeWayMatch /></AdminRoute>} />
      <Route path="/admin/page-permissions" element={<AdminRoute><AdminPagePermissions /></AdminRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
