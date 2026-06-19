import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, FileText, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchPoExceptionRequests, reviewPoException } from '@/services/api';

type Row = {
  id: string;
  po_id: string;
  supplier_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  poNumber?: string;
  supplierName?: string;
};

const formatDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AdminExceptionRequests() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const load = async () => {
    setLoading(true);
    try {
      const requests = (await fetchPoExceptionRequests()) as Row[];
      const poIds = Array.from(new Set(requests.map((r) => r.po_id))).filter(Boolean);
      const supplierIds = Array.from(new Set(requests.map((r) => r.supplier_id))).filter(Boolean);
      const [{ data: pos }, { data: sups }] = await Promise.all([
        poIds.length
          ? supabase.from('purchase_orders').select('id, po_number').in('id', poIds)
          : Promise.resolve({ data: [] as any[] } as any),
        supplierIds.length
          ? supabase.from('suppliers').select('id, company, name').in('id', supplierIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const poMap: Record<string, string> = {};
      (pos || []).forEach((p: any) => (poMap[p.id] = p.po_number));
      const supMap: Record<string, string> = {};
      (sups || []).forEach((s: any) => (supMap[s.id] = s.company || s.name));
      setRows(requests.map((r) => ({ ...r, poNumber: poMap[r.po_id], supplierName: supMap[r.supplier_id] })));
    } catch (e: any) {
      toast({ title: 'Failed to load', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleReview = async (row: Row, decision: 'approved' | 'rejected') => {
    setActingId(row.id);
    try {
      await reviewPoException(row.id, decision, notes[row.id] || '');
      toast({
        title: decision === 'approved' ? 'Exception approved' : 'Exception rejected',
        description: `PO ${row.poNumber || ''} updated.`,
      });
      void load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  const filtered = rows.filter((r) => r.status === tab);

  return (
    <DashboardLayout title="Delivery-date Exception Requests" subtitle="Review supplier exception requests for POs">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({rows.filter((r) => r.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card className="mt-4 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No {tab} requests.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    {tab === 'pending' && <TableHead className="w-[320px]">Decision</TableHead>}
                    {tab !== 'pending' && <TableHead>Admin notes</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <Link to={`/purchase-orders/${r.po_id}`} className="inline-flex items-center gap-1 hover:underline">
                          <FileText className="h-3.5 w-3.5" />
                          {r.poNumber || r.po_id.slice(0, 8)}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </Link>
                      </TableCell>
                      <TableCell>{r.supplierName || '—'}</TableCell>
                      <TableCell className="max-w-md whitespace-pre-wrap text-sm">{r.reason}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === 'approved'
                              ? 'border-success/30 bg-success/10 text-success'
                              : r.status === 'rejected'
                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                : 'border-warning/30 bg-warning/10 text-warning'
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      {tab === 'pending' ? (
                        <TableCell>
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Optional notes for supplier..."
                              rows={2}
                              value={notes[r.id] || ''}
                              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleReview(r, 'approved')}
                                disabled={actingId === r.id}
                              >
                                {actingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReview(r, 'rejected')}
                                disabled={actingId === r.id}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      ) : (
                        <TableCell className="max-w-sm whitespace-pre-wrap text-sm text-muted-foreground">
                          {r.admin_notes || '—'}
                          {r.reviewed_at && (
                            <div className="text-xs">on {formatDateTime(r.reviewed_at)}</div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
