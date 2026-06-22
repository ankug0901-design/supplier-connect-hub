import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Crown, Medal, Award, Clock, CalendarIcon, Plus, Zap, Sparkles, Copy, Download, FileBarChart } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RfqCreateDrawer } from '@/components/admin/RfqCreateDrawer';
import { useAuth } from '@/contexts/AuthContext';
import { n8nPost } from '@/lib/n8n';

type Rfq = any;

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN');
}

function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineCutoff(d?: string | null, t?: string | null): Date | null {
  if (!d) return null;
  const datePart = d.length >= 10 ? d.slice(0, 10) : d;
  const timePart = (t && /^\d{2}:\d{2}/.test(t)) ? t.slice(0, 5) : '17:00';
  return new Date(`${datePart}T${timePart}:00+05:30`);
}

function fmtTime12(t?: string | null) {
  const src = t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : '17:00';
  const [hh, mm] = src.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${period}`;
}

function fmtDeadline(d?: string | null, t?: string | null) {
  if (!d) return '—';
  return `${fmtDate(d)} at ${fmtTime12(t)} IST`;
}

function deadlineToneClass(d?: string | null, t?: string | null): string {
  const target = deadlineCutoff(d, t);
  if (!target) return '';
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return 'text-red-700 font-semibold';
  const todayStr = new Date().toDateString();
  if (ms < 4 * 60 * 60 * 1000) return 'text-red-700 font-bold';
  if (target.toDateString() === todayStr) return 'text-amber-700 font-semibold';
  return '';
}

function closingCountdown(deadline?: string | null, time?: string | null): { label: string; tone: 'red' | 'orange' | 'gray' | 'expired' } | null {
  const target = deadlineCutoff(deadline, time);
  if (!target) return null;
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return { label: 'Closed', tone: 'expired' };
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const days = h / 24;
  const tone = days < 1 ? 'red' : days < 2 ? 'orange' : 'gray';
  const label = h >= 24
    ? `Closes in ${Math.floor(h / 24)}d ${h % 24}h`
    : `Closes in ${h}h ${m}m`;
  return { label, tone };
}

function RankCell({ rank }: { rank?: number | null }) {
  if (!rank) return <span className="text-muted-foreground">—</span>;
  if (rank === 1) return (
    <span className="inline-flex items-center gap-1 font-semibold text-yellow-700">
      <Crown className="h-4 w-4 fill-yellow-400 text-yellow-500" /> #1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
      <Medal className="h-4 w-4 text-slate-400" /> #2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
      <Award className="h-4 w-4 text-amber-600" /> #3
    </span>
  );
  return <span className="font-medium">#{rank}</span>;
}

export default function AdminRfq() {
  const [rows, setRows] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'compare' | 'decided'>('all');
  const [rejectTarget, setRejectTarget] = useState<Rfq | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forceCloseTarget, setForceCloseTarget] = useState<string | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [reopenTarget, setReopenTarget] = useState<{ id: string; mode: 'reopen' | 'extend' } | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenDate, setReopenDate] = useState<Date | undefined>(undefined);
  const [reopenTime, setReopenTime] = useState<string>('17:00');
  const [createOpen, setCreateOpen] = useState(false);
  const { supplier, user } = useAuth();
  const [justifyTarget, setJustifyTarget] = useState<{ row: Rfq; rank: number; l1: Rfq | null } | null>(null);
  const [justifyText, setJustifyText] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRfqId, setSummaryRfqId] = useState<string | null>(null);
  const [summaryMarkdown, setSummaryMarkdown] = useState<string>('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [tcaBusyId, setTcaBusyId] = useState<string | null>(null);

  const generateTcaReport = async (rfq_id: string) => {
    setTcaBusyId(rfq_id);
    try {
      const res = await n8nPost('rfq-tca-report', {
        rfq_id,
        requested_by: user?.email || supplier?.name || 'admin',
      });
      // n8n's "lastNode" response mode returns 500 with "No item to return"
      // when the final node (email) emits nothing. The workflow still ran.
      const benign = !res.ok && /no item to return/i.test(res.text || '');
      if (!res.ok && !benign) throw new Error(res.text || `HTTP ${res.status}`);
      toast.success('TCA report triggered — check procurement inbox shortly.');
    } catch (e: any) {
      toast.error(`TCA report failed: ${e.message || 'Unknown error'}`);
    } finally {
      setTcaBusyId(null);
    }
  };

  const generateSummary = async (rfq_id: string) => {
    setSummaryRfqId(rfq_id);
    setSummaryOpen(true);
    setSummaryMarkdown('');
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('rfq-client-summary', { body: { rfq_id } });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message || 'Failed';
        try { if (ctx?.body) { const t = typeof ctx.body === 'string' ? ctx.body : await new Response(ctx.body).text(); const j = JSON.parse(t); if (j.error) msg = j.error; } } catch {}
        throw new Error(msg);
      }
      setSummaryMarkdown(data?.markdown || '');
    } catch (e: any) {
      toast.error(`Summary failed: ${e.message || 'Unknown error'}`);
      setSummaryOpen(false);
    } finally {
      setSummaryLoading(false);
    }
  };

  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summaryMarkdown); toast.success('Copied to clipboard'); }
    catch { toast.error('Copy failed'); }
  };

  const downloadSummary = async () => {
    if (!summaryRef.current) return;
    setPdfBusy(true);
    try {
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 12;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - margin * 2);

      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - margin * 2);
      }

      pdf.save(`${summaryRfqId || 'rfq'}-client-summary.pdf`);
    } catch (e: any) {
      toast.error(`PDF export failed: ${e.message || 'Unknown error'}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from('rfq_portal_requests')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: sups } = await supabase
      .from('suppliers')
      .select('email,company')
      .limit(5000);

    const companyByEmail: Record<string, string> = {};
    (sups || []).forEach((s: any) => {
      const emailKey = String(s.email || '').trim().toLowerCase();
      if (emailKey && s.company) companyByEmail[emailKey] = s.company;
    });

    setRows((data || []).map((r: any) => ({
      ...r,
      supplier_company: companyByEmail[String(r.supplier_email || '').trim().toLowerCase()] || null,
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('rfq_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfq_portal_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, Rfq[]>();
    rows.forEach((r) => {
      if (!m.has(r.rfq_id)) m.set(r.rfq_id, []);
      m.get(r.rfq_id)!.push(r);
    });
    return Array.from(m.entries()).map(([rfq_id, items]) => ({ rfq_id, items }));
  }, [rows]);

  const filtered = useMemo(() => {
    return groups.filter(({ items }) => {
      const submitted = items.filter((r) => ['quote_submitted', 'accepted'].includes(r.status));
      const decided = items.some((r) => r.emboss_decision || ['accepted', 'rejected'].includes(r.status));
      if (filter === 'awaiting') return submitted.length === 0 && !decided;
      if (filter === 'compare') return submitted.length >= 1 && !decided;
      if (filter === 'decided') return decided;
      return true;
    });
  }, [groups, filter]);

  const patchLocal = (id: string, patch: Partial<Rfq>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const accept = async (r: Rfq, justification?: string) => {
    setBusyId(r.id);
    const prev = rows;
    const decidedAt = new Date().toISOString();
    const mergedNotes = justification
      ? `${r.emboss_notes ? r.emboss_notes + '\n\n' : ''}[Non-L1 Award Justification] ${justification}`
      : r.emboss_notes || '';
    // optimistic
    patchLocal(r.id, { status: 'accepted', emboss_decision: 'accepted', decided_at: decidedAt, emboss_notes: mergedNotes });
    const supplierName = r.supplier_company || r.supplier_email;
    try {
      const res = await n8nPost('rfq-quote-accepted', {
        rfq_id: r.rfq_id,
        supplier_email: r.supplier_email,
        supplier_name: supplierName,
        product_name: r.product_name,
        quantity: r.quantity,
        quoted_unit_price: Number(r.quoted_unit_price) || 0,
        quoted_gst_percent: Number(r.quoted_gst_percent) || 0,
        lead_time_days: Number(r.lead_time_days) || 0,
        payment_terms: r.payment_terms || '',
        emboss_notes: mergedNotes,
        price_rank: r.__effectiveRank ?? r.price_rank ?? 1,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Persist decision + justification to DB
      await supabase
        .from('rfq_portal_requests')
        .update({
          status: 'accepted',
          emboss_decision: 'accepted',
          decided_at: decidedAt,
          emboss_notes: mergedNotes,
        })
        .eq('id', r.id);
      toast.success('Quote accepted! Supplier notified by email.');
      await load();
    } catch (e: any) {
      setRows(prev);
      toast.error(`Accept failed: ${e.message || 'Unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const requestAccept = (r: Rfq, rank: number | null, l1: Rfq | null) => {
    const effRank = rank ?? r.price_rank ?? null;
    if (effRank && effRank > 1) {
      setJustifyText('');
      setJustifyTarget({ row: { ...r, __effectiveRank: effRank }, rank: effRank, l1 });
      return;
    }
    accept({ ...r, __effectiveRank: effRank ?? 1 });
  };

  const confirmJustifiedAccept = async () => {
    if (!justifyTarget) return;
    if (justifyText.trim().length < 20) {
      toast.error('Justification must be at least 20 characters');
      return;
    }
    const j = justifyText.trim();
    const tgt = justifyTarget;
    setJustifyTarget(null);
    setJustifyText('');
    await accept(tgt.row, j);
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setBusyId(target.id);
    const prev = rows;
    patchLocal(target.id, {
      status: 'rejected', emboss_decision: 'rejected',
      emboss_notes: rejectReason || null, decided_at: new Date().toISOString(),
    });
    setRejectTarget(null);
    try {
      const { error } = await supabase
        .from('rfq_portal_requests')
        .update({
          emboss_decision: 'rejected',
          status: 'rejected',
          emboss_notes: rejectReason || null,
          decided_at: new Date().toISOString(),
        })
        .eq('id', target.id);
      if (error) throw error;
      toast.success('Quote rejected.');
      setRejectReason('');
      await load();
    } catch (e: any) {
      setRows(prev);
      toast.error(e.message || 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  const patchLocalForRfq = (rfqId: string, patch: Partial<Rfq>) => {
    setRows((prev) => prev.map((r) => (r.rfq_id === rfqId ? { ...r, ...patch } : r)));
  };

  const forceClose = async () => {
    if (!forceCloseTarget) return;
    if (!forceCloseReason.trim()) {
      toast.error('Reason is required');
      return;
    }
    const targetId = forceCloseTarget;
    const reason = forceCloseReason.trim();
    setBusyId(targetId);
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // Optimistic — update both rfq_closed_at and response_deadline so countdown shows "Closed"
    patchLocalForRfq(targetId, { rfq_closed_at: now, response_deadline: yesterday });
    setForceCloseTarget(null);
    setForceCloseReason('');
    toast.success('RFQ closed successfully');
    try {
      const res = await n8nPost('rfq-manage', {
        rfq_id: targetId,
        action: 'force_close',
        reason,
        actioned_by: 'Ankur Gupta',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      toast.error(`Force close webhook failed: ${e.message || 'Unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async () => {
    if (!reopenTarget) return;
    if (!reopenDate) {
      toast.error('New closing date is required');
      return;
    }
    if (!reopenTime || !/^\d{2}:\d{2}/.test(reopenTime)) {
      toast.error('New closing time is required');
      return;
    }
    const [hh, mm] = reopenTime.split(':').map(Number);
    const target = new Date(reopenDate);
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= Date.now()) {
      toast.error('New closing date/time must be in the future');
      return;
    }
    if (reopenReason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    const targetId = reopenTarget.id;
    const action = reopenTarget.mode;
    const reason = reopenReason.trim();
    const newDeadline = format(reopenDate, 'yyyy-MM-dd');
    const newDeadlineTime = reopenTime;
    setBusyId(targetId);
    patchLocalForRfq(targetId, {
      rfq_closed_at: action === 'reopen' ? null : undefined,
      response_deadline: newDeadline,
      closing_time: newDeadlineTime,
    });
    setReopenTarget(null);
    setReopenReason('');
    setReopenDate(undefined);
    setReopenTime('17:00');
    toast.success(action === 'extend' ? 'RFQ deadline extended — suppliers have been notified' : 'RFQ reopened successfully');
    try {
      const res = await n8nPost('rfq-manage', {
        rfq_id: targetId,
        action,
        new_deadline: newDeadline,
        new_deadline_time: newDeadlineTime,
        reason,
        actioned_by: supplier?.name || user?.email || 'Admin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      toast.error(`${action === 'extend' ? 'Extend' : 'Reopen'} webhook failed: ${e.message || 'Unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const openReopenOrExtend = (rfqId: string, deadline?: string | null, time?: string | null, currentlyClosed?: boolean) => {
    const target = deadlineCutoff(deadline, time);
    const inPast = !!target && target.getTime() <= Date.now();
    const mode: 'reopen' | 'extend' = currentlyClosed || inPast ? 'reopen' : 'extend';
    setReopenTarget({ id: rfqId, mode });
    setReopenDate(undefined);
    setReopenTime('17:00');
    setReopenReason('');
  };

  return (
    <DashboardLayout title="RFQ Management" subtitle="All quote requests across suppliers">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="awaiting">Awaiting Quotes</TabsTrigger>
                <TabsTrigger value="compare">Ready to Compare</TabsTrigger>
                <TabsTrigger value="decided">Decision Made</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Create RFQ
            </Button>
          </div>

          {filtered.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No RFQs in this view.</CardContent></Card>
          )}

          {filtered.map(({ rfq_id, items }) => {
            const first = items[0];
            const decided = items.some((r) => r.emboss_decision || ['accepted', 'rejected'].includes(r.status));
            const isClosed = !!first.rfq_closed_at;
            const submittedRaw = items.filter((r) => ['quote_submitted', 'accepted', 'rejected'].includes(r.status));
            // Compute fallback ranks by total_price ascending for rows missing price_rank
            const totalOf = (r: any) => {
              const up = Number(r.quoted_unit_price) || 0;
              const gst = Number(r.quoted_gst_percent) || 0;
              return Number(r.total_price) || (up + (up * gst / 100));
            };
            const computedOrder = [...submittedRaw].sort((a, b) => totalOf(a) - totalOf(b));
            const computedRankMap = new Map<string, number>();
            computedOrder.forEach((r, i) => computedRankMap.set(r.id, i + 1));
            const effectiveRank = (r: any): number | null => {
              if (r.price_rank != null) return r.price_rank;
              return computedRankMap.get(r.id) ?? null;
            };
            const submitted = [...submittedRaw].sort((a, b) => {
              const ar = effectiveRank(a) ?? 999;
              const br = effectiveRank(b) ?? 999;
              if (ar !== br) return ar - br;
              return totalOf(a) - totalOf(b);
            });
            
            const groupHasAccepted = items.some((r) => r.status === 'accepted');
            const countdown = closingCountdown(first.response_deadline, first.closing_time);
            const rfqIsClosed = isClosed || countdown?.tone === 'expired';
            const l1Row = submitted[0] || null;
            const countdownClass =
              countdown?.tone === 'red' ? 'border-red-300 bg-red-50 text-red-700' :
              countdown?.tone === 'orange' ? 'border-orange-300 bg-orange-50 text-orange-700' :
              countdown?.tone === 'expired' ? 'border-red-400 bg-red-100 text-red-800' :
              'border-muted bg-muted text-muted-foreground';
            const deadlineToneCls = deadlineToneClass(first.response_deadline, first.closing_time);
            return (
              <Card key={rfq_id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-muted-foreground">{rfq_id}</span>
                        <h3 className="text-lg font-bold">{first.product_name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Client: {first.client_name} · Required by: {fmtDate(first.required_by_date)} · Closes: <span className={deadlineToneCls}>{fmtDeadline(first.response_deadline, first.closing_time)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {countdown && (
                        <Badge variant="outline" className={`border ${countdownClass}`}>
                          <Clock className="mr-1 h-3 w-3" /> {countdown.label}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {submitted.length} of {items.length} suppliers responded
                      </Badge>
                      {submitted.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                          onClick={() => generateSummary(rfq_id)}
                        >
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Client Summary
                        </Button>
                      )}
                      {submitted.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                          disabled={tcaBusyId === rfq_id}
                          onClick={() => generateTcaReport(rfq_id)}
                        >
                          {tcaBusyId === rfq_id
                            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            : <FileBarChart className="mr-1 h-3.5 w-3.5" />}
                          Generate TCA Report
                        </Button>
                      )}
                      {!decided && !isClosed && (
                        <Button size="sm" variant="destructive" disabled={!!busyId} onClick={() => setForceCloseTarget(rfq_id)}>
                          Force Close
                        </Button>
                      )}
                      {!decided && !rfqIsClosed && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!!busyId} onClick={() => openReopenOrExtend(rfq_id, first.response_deadline, first.closing_time, false)}>
                          Extend
                        </Button>
                      )}
                      {(isClosed || decided || (countdown && countdown.label === 'Closed')) && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={!!busyId} onClick={() => openReopenOrExtend(rfq_id, first.response_deadline, first.closing_time, true)}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>

                  {items.length >= 1 && (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr className="text-left">
                            <th className="p-2">Rank</th>
                            <th className="p-2">Supplier</th>
                            <th className="p-2">Unit Price</th>
                            <th className="p-2">GST</th>
                            <th className="p-2">Total/unit (incl. GST)</th>
                            <th className="p-2">Lead Time</th>
                            <th className="p-2">Payment</th>
                            <th className="p-2">Validity</th>
                            <th className="p-2">Setup</th>
                            <th className="p-2">Submitted</th>
                            <th className="p-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Submitted rows first (ranked), then awaiting */}
                          {[...submitted, ...items.filter((r) => r.status === 'pending')].map((r) => {
                            const isPending = r.status === 'pending';
                            const up = Number(r.quoted_unit_price) || 0;
                            const gst = Number(r.quoted_gst_percent) || 0;
                            const perUnit = Number(r.total_price) || (up + (up * gst / 100));
                            const isAccepted = r.status === 'accepted';
                            const isRejected = r.status === 'rejected';
                            const isBusy = busyId === r.id;
                            const disabled = isBusy || groupHasAccepted || !!busyId;
                            const sName = r.supplier_company;
                            const rowRank = isPending ? null : effectiveRank(r);
                            const isTopRank = rowRank === 1;
                            const revisionCount = Number(r.revision_count) || 0;
                            return (
                              <tr key={r.id} className={`border-t ${isAccepted ? 'bg-green-50' : ''} ${isRejected ? 'bg-muted/30' : ''} ${isPending && !rfqIsClosed ? 'bg-yellow-50/40' : ''} ${isPending && rfqIsClosed ? 'bg-muted/40 text-muted-foreground' : ''}`}>
                                <td className="p-2">
                                  {isPending ? <span className="text-muted-foreground">—</span> : <RankCell rank={rowRank} />}
                                </td>
                                <td className="p-2">
                                  <div className="font-medium">{sName || r.supplier_email}</div>
                                  {sName && <div className="text-xs text-muted-foreground">{r.supplier_email}</div>}
                                  {revisionCount > 0 && (
                                    <Badge variant="secondary" className="mt-1 text-xs">Revised {revisionCount}x</Badge>
                                  )}
                                  {isPending && rfqIsClosed && (
                                    <Badge variant="secondary" className="mt-1 text-xs">Did not respond</Badge>
                                  )}
                                </td>
                                {isPending ? (
                                  <td className="p-2" colSpan={7}>
                                    {rfqIsClosed ? (
                                      <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground">
                                        Closed — No Quote
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-800">
                                        Awaiting · {daysSince(r.created_at)}d elapsed
                                      </Badge>
                                    )}
                                  </td>
                                ) : (
                                  <>
                                    <td className="p-2">₹{up.toFixed(2)}</td>
                                    <td className="p-2">{gst}%</td>
                                    <td className={`p-2 font-semibold ${isTopRank ? 'bg-green-100 text-green-800' : ''}`}>
                                      ₹{perUnit.toFixed(2)}
                                    </td>
                                    <td className="p-2">{r.lead_time_days ?? '—'}d</td>
                                    <td className="p-2">{r.payment_terms || '—'}</td>
                                    <td className="p-2">{r.validity_days ?? '—'}d</td>
                                    <td className="p-2">₹{r.setup_charges ?? 0}</td>
                                  </>
                                )}
                                <td className="p-2 text-xs">{isPending ? '—' : fmtDateTime(r.quote_submitted_at)}</td>
                                <td className="p-2">
                                  <div className="flex justify-end gap-2">
                                    {isPending && <span className="text-xs text-muted-foreground">—</span>}
                                    {isAccepted && (
                                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">✅ Accepted</Badge>
                                    )}
                                    {isRejected && (
                                      <Badge variant="secondary">❌ Rejected</Badge>
                                    )}
                                    {!isPending && !isAccepted && !isRejected && (
                                      <>
                                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={disabled} onClick={() => requestAccept(r, rowRank, l1Row)}>
                                          {isBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                                          Accept
                                        </Button>
                                        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setRejectTarget(r)}>
                                          {isBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
                                          Reject
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject quote</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Optional reason — shared with supplier in their portal.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Price higher than competing quote"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!forceCloseTarget} onOpenChange={(o) => !o && setForceCloseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force Close RFQ</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">This will close the RFQ and notify all suppliers.</p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Input
              value={forceCloseReason}
              onChange={(e) => setForceCloseReason(e.target.value)}
              placeholder="Reason for closing"
            />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setForceCloseTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={forceClose}>Confirm Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reopenTarget} onOpenChange={(o) => !o && setReopenTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reopenTarget?.mode === 'extend' ? 'Extend RFQ Deadline' : 'Reopen RFQ'}</DialogTitle>
          </DialogHeader>
          {(() => {
            // urgent: target within 24h
            let urgent = false;
            if (reopenDate && /^\d{2}:\d{2}/.test(reopenTime)) {
              const [hh, mm] = reopenTime.split(':').map(Number);
              const t = new Date(reopenDate); t.setHours(hh, mm, 0, 0);
              const diff = t.getTime() - Date.now();
              urgent = diff > 0 && diff < 24 * 60 * 60 * 1000;
            }
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Closing Date *</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !reopenDate && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {reopenDate ? format(reopenDate, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={reopenDate} onSelect={setReopenDate} disabled={(date) => date < new Date(new Date().toDateString())} initialFocus className={cn('p-3 pointer-events-auto')} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Closing Time *</label>
                    <Input type="time" value={reopenTime} onChange={(e) => setReopenTime(e.target.value)} />
                    <p className="text-xs text-muted-foreground">IST (Indian Standard Time)</p>
                  </div>
                </div>
                {urgent && (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <Zap className="mr-1 h-3 w-3" /> Urgent
                  </Badge>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason * (min 10 chars)</label>
                  <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder={reopenTarget?.mode === 'extend' ? 'Reason for extending' : 'Reason for reopening'} rows={3} />
                </div>
              </div>
            );
          })()}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setReopenTarget(null)}>Cancel</Button>
            <Button className={reopenTarget?.mode === 'extend' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'} onClick={reopen}>
              {reopenTarget?.mode === 'extend' ? 'Extend' : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RfqCreateDrawer open={createOpen} onOpenChange={setCreateOpen} onSuccess={load} />


      <Dialog open={!!justifyTarget} onOpenChange={(o) => { if (!o) { setJustifyTarget(null); setJustifyText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justification Required — Non-L1 Award</DialogTitle>
          </DialogHeader>
          {justifyTarget && (() => {
            const t = justifyTarget;
            const r = t.row;
            const up = Number(r.quoted_unit_price) || 0;
            const supName = r.supplier_company || r.supplier_email;
            const l1 = t.l1;
            const l1Up = l1 ? (Number(l1.quoted_unit_price) || 0) : 0;
            const l1Name = l1 ? (l1.supplier_company || l1.supplier_email) : '—';
            return (
              <div className="space-y-4">
                <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                  You are awarding this RFQ to <strong>{supName}</strong> at <strong>₹{up.toFixed(2)}/unit</strong> who is ranked <strong>#{t.rank}</strong>, not the lowest bidder
                  {l1 ? (<> (L1: <strong>₹{l1Up.toFixed(2)}/unit</strong> from <strong>{l1Name}</strong>)</>) : ''}.
                  This decision requires a documented reason.
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason for awarding to non-L1 supplier (min 20 chars)</label>
                  <Textarea
                    value={justifyText}
                    onChange={(e) => setJustifyText(e.target.value)}
                    placeholder="e.g. L1 lead time exceeds client deadline; chosen supplier offers faster delivery and proven quality on similar jobs."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">{justifyText.trim().length}/20</p>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setJustifyTarget(null); setJustifyText(''); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={justifyText.trim().length < 20}
              onClick={confirmJustifiedAccept}
            >
              Confirm Award with Justification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Client Summary — {summaryRfqId}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Analyzing quotes and drafting client-ready summary...
              </div>
            ) : (
              <div
                ref={summaryRef}
                className="mx-auto bg-white shadow-sm"
                style={{ width: '794px', minHeight: '1123px', padding: '56px 64px', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Emboss Marketing · Procurement</div>
                    <div className="text-xs text-slate-500 mt-1">RFQ {summaryRfqId}</div>
                  </div>
                  <div className="text-[10px] text-slate-500 text-right">
                    Generated {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <article
                  className="prose prose-slate prose-sm max-w-none
                    prose-headings:font-semibold prose-headings:text-slate-900
                    prose-h1:text-2xl prose-h1:mb-2 prose-h1:mt-0 prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-3
                    prose-h2:text-base prose-h2:uppercase prose-h2:tracking-wider prose-h2:text-slate-700 prose-h2:mt-7 prose-h2:mb-3
                    prose-h3:text-sm prose-h3:text-slate-800
                    prose-p:leading-relaxed prose-p:text-slate-700
                    prose-strong:text-slate-900
                    prose-ul:my-2 prose-li:my-0.5 prose-li:text-slate-700
                    prose-table:my-3 prose-table:text-[12px] prose-table:border prose-table:border-slate-300
                    prose-thead:bg-slate-100
                    prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-slate-700 prose-th:border prose-th:border-slate-300
                    prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-200 prose-td:align-top"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryMarkdown}</ReactMarkdown>
                </article>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 px-6 py-4 border-t bg-background">
            <Button variant="outline" onClick={() => setSummaryOpen(false)}>Close</Button>
            <Button variant="outline" disabled={!summaryMarkdown} onClick={copySummary}>
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
            <Button disabled={!summaryMarkdown || pdfBusy} onClick={downloadSummary} className="bg-purple-600 hover:bg-purple-700 text-white">
              {pdfBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              {pdfBusy ? 'Preparing…' : 'Download PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
