import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { exportToCsv } from '@/lib/exportCsv';
import { useToast } from '@/hooks/use-toast';

type Supplier = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  company: string;
  role: string;
};

type RoleAccess = {
  role: string;
  section_key: string;
  enabled: boolean;
};

type UserOverride = {
  user_id: string;
  section_key: string;
  enabled: boolean;
};

type ReportRow = {
  name: string;
  email: string;
  company: string;
  role: string;
  section_key: string;
  effective_access: string;
};

const ALL_SECTION_KEYS = [
  'dashboard',
  'rfq-requests',
  'purchase-orders',
  'invoices',
  'payments',
  'delivery-challan',
  'shipments',
  'admin-dashboard',
  'admin-suppliers',
  'admin-registrations',
  'admin-rfq',
  'admin-three-way-match',
  'admin-ai-insights',
  'admin-vendor-scores',
];

const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'rfq-requests': 'RFQ Requests',
  'purchase-orders': 'Purchase Orders',
  invoices: 'Invoices',
  payments: 'Payments',
  'delivery-challan': 'Delivery Challan',
  shipments: 'Shipments',
  'admin-dashboard': 'Admin Dashboard',
  'admin-suppliers': 'All Suppliers',
  'admin-registrations': 'Registrations',
  'admin-rfq': 'RFQ Management',
  'admin-three-way-match': '3-Way Matching',
  'admin-ai-insights': 'AI Insights',
  'admin-vendor-scores': 'Supplier Performance',
};

export default function AdminUserAccessReport() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [roleAccess, setRoleAccess] = useState<RoleAccess[]>([]);
  const [userOverrides, setUserOverrides] = useState<UserOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: sData, error: sError }, { data: rData }, { data: uData }] = await Promise.all([
      supabase.from('suppliers').select('id, user_id, name, email, company, role').order('created_at', { ascending: false }),
      supabase.from('role_section_access').select('role, section_key, enabled'),
      supabase.from('supplier_section_access').select('user_id, section_key, enabled'),
    ]);
    if (sError) {
      toast({ title: 'Failed to load data', description: sError.message, variant: 'destructive' });
    }
    setSuppliers((sData || []) as Supplier[]);
    setRoleAccess((rData || []) as RoleAccess[]);
    setUserOverrides((uData || []) as UserOverride[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const reportRows: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [];
    for (const s of suppliers) {
      const isAdminRole = s.role === 'admin';
      for (const section of ALL_SECTION_KEYS) {
        let effective: string;
        if (isAdminRole && section.startsWith('admin-')) {
          effective = 'Admin bypass';
        } else if (s.user_id) {
          const override = userOverrides.find((u) => u.user_id === s.user_id && u.section_key === section);
          if (override) {
            effective = override.enabled ? 'User override: Allow' : 'User override: Block';
          } else {
            const roleRow = roleAccess.find((r) => r.role === s.role && r.section_key === section);
            effective = roleRow ? (roleRow.enabled ? 'Role: Allow' : 'Role: Block') : 'Default: Allow';
          }
        } else {
          const roleRow = roleAccess.find((r) => r.role === s.role && r.section_key === section);
          effective = roleRow ? (roleRow.enabled ? 'Role: Allow' : 'Role: Block') : 'Default: Allow';
        }
        rows.push({
          name: s.name || '—',
          email: s.email,
          company: s.company || '—',
          role: s.role,
          section_key: SECTION_LABELS[section] || section,
          effective_access: effective,
        });
      }
    }
    return rows;
  }, [suppliers, roleAccess, userOverrides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reportRows;
    return reportRows.filter((r) =>
      [r.name, r.email, r.company, r.role, r.section_key, r.effective_access].some((v) =>
        (v || '').toLowerCase().includes(q)
      )
    );
  }, [reportRows, search]);

  const handleDownload = () => {
    try {
      exportToCsv('user_access_report.csv', filtered, [
        { key: 'name', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'company', header: 'Company' },
        { key: 'role', header: 'Role' },
        { key: 'section_key', header: 'Section' },
        { key: 'effective_access', header: 'Effective Access' },
      ]);
      toast({ title: 'Report downloaded', description: `${filtered.length} rows exported.` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  const accessBadge = (text: string) => {
    if (text.includes('Allow')) return <Badge variant="default" className="bg-emerald-600">Allow</Badge>;
    if (text.includes('Block')) return <Badge variant="destructive">Block</Badge>;
    return <Badge variant="secondary">{text}</Badge>;
  };

  return (
    <DashboardLayout
      title="User Access Report"
      subtitle="Effective section access for every user after role and per-user overrides"
      actions={
        <Button onClick={handleDownload} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Download CSV
        </Button>
      }
    >
      <div className="mb-6 space-y-2">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, section, access…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Effective Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No results found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-sm">{row.email}</TableCell>
                      <TableCell className="text-sm">{row.company}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.role}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.section_key}</TableCell>
                      <TableCell>{accessBadge(row.effective_access)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
