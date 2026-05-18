import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Minus, UserPlus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SupplierRow {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  gst_number: string | null;
  zoho_vendor_id: string | null;
  role: string;
  created_at: string;
}

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', company: '', phone: '', gst_number: '', zoho_vendor_id: '' });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, company, email, phone, gst_number, zoho_vendor_id, role, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setSuppliers(data as SupplierRow[]);
      const d: Record<string, string> = {};
      (data as SupplierRow[]).forEach((s) => { d[s.id] = s.zoho_vendor_id || ''; });
      setDrafts(d);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleBlur = async (supplier: SupplierRow) => {
    const value = drafts[supplier.id]?.trim() || '';
    if (value === (supplier.zoho_vendor_id || '')) return;
    const { error } = await supabase
      .from('suppliers')
      .update({ zoho_vendor_id: value || null })
      .eq('id', supplier.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: `Zoho Vendor ID updated for ${supplier.company}` });
      setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, zoho_vendor_id: value || null } : s)));
    }
  };

  const handleInvite = async () => {
    if (!invite.email || !invite.name || !invite.company) {
      toast({ title: 'Missing info', description: 'Email, name and company are required', variant: 'destructive' });
      return;
    }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke('admin-invite-supplier', {
      body: { ...invite, redirect_to: `${window.location.origin}/reset-password` },
    });
    setInviting(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Invite failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Invitation sent', description: `${invite.email} will receive an email to set their password.` });
    setInvite({ email: '', name: '', company: '', phone: '', gst_number: '', zoho_vendor_id: '' });
    setInviteOpen(false);
    load();
  };

  return (
    <DashboardLayout
      title="All Suppliers"
      actions={(
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button variant="gradient">
              <UserPlus className="h-4 w-4" />
              Invite Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a new supplier</DialogTitle>
              <DialogDescription>
                They'll receive an email to set their password and access the portal.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input value={invite.name} onChange={(e) => setInvite((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Company *</Label>
                  <Input value={invite.company} onChange={(e) => setInvite((p) => ({ ...p, company: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={invite.email} onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={invite.phone} onChange={(e) => setInvite((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>GST Number</Label>
                  <Input value={invite.gst_number} onChange={(e) => setInvite((p) => ({ ...p, gst_number: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Zoho Vendor ID (optional)</Label>
                <Input value={invite.zoho_vendor_id} onChange={(e) => setInvite((p) => ({ ...p, zoho_vendor_id: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button variant="gradient" onClick={handleInvite} disabled={inviting}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>GST Number</TableHead>
                  <TableHead>Zoho Vendor ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No suppliers yet
                    </TableCell>
                  </TableRow>
                )}
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.company}</TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell>{s.phone || '—'}</TableCell>
                    <TableCell>{s.gst_number || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={drafts[s.id] ?? ''}
                          onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: e.target.value }))}
                          onBlur={() => handleBlur(s)}
                          placeholder="Vendor ID"
                          className="h-8 w-36"
                        />
                        {s.zoho_vendor_id ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.role === 'admin' ? 'default' : 'secondary'}>{s.role}</Badge>
                    </TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
