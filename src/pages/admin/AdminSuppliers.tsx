import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Minus, UserPlus, Pencil, ShieldCheck, Eye, KeyRound } from 'lucide-react';
import { UserPermissionsDialog } from '@/components/admin/UserPermissionsDialog';
import { useAuth } from '@/contexts/AuthContext';

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
  user_id: string | null;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  gst_number: string | null;
  address: string | null;
  zoho_vendor_id: string | null;
  role: string;
  created_at: string;
}

type EditDraft = {
  name: string;
  company: string;
  phone: string;
  gst_number: string;
  address: string;
  zoho_vendor_id: string;
};

const emptyEdit: EditDraft = { name: '', company: '', phone: '', gst_number: '', address: '', zoho_vendor_id: '' };

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', company: '', phone: '', gst_number: '', zoho_vendor_id: '' });
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(emptyEdit);
  const [saving, setSaving] = useState(false);
  const [permsFor, setPermsFor] = useState<SupplierRow | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { startImpersonation, realIsAdmin } = useAuth();
  const navigate = useNavigate();

  const handleResetPassword = async (s: SupplierRow) => {
    if (!confirm(`Send a password reset / invite email to ${s.email}?`)) return;
    setResettingId(s.id);
    const { data, error } = await supabase.functions.invoke('admin-invite-supplier', {
      body: {
        email: s.email,
        name: s.name,
        company: s.company,
        phone: s.phone || '',
        gst_number: s.gst_number || '',
        zoho_vendor_id: s.zoho_vendor_id || '',
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    setResettingId(null);
    if (error || (data as any)?.error) {
      toast({
        title: 'Could not send reset email',
        description: (data as any)?.error || error?.message || 'Unknown error',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Reset email sent',
      description: `${s.email} will receive a fresh link to set their password.`,
    });
  };

  const handleViewAs = (s: SupplierRow) => {
    startImpersonation({
      id: s.id,
      user_id: s.user_id,
      name: s.name,
      email: s.email,
      phone: s.phone || '',
      company: s.company,
      gstNumber: s.gst_number || '',
      address: s.address || '',
      zoho_vendor_id: s.zoho_vendor_id || '',
      role: s.role || 'supplier',
    });
    toast({
      title: 'Viewing as supplier',
      description: `${s.company || s.name} — read-only mode. Use the banner to exit.`,
    });
    navigate('/dashboard');
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, user_id, name, company, email, phone, gst_number, address, zoho_vendor_id, role, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setSuppliers(data as SupplierRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (s: SupplierRow) => {
    setEditing(s);
    setEditDraft({
      name: s.name || '',
      company: s.company || '',
      phone: s.phone || '',
      gst_number: s.gst_number || '',
      address: s.address || '',
      zoho_vendor_id: s.zoho_vendor_id || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editDraft.name.trim() || !editDraft.company.trim()) {
      toast({ title: 'Missing info', description: 'Name and company are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: editDraft.name.trim(),
      company: editDraft.company.trim(),
      phone: editDraft.phone.trim() || null,
      gst_number: editDraft.gst_number.trim() || null,
      address: editDraft.address.trim() || null,
      zoho_vendor_id: editDraft.zoho_vendor_id.trim() || null,
    };
    const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Supplier updated', description: payload.company });
    setSuppliers((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...payload } : s)));
    setEditing(null);
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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
                        <span className="text-sm">{s.zoho_vendor_id || '—'}</span>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewAs(s)}
                          disabled={!realIsAdmin || s.role === 'admin'}
                          title={s.role === 'admin' ? 'Cannot impersonate an admin' : 'View portal as this supplier (read-only)'}
                        >
                          <Eye className="h-4 w-4" />
                          View as
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPermsFor(s)} disabled={!s.user_id} title={s.user_id ? 'Per-user permissions' : 'User has not signed in yet'}>
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetPassword(s)}
                          disabled={resettingId === s.id}
                          title="Send a fresh password reset / invite email"
                        >
                          {resettingId === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <KeyRound className="h-4 w-4" />
                          )}
                          Reset
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit supplier</DialogTitle>
            <DialogDescription>
              Update supplier details. Email cannot be changed here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input value={editDraft.name} onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Company *</Label>
                <Input value={editDraft.company} onChange={(e) => setEditDraft((p) => ({ ...p, company: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={editing?.email || ''} disabled />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={editDraft.phone} onChange={(e) => setEditDraft((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>GST Number</Label>
                <Input value={editDraft.gst_number} onChange={(e) => setEditDraft((p) => ({ ...p, gst_number: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={editDraft.address} onChange={(e) => setEditDraft((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Zoho Vendor ID</Label>
              <Input value={editDraft.zoho_vendor_id} onChange={(e) => setEditDraft((p) => ({ ...p, zoho_vendor_id: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="gradient" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserPermissionsDialog
        open={!!permsFor}
        onOpenChange={(o) => !o && setPermsFor(null)}
        userId={permsFor?.user_id ?? null}
        userLabel={permsFor ? `${permsFor.name} (${permsFor.email})` : ''}
        role={permsFor?.role ?? 'supplier'}
      />
    </DashboardLayout>
  );
}
