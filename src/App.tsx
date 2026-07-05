import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Admin landing order — first allowed section is used as the redirect target.
const ADMIN_LANDING_ORDER = [
  "admin-dashboard",
  "admin-rfq",
  "admin-suppliers",
  "admin-registrations",
  "admin-three-way-match",
  "admin-vendor-scores",
  "admin-ai-insights",
  "admin-exception-requests",
] as const;
const ADMIN_PATH: Record<string, string> = {
  "admin-dashboard": "/admin",
  "admin-rfq": "/admin/rfq",
  "admin-suppliers": "/admin/suppliers",
  "admin-registrations": "/admin/registrations",
  "admin-three-way-match": "/admin/three-way-match",
  "admin-vendor-scores": "/admin/vendor-scores",
  "admin-ai-insights": "/admin/ai-insights",
  "admin-exception-requests": "/admin/exception-requests",
};

function AdminLanding() {
  const { isSuperAdmin, role, effectiveUserId } = useAuth();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) { setTarget("/admin"); return; }
    if (!role || !effectiveUserId) return;
    let cancelled = false;
    (async () => {
      const [{ data: overrides }, { data: roleAccess }] = await Promise.all([
        supabase.from("supplier_section_access").select("section_key, enabled").eq("user_id", effectiveUserId),
        supabase.from("role_section_access").select("section_key, enabled").eq("role", role),
      ]);
      if (cancelled) return;
      const ovMap = new Map((overrides || []).map((r: any) => [r.section_key, r.enabled]));
      const roleMap = new Map((roleAccess || []).map((r: any) => [r.section_key, r.enabled]));
      const first = ADMIN_LANDING_ORDER.find((k) => {
        if (ovMap.has(k)) return ovMap.get(k) === true;
        return roleMap.has(k) ? roleMap.get(k) === true : false;
      });
      setTarget(first ? ADMIN_PATH[first] : "/admin");
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin, role, effectiveUserId]);

  if (!target) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }
  if (target === "/admin") {
    return <SupplierSectionGuard sectionKey="admin-dashboard"><AdminDashboard /></SupplierSectionGuard>;
  }
  return <Navigate to={target} replace />;
}
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
import AdminVendorScores from "./pages/admin/AdminVendorScores";
import AdminThreeWayMatch from "./pages/admin/AdminThreeWayMatch";
import AdminPagePermissions from "./pages/admin/AdminPagePermissions";
import AdminUserRoles from "./pages/admin/AdminUserRoles";
import AdminUserAccessReport from "./pages/admin/AdminUserAccessReport";
import AdminExceptionRequests from "./pages/admin/AdminExceptionRequests";
import RfqRequests from "./pages/RfqRequests";
import ResetPassword from "./pages/ResetPassword";
import { SupplierSectionGuard } from "./components/SupplierSectionGuard";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";

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

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isSuperAdmin, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;
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
      <Route path="/admin" element={<AdminRoute><AdminLanding /></AdminRoute>} />
      <Route path="/admin/suppliers" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-suppliers"><AdminSuppliers /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/admin/registrations" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-registrations"><AdminRegistrations /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/admin/rfq" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-rfq"><AdminRfq /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/admin/ai-insights" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-ai-insights"><AdminAiInsights /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/admin/vendor-scores" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-vendor-scores"><AdminVendorScores /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/admin/three-way-match" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-three-way-match"><AdminThreeWayMatch /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/admin/user-roles" element={<SuperAdminRoute><AdminUserRoles /></SuperAdminRoute>} />
      <Route path="/admin/page-permissions" element={<SuperAdminRoute><AdminPagePermissions /></SuperAdminRoute>} />
      <Route path="/admin/user-access-report" element={<SuperAdminRoute><AdminUserAccessReport /></SuperAdminRoute>} />
      <Route path="/admin/exception-requests" element={<AdminRoute><SupplierSectionGuard sectionKey="admin-exception-requests"><AdminExceptionRequests /></SupplierSectionGuard></AdminRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
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
