import { useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SUPPLIER_SECTIONS, SupplierSectionKey } from '@/lib/sections';

interface SupplierRow {
  id: string;
  user_id: string;
  name: string;
  company: string;
  email: string;
  role: string;
}

type AccessMap = Record<string, Record<SupplierSectionKey, boolean>>; // user_id -> sectionKey -> enabled

export default function AdminAccessControl() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [access, setAccess] = useState<AccessMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [{ data: sup }, { data: acc }] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, user_id, name, company, email, role')
        .eq('role', 'supplier')
        .order('company', { ascending: true }),
      supabase.from('supplier_section_access').select('user_id, section_key, enabled'),
    ]);
    const map: AccessMap = {};
    (sup || []).forEach((s: any) => {
      map[s.user_id] = {} as Record<SupplierSectionKey, boolean>;
      SUPPLIER_SECTIONS.forEach((sec) => {
        map[s.user_id][sec.key] = true; // default enabled
      });
    });
    (acc || []).forEach((row: any) => {
      if (!map[row.user_id]) map[row.user_id] = {} as Record<SupplierSectionKey, boolean>;
      map[row.user_id][row.section_key as SupplierSectionKey] = row.enabled;
    });
    setSuppliers((sup as SupplierRow[]) || []);
    setAccess(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (userId: string, sectionKey: SupplierSectionKey, value: boolean) => {
    const rowKey = `${userId}:${sectionKey}`;
    setSavingKey(rowKey);
    setAccess((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [sectionKey]: value },
    }));
    const { error } = await supabase
      .from('supplier_section_access')
      .upsert(
        { user_id: userId, section_key: sectionKey, enabled: value },
        { onConflict: 'user_id,section_key' }
      );
    setSavingKey(null);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      // revert
      setAccess((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], [sectionKey]: !value },
      }));
    } else {
      toast({ title: 'Access updated' });
    }
  };

  const filtered = suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name?.toLowerCase().includes(q) ||
      s.company?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Access Control</h1>
            <p className="text-sm text-muted-foreground">
              Choose which sections each supplier user can see in their portal.
            </p>
          </div>
        </div>

        <Card className="p-4">
          <Input
            placeholder="Search by name, company, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </Card>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No suppliers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Supplier</TableHead>
                    {SUPPLIER_SECTIONS.map((sec) => (
                      <TableHead key={sec.key} className="text-center whitespace-nowrap">
                        {sec.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.company || s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </TableCell>
                      {SUPPLIER_SECTIONS.map((sec) => {
                        const enabled = access[s.user_id]?.[sec.key] ?? true;
                        const rowKey = `${s.user_id}:${sec.key}`;
                        return (
                          <TableCell key={sec.key} className="text-center">
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={enabled}
                                disabled={savingKey === rowKey}
                                onCheckedChange={(v) => toggle(s.user_id, sec.key, v)}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        <p className="text-xs text-muted-foreground">
          <Badge variant="secondary" className="mr-2">Tip</Badge>
          By default all sections are enabled. Toggling a section off immediately hides it from the
          supplier's sidebar on their next page load.
        </p>
      </div>
    </DashboardLayout>
  );
}
