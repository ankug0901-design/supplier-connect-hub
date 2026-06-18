import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Section = { key: string; label: string };

const ADMIN_SECTIONS: Section[] = [
  { key: 'admin-dashboard', label: 'Admin Dashboard' },
  { key: 'admin-suppliers', label: 'All Suppliers' },
  { key: 'admin-registrations', label: 'Registrations' },
  { key: 'admin-rfq', label: 'RFQ Management' },
  { key: 'admin-three-way-match', label: '3-Way Matching' },
  { key: 'admin-ai-insights', label: 'AI Insights' },
  { key: 'admin-vendor-scores', label: 'Supplier Performance' },
];

const SUPPLIER_SECTIONS: Section[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'rfq-requests', label: 'RFQ Requests' },
  { key: 'purchase-orders', label: 'Purchase Orders' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'delivery-challan', label: 'Delivery Challan' },
  { key: 'shipments', label: 'Shipments' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userLabel: string;
  role: string;
}

type Choice = 'inherit' | 'allow' | 'block';

export function UserPermissionsDialog({ open, onOpenChange, userId, userLabel, role }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Choice>>({});

  const adminRole = role === 'admin' || role === 'super_user' || role === 'user';
  const sections = [
    ...(adminRole ? ADMIN_SECTIONS : []),
    ...SUPPLIER_SECTIONS,
  ];

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    supabase
      .from('supplier_section_access')
      .select('section_key, enabled')
      .eq('user_id', userId)
      .then(({ data }) => {
        const map: Record<string, Choice> = {};
        (data || []).forEach((r: any) => {
          map[r.section_key] = r.enabled ? 'allow' : 'block';
        });
        setOverrides(map);
        setLoading(false);
      });
  }, [open, userId]);

  const setChoice = (key: string, choice: Choice) => {
    setOverrides((p) => ({ ...p, [key]: choice }));
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const toUpsert: { user_id: string; section_key: string; enabled: boolean }[] = [];
    const toDelete: string[] = [];
    sections.forEach((s) => {
      const c = overrides[s.key] || 'inherit';
      if (c === 'inherit') toDelete.push(s.key);
      else toUpsert.push({ user_id: userId, section_key: s.key, enabled: c === 'allow' });
    });

    if (toDelete.length) {
      await supabase.from('supplier_section_access').delete().eq('user_id', userId).in('section_key', toDelete);
    }
    if (toUpsert.length) {
      const { error } = await supabase
        .from('supplier_section_access')
        .upsert(toUpsert, { onConflict: 'user_id,section_key' });
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
    }
    toast({ title: 'Permissions updated', description: `Overrides saved for ${userLabel}.` });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Per-user permissions</DialogTitle>
          <DialogDescription>
            Override section access for <strong>{userLabel}</strong>. <em>Inherit</em> uses their role
            ("{role}") default. <em>Allow</em> and <em>Block</em> override the role setting just for this user.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {adminRole && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Admin pages</h4>
                <Card className="divide-y">
                  {ADMIN_SECTIONS.map((s) => (
                    <Row key={s.key} section={s} value={overrides[s.key] || 'inherit'} onChange={setChoice} />
                  ))}
                </Card>
              </div>
            )}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Supplier pages</h4>
              <Card className="divide-y">
                {SUPPLIER_SECTIONS.map((s) => (
                  <Row key={s.key} section={s} value={overrides[s.key] || 'inherit'} onChange={setChoice} />
                ))}
              </Card>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save overrides
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ section, value, onChange }: { section: Section; value: Choice; onChange: (k: string, v: Choice) => void }) {
  return (
    <div className="flex items-center justify-between p-3">
      <p className="font-medium text-sm">{section.label}</p>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(section.key, v as Choice)}
        size="sm"
      >
        <ToggleGroupItem value="inherit" className="text-xs">Inherit</ToggleGroupItem>
        <ToggleGroupItem value="allow" className="text-xs">Allow</ToggleGroupItem>
        <ToggleGroupItem value="block" className="text-xs">Block</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
