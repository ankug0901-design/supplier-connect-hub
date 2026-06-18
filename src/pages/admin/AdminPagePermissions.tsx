import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Section = { key: string; label: string; description: string };

const ADMIN_SECTIONS: Section[] = [
  { key: 'admin-dashboard', label: 'Admin Dashboard', description: 'KPI overview' },
  { key: 'admin-suppliers', label: 'All Suppliers', description: 'View and manage suppliers' },
  { key: 'admin-registrations', label: 'Registrations', description: 'Approve new supplier registrations' },
  { key: 'admin-rfq', label: 'RFQ Management', description: 'Create and manage RFQs' },
  { key: 'admin-three-way-match', label: '3-Way Matching', description: 'PO / Invoice / Payment reconciliation' },
  { key: 'admin-ai-insights', label: 'AI Insights', description: 'AI-generated recommendations & nudges' },
  { key: 'admin-vendor-scores', label: 'Supplier Performance', description: 'Vendor scorecards' },
];

const SUPPLIER_SECTIONS: Section[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Supplier home with stats & quick actions' },
  { key: 'rfq-requests', label: 'RFQ Requests', description: 'Quote requests sent to the supplier' },
  { key: 'purchase-orders', label: 'Purchase Orders', description: 'PO list and PO details' },
  { key: 'invoices', label: 'Invoices', description: 'Invoice list and upload' },
  { key: 'payments', label: 'Payments', description: 'Payments received against invoices' },
  { key: 'delivery-challan', label: 'Delivery Challan', description: 'Create & view delivery challans' },
  { key: 'shipments', label: 'Shipments', description: 'AWB tracking & shipment status' },
];

type AppRole = { role: string; label: string; is_system: boolean };

export default function AdminPagePermissions() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRole] = useState<string>('supplier');
  // access: role -> sectionKey -> enabled
  const [access, setAccess] = useState<Record<string, Record<string, boolean>>>({});
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [{ data: rolesData, error: rolesErr }, { data: accessData, error: accessErr }] = await Promise.all([
      supabase.from('app_roles').select('role, label, is_system').order('is_system', { ascending: false }).order('label'),
      supabase.from('role_section_access').select('role, section_key, enabled'),
    ]);
    if (rolesErr || accessErr) {
      toast({ title: 'Failed to load', description: rolesErr?.message || accessErr?.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setRoles((rolesData || []) as AppRole[]);
    const map: Record<string, Record<string, boolean>> = {};
    (accessData || []).forEach((r: any) => {
      map[r.role] = map[r.role] || {};
      map[r.role][r.section_key] = r.enabled;
    });
    setAccess(map);
    if (rolesData && rolesData.length && !rolesData.find((r: any) => r.role === activeRole)) {
      setActiveRole((rolesData as AppRole[])[0].role);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (role: string, key: string, next: boolean) => {
    const sid = `${role}:${key}`;
    setSaving(sid);
    setAccess((p) => ({ ...p, [role]: { ...(p[role] || {}), [key]: next } }));
    const { error } = await supabase
      .from('role_section_access')
      .upsert({ role, section_key: key, enabled: next }, { onConflict: 'role,section_key' });
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      setAccess((p) => ({ ...p, [role]: { ...(p[role] || {}), [key]: !next } }));
    }
    setSaving(null);
  };

  const addRole = async () => {
    const key = newRoleKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const label = newRoleLabel.trim() || key;
    if (!key) {
      toast({ title: 'Role key required', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('app_roles')
      .insert({ role: key, label, is_system: false });
    if (error) {
      toast({ title: 'Could not add role', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Role created', description: `"${label}" is now available.` });
    setNewRoleOpen(false);
    setNewRoleKey('');
    setNewRoleLabel('');
    await load();
    setActiveRole(key);
  };

  const deleteRole = async (role: string) => {
    if (!confirm(`Delete role "${role}"? Users currently assigned this role will lose configured access.`)) return;
    const { error } = await supabase.from('app_roles').delete().eq('role', role);
    if (error) {
      toast({ title: 'Could not delete role', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('role_section_access').delete().eq('role', role);
    toast({ title: 'Role deleted' });
    if (activeRole === role) setActiveRole('supplier');
    load();
  };

  const renderSectionList = (role: string, sections: Section[]) => (
    <Card className="divide-y">
      {sections.map((s) => {
        const enabled = access[role]?.[s.key] ?? true;
        const sid = `${role}:${s.key}`;
        const isAdminRole = role === 'admin';
        return (
          <div key={s.key} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-muted-foreground">{s.description}</p>
            </div>
            <div className="flex items-center gap-3">
              {saving === sid && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={isAdminRole ? true : enabled}
                onCheckedChange={(v) => toggle(role, s.key, v)}
                disabled={isAdminRole || saving === sid}
              />
            </div>
          </div>
        );
      })}
    </Card>
  );

  return (
    <DashboardLayout title="Page Permissions">
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Control which sidebar pages each role can access. The <strong>Admin</strong> role always has full access and cannot be restricted.
          Disabled pages are hidden from the sidebar and blocked from direct URL access.
        </p>
        <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New role</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a new role</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium">Role key</label>
                <Input value={newRoleKey} onChange={(e) => setNewRoleKey(e.target.value)} placeholder="e.g. manager" />
                <p className="text-xs text-muted-foreground mt-1">Lowercase, letters/numbers/underscore. Stored on supplier records.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Display label</label>
                <Input value={newRoleLabel} onChange={(e) => setNewRoleLabel(e.target.value)} placeholder="e.g. Manager" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
              <Button onClick={addRole}>Create role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs value={activeRole} onValueChange={setActiveRole}>
          <TabsList className="flex flex-wrap h-auto">
            {roles.map((r) => (
              <TabsTrigger key={r.role} value={r.role} className="gap-2">
                {r.label}
                {!r.is_system && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); deleteRole(r.role); }}
                    className="ml-1 inline-flex items-center text-muted-foreground hover:text-destructive"
                    title="Delete role"
                  >
                    <Trash2 className="h-3 w-3" />
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {roles.map((r) => {
            const showAdmin = r.role !== 'supplier';
            return (
              <TabsContent key={r.role} value={r.role} className="space-y-6 mt-6">
                {showAdmin && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Admin pages</h3>
                    {renderSectionList(r.role, ADMIN_SECTIONS)}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Supplier pages</h3>
                  {renderSectionList(r.role, SUPPLIER_SECTIONS)}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </DashboardLayout>
  );
}
