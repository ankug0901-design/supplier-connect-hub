import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const SUPPLIER_SECTIONS: { key: string; label: string; description: string }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Supplier home with stats & quick actions' },
  { key: 'rfq-requests', label: 'RFQ Requests', description: 'Quote requests sent to the supplier' },
  { key: 'purchase-orders', label: 'Purchase Orders', description: 'PO list and PO details' },
  { key: 'invoices', label: 'Invoices', description: 'Invoice list and upload' },
  { key: 'payments', label: 'Payments', description: 'Payments received against invoices' },
  { key: 'delivery-challan', label: 'Delivery Challan', description: 'Create & view delivery challans' },
  { key: 'shipments', label: 'Shipments', description: 'AWB tracking & shipment status' },
];

export default function AdminPagePermissions() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('role_section_access')
      .select('section_key, enabled')
      .eq('role', 'supplier');
    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    } else {
      const map: Record<string, boolean> = {};
      SUPPLIER_SECTIONS.forEach((s) => { map[s.key] = true; });
      (data || []).forEach((r: any) => { map[r.section_key] = r.enabled; });
      setAccess(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (key: string, next: boolean) => {
    setSaving(key);
    setAccess((p) => ({ ...p, [key]: next }));
    const { error } = await supabase
      .from('role_section_access')
      .upsert(
        { role: 'supplier', section_key: key, enabled: next },
        { onConflict: 'role,section_key' }
      );
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      setAccess((p) => ({ ...p, [key]: !next }));
    } else {
      toast({ title: next ? 'Enabled' : 'Disabled', description: `Suppliers ${next ? 'can now' : 'can no longer'} see this page.` });
    }
    setSaving(null);
  };

  return (
    <DashboardLayout title="Page Permissions">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Control which sidebar pages all suppliers can access. Disabled pages are hidden from the sidebar and blocked from direct URL access.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="divide-y">
          {SUPPLIER_SECTIONS.map((s) => (
            <div key={s.key} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {saving === s.key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  checked={!!access[s.key]}
                  onCheckedChange={(v) => toggle(s.key, v)}
                  disabled={saving === s.key}
                />
              </div>
            </div>
          ))}
        </Card>
      )}
    </DashboardLayout>
  );
}
