import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

type Row = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  company: string;
  role: string;
};

type RoleOption = { value: string; label: string };

const SYSTEM_FALLBACK: RoleOption[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'user', label: 'User' },
  { value: 'super_user', label: 'Super User' },
  { value: 'admin', label: 'Admin' },
];

const roleVariant = (r: string): 'default' | 'secondary' | 'outline' =>
  r === 'admin' ? 'default' : r === 'super_user' ? 'secondary' : 'outline';

export default function AdminUserRoles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, user_id, name, email, company, role')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load users', description: error.message, variant: 'destructive' });
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (row: Row, next: string) => {
    if (next === row.role) return;
    setSaving(row.id);
    const { data, error } = await supabase
      .from('suppliers')
      .update({ role: next })
      .eq('id', row.id)
      .select('role')
      .single();
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else if (data?.role !== next) {
      // role-escalation trigger blocked the change
      toast({
        title: 'Not allowed',
        description: 'Only top-tier admins can change user roles.',
        variant: 'destructive',
      });
    } else {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, role: next } : r)));
      toast({ title: 'Role updated', description: `${row.name || row.email} is now ${roleLabel(next)}.` });
    }
    setSaving(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.company, r.role].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <DashboardLayout title="User Roles">
      <div className="mb-6 space-y-2">
        <p className="text-sm text-muted-foreground">
          Manage roles for every user. <strong>Admin</strong> has full access. <strong>Super User</strong> has full access except Page Permissions and role management. <strong>Supplier</strong> sees only enabled supplier pages.
        </p>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, company…"
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead className="w-[200px]">Change Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const isSelf = user?.id === row.user_id;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.name || '—'}
                        {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell className="text-sm">{row.email}</TableCell>
                      <TableCell className="text-sm">{row.company || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={roleVariant(row.role)}>{roleLabel(row.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={row.role}
                            onValueChange={(v) => changeRole(row, v)}
                            disabled={saving === row.id || isSelf}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {saving === row.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </DashboardLayout>
  );
}
