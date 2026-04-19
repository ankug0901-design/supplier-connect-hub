import { useEffect, useState } from 'react';
import { Loader2, FileText, Check, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RegistrationRow {
  id: string;
  company: string;
  email: string;
  pan_number: string | null;
  tan_number: string | null;
  msme_number: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  status: string | null;
  documents_uploaded: string[] | null;
  created_at: string;
}

export default function AdminRegistrations() {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const { data, error } = await supabase
      .from('supplier_registrations')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setRows(data as RegistrationRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    setActingId(id);
    const { error } = await supabase
      .from('supplier_registrations')
      .update({ status })
      .eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: status === 'approved' ? '✅ Approved' : '❌ Rejected',
        description: `Registration marked as ${status}`,
      });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    }
    setActingId(null);
  };

  const getDocUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from('supplier-documents')
      .createSignedUrl(path, 60 * 60);
    return data?.signedUrl;
  };

  const openDoc = async (path: string) => {
    const url = await getDocUrl(path);
    if (url) window.open(url, '_blank');
    else toast({ title: 'Could not open document', variant: 'destructive' });
  };

  const statusVariant = (s: string | null) => {
    if (s === 'approved') return 'default';
    if (s === 'rejected') return 'destructive';
    return 'secondary';
  };

  return (
    <DashboardLayout title="Supplier Registrations">
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
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>PAN</TableHead>
                  <TableHead>TAN</TableHead>
                  <TableHead>MSME</TableHead>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>IFSC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No registrations yet
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.company}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.pan_number || '—'}</TableCell>
                    <TableCell>{r.tan_number || '—'}</TableCell>
                    <TableCell>{r.msme_number || '—'}</TableCell>
                    <TableCell>{r.bank_name || '—'}</TableCell>
                    <TableCell>{r.account_number || '—'}</TableCell>
                    <TableCell>{r.ifsc_code || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status || 'pending'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <FileText className="h-4 w-4" />
                              Documents
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Documents — {r.company}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-2">
                              {(r.documents_uploaded?.length ?? 0) === 0 && (
                                <p className="text-sm text-muted-foreground">No documents uploaded</p>
                              )}
                              {r.documents_uploaded?.map((path) => (
                                <button
                                  key={path}
                                  onClick={() => openDoc(path)}
                                  className="flex w-full items-center gap-2 rounded-md border p-3 text-left text-sm hover:bg-accent"
                                >
                                  <FileText className="h-4 w-4 text-primary" />
                                  <span className="truncate">{path.split('/').pop()}</span>
                                </button>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="success"
                          disabled={actingId === r.id || r.status === 'approved'}
                          onClick={() => updateStatus(r.id, 'approved')}
                        >
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actingId === r.id || r.status === 'rejected'}
                          onClick={() => updateStatus(r.id, 'rejected')}
                        >
                          <X className="h-4 w-4" />
                          Reject
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
    </DashboardLayout>
  );
}
