import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ClipboardList, ArrowRight, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

export default function AdminDashboard() {
  const [supplierCount, setSupplierCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ count: sCount }, { count: pCount }] = await Promise.all([
        supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('role', 'supplier'),
        supabase.from('supplier_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      setSupplierCount(sCount ?? 0);
      setPendingCount(pCount ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Emboss Marketing — Admin Panel">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Suppliers</CardTitle>
                <Users className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{supplierCount}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Registrations</CardTitle>
                <ClipboardList className="h-5 w-5 text-warning" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{pendingCount}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link to="/admin/suppliers">
              <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50">
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <h3 className="text-lg font-semibold">Manage Suppliers</h3>
                    <p className="text-sm text-muted-foreground">View & edit supplier details</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/registrations">
              <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50">
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <h3 className="text-lg font-semibold">Review Registrations</h3>
                    <p className="text-sm text-muted-foreground">Approve or reject pending applications</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
