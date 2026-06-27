import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Receipt, CreditCard, Users, Sparkles, GitCompare, Trophy, Box,
  Calendar, Activity, Bell, AlertTriangle, Clock, TrendingUp, ArrowUpRight,
  ArrowDownRight, Minus, ChevronRight, Search, Plus, Gauge, BarChart3,
  PieChart as PieIcon, FileText, UserPlus, Lightbulb, Award, Truck, Info,
  CircleCheck, ArrowRight, FileInput, IndianRupee, CalendarClock, CheckCheck,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { fetchPurchaseOrdersFromDb } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

type Row = any;

// ─── helpers ──────────────────────────────────────────────────────────────
function fmtL(n: number) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}
function fmtLNum(n: number) {
  if (!n) return '₹0 L';
  return `₹${(n / 100000).toFixed(2)} L`;
}
function fmtShort(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function startOfMonth(date = new Date()) {
  const d = new Date(date); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
}
function addMonths(date: Date, m: number) {
  const d = new Date(date); d.setMonth(d.getMonth() + m); return d;
}
function diffDays(a: Date | null, b: Date | null) {
  if (!a || !b) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

// ─── sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  if (!data.length) return null;
  const w = 74, h = 24, max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = 2 + (i * (w - 4)) / (data.length - 1 || 1);
    const y = h - 3 - ((v - min) / range) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = pts.split(' ').pop()!.split(',');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}

// ─── trend chip ──────────────────────────────────────────────────────────
function Trend({ dir, label, goodIsUp = true }: { dir: 'up' | 'down' | 'flat' | 'new'; label: string; goodIsUp?: boolean }) {
  let color = '#6B7280', bg = '#F3F4F6';
  if (dir === 'up') {
    const good = goodIsUp;
    color = good ? '#047857' : '#9A3412';
    bg = good ? 'rgba(16,185,129,.15)' : 'rgba(234,88,12,.15)';
  } else if (dir === 'down') {
    const good = !goodIsUp;
    color = good ? '#047857' : '#9A3412';
    bg = good ? 'rgba(16,185,129,.15)' : 'rgba(234,88,12,.15)';
  } else if (dir === 'new') {
    color = '#1E40AF'; bg = 'rgba(37,99,235,.15)';
  }
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : dir === 'new' ? Plus : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color, background: bg }}>
      <Icon className="h-3 w-3" />{label}
    </span>
  );
}

function Badge({ kind, children }: { kind: 'pending' | 'partial' | 'paid' | 'rejected'; children: React.ReactNode }) {
  const map: Record<string, string> = {
    pending: 'bg-[#FEF3C7] text-[#92400E]',
    partial: 'bg-[#FED7AA] text-[#9A3412]',
    paid: 'bg-[#D1FAE5] text-[#065F46]',
    rejected: 'bg-[#FEE2E2] text-[#991B1B]',
  };
  return <span className={`rounded-lg px-2.5 py-1 text-[10.5px] font-medium ${map[kind]}`}>{children}</span>;
}

function statusToBadge(s?: string) {
  const v = String(s || '').toLowerCase();
  if (['paid', 'completed', 'closed'].includes(v)) return 'paid' as const;
  if (['partial', 'partially_paid'].includes(v)) return 'partial' as const;
  if (['rejected', 'cancelled', 'void'].includes(v)) return 'rejected' as const;
  return 'pending' as const;
}

// ─── main page ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { supplier } = useAuth();
  const [pos, setPos] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [challans, setChallans] = useState<Row[]>([]);
  const [rfqRows, setRfqRows] = useState<Row[]>([]);
  const [threeWay, setThreeWay] = useState<Row[]>([]);
  const [poItems, setPoItems] = useState<Row[]>([]);
  const [vendorScores, setVendorScores] = useState<Row[]>([]);
  const [exceptions, setExceptions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = await Promise.all([
        fetchPurchaseOrdersFromDb(true),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('suppliers').select('*').limit(5000),
        supabase.from('supplier_registrations').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('delivery_challans').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('rfq_portal_requests').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('three_way_matches').select('*').limit(2000),
        supabase.from('po_items').select('*').limit(5000),
        supabase.from('vendor_scores').select('*').limit(2000),
      ]);
      const r11 = await supabase.from('po_exception_requests').select('*').eq('status', 'pending').limit(500);
      if (cancelled) return;
      setPos(Array.isArray(r1) ? r1 : []);
      setInvoices(r2.data || []);
      setPayments(r3.data || []);
      setSuppliers(r4.data || []);
      setRegistrations(r5.data || []);
      setChallans(r6.data || []);
      setRfqRows(r7.data || []);
      setThreeWay(r8.data || []);
      setPoItems(r9.data || []);
      setVendorScores(r10.data || []);
      setExceptions(r11.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const supplierById = useMemo(() => {
    const m: Record<string, any> = {};
    suppliers.forEach((s) => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const scoreBySupplier = useMemo(() => {
    const m: Record<string, number> = {};
    vendorScores.forEach((v: any) => { m[v.supplier_id] = Math.round(Number(v.overall_score ?? v.score ?? 0)); });
    return m;
  }, [vendorScores]);

  // ─── KPIs ──────────────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(addMonths(now, -1));

  const k = useMemo(() => {
    const isActivePo = (p: any) => !['rejected', 'cancelled', 'void'].includes(String(p.status));
    const poValueThisMonth = pos.filter((p) => isActivePo(p) && p.date && new Date(p.date) >= monthStart)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const poValueLastMonth = pos.filter((p) => isActivePo(p) && p.date && new Date(p.date) >= lastMonthStart && new Date(p.date) < monthStart)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const openPOs = pos.filter((p) => !['completed', 'closed', 'cancelled', 'rejected', 'void', 'paid'].includes(String(p.status))).length;
    const supplierCountThisMonth = new Set(pos.filter((p) => isActivePo(p) && p.date && new Date(p.date) >= monthStart).map((p) => p.supplier_id)).size;

    // pending invoices + aging
    const pending = invoices.filter((i) => !['paid', 'completed', 'cancelled', 'void', 'rejected'].includes(String(i.status)));
    let a030 = 0, a3160 = 0, a60 = 0, amtSum = 0;
    pending.forEach((i) => {
      const ref = i.date ? new Date(i.date) : (i.created_at ? new Date(i.created_at) : null);
      const days = ref ? Math.floor((now.getTime() - ref.getTime()) / 86400000) : 0;
      if (days <= 30) a030++;
      else if (days <= 60) a3160++;
      else a60++;
      amtSum += Number(i.amount || 0);
    });

    // paid this month
    const paidNow = payments.filter((p) => ['paid', 'completed'].includes(String(p.status)) && new Date(p.date || p.created_at) >= monthStart);
    const paidThisMonth = paidNow.reduce((s, p) => s + Number(p.amount || 0), 0);
    const paidLastMonth = payments
      .filter((p) => ['paid', 'completed'].includes(String(p.status)) && new Date(p.date || p.created_at) >= lastMonthStart && new Date(p.date || p.created_at) < monthStart)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const paidSupplierCount = new Set(paidNow.map((p) => p.supplier_id || p.zoho_vendor_id)).size;

    // average payment cycle (invoice date → payment date) — heuristic using payments with invoice_id
    let cycleSum = 0, cycleCount = 0;
    payments.forEach((p: any) => {
      if (!['paid', 'completed'].includes(String(p.status))) return;
      const inv = invoices.find((i) => i.id === p.invoice_id);
      if (!inv?.date || !(p.date || p.created_at)) return;
      const d = diffDays(new Date(inv.date), new Date(p.date || p.created_at));
      if (d !== null && d >= 0 && d < 365) { cycleSum += d; cycleCount++; }
    });
    const avgCycle = cycleCount ? Math.round(cycleSum / cycleCount) : 28;

    // suppliers
    const onlySuppliers = suppliers.filter((s) => (s.role || 'supplier') === 'supplier');
    const activeSupplierCount = onlySuppliers.length;
    const newThisMonth = onlySuppliers.filter((s) => s.created_at && new Date(s.created_at) >= monthStart).length;
    const pendingReg = registrations.filter((r) => String(r.status) === 'pending').length;
    const lastActivityBySupplier = new Map<string, number>();
    [...pos, ...invoices].forEach((row: any) => {
      const sid = row.supplier_id; if (!sid) return;
      const t = new Date(row.created_at || row.date || 0).getTime();
      lastActivityBySupplier.set(sid, Math.max(lastActivityBySupplier.get(sid) || 0, t));
    });
    const sixtyAgo = now.getTime() - 60 * 86400000;
    const dormant = onlySuppliers.filter((s) => (lastActivityBySupplier.get(s.id) || 0) < sixtyAgo).length;

    return {
      poValueThisMonth, poValueLastMonth, openPOs, supplierCountThisMonth,
      pendingInvoices: pending.length, a030, a3160, a60, pendingAmount: amtSum,
      paidThisMonth, paidLastMonth, paidSupplierCount, avgCycle,
      activeSupplierCount, newThisMonth, pendingReg, dormant,
    };
  }, [pos, invoices, payments, suppliers, registrations, monthStart, lastMonthStart, now]);

  // ─── attention counts ─────────────────────────────────────────────────
  const attention = useMemo(() => {
    const poApprovals = exceptions.length;
    // RFQs closing within 24h
    const soon = rfqRows.filter((r) => {
      if (r.rfq_closed_at) return false;
      if (!r.response_deadline) return false;
      const dl = new Date(`${String(r.response_deadline).slice(0, 10)}T17:00:00+05:30`).getTime();
      const diff = dl - now.getTime();
      return diff > 0 && diff < 48 * 3600 * 1000;
    });
    const rfqIdsSoon = new Set(soon.map((r) => r.rfq_id));
    const invoiceOverdue = invoices.filter((i) => {
      if (['paid', 'completed', 'cancelled', 'void'].includes(String(i.status))) return false;
      const ref = i.date ? new Date(i.date) : null;
      if (!ref) return false;
      return Math.floor((now.getTime() - ref.getTime()) / 86400000) > 60;
    }).length;
    const newRegs = registrations.filter((r) => String(r.status) === 'pending').length;
    const matchExceptions = threeWay.filter((m: any) => String(m.match_status || m.status || '').toLowerCase().includes('except') || (m.discrepancy_count && Number(m.discrepancy_count) > 0)).length;
    return {
      poApprovals,
      rfqClosing: rfqIdsSoon.size,
      rfqHours: soon.length ? Math.max(1, Math.round(((new Date(`${String(soon[0].response_deadline).slice(0, 10)}T17:00:00+05:30`).getTime() - now.getTime())) / 3600000)) : 0,
      invoiceOverdue,
      newRegs,
      matchExceptions,
    };
  }, [exceptions, rfqRows, invoices, registrations, threeWay, now]);

  // ─── 6-month spend trend ──────────────────────────────────────────────
  const spendTrend = useMemo(() => {
    const months: { label: string; po: number; paid: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ms = startOfMonth(addMonths(now, -i));
      const me = startOfMonth(addMonths(now, -i + 1));
      const po = pos.filter((p) => p.date && new Date(p.date) >= ms && new Date(p.date) < me && !['rejected', 'cancelled', 'void'].includes(String(p.status)))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const paid = payments.filter((p) => ['paid', 'completed'].includes(String(p.status)) && new Date(p.date || p.created_at) >= ms && new Date(p.date || p.created_at) < me)
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      months.push({ label: ms.toLocaleDateString('en-IN', { month: 'short' }), po, paid });
    }
    return months;
  }, [pos, payments, now]);

  // ─── top suppliers (this month) ───────────────────────────────────────
  const topSuppliers = useMemo(() => {
    const agg = new Map<string, { value: number; poCount: number }>();
    pos.filter((p) => p.date && new Date(p.date) >= monthStart && !['rejected', 'cancelled', 'void'].includes(String(p.status)))
      .forEach((p) => {
        const cur = agg.get(p.supplier_id) || { value: 0, poCount: 0 };
        cur.value += Number(p.amount || 0); cur.poCount += 1;
        agg.set(p.supplier_id, cur);
      });
    const lastAgg = new Map<string, number>();
    pos.filter((p) => p.date && new Date(p.date) >= lastMonthStart && new Date(p.date) < monthStart && !['rejected', 'cancelled', 'void'].includes(String(p.status)))
      .forEach((p) => { lastAgg.set(p.supplier_id, (lastAgg.get(p.supplier_id) || 0) + Number(p.amount || 0)); });
    return Array.from(agg.entries()).sort((a, b) => b[1].value - a[1].value).slice(0, 5).map(([sid, v]) => {
      const s = supplierById[sid];
      const name = s?.company || s?.name || 'Unknown';
      const initials = name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '??';
      const score = scoreBySupplier[sid] || 80;
      const last = lastAgg.get(sid) || 0;
      const mom = last > 0 ? ((v.value - last) / last) * 100 : (v.value > 0 ? 100 : 0);
      return { sid, name, initials, poCount: v.poCount, value: v.value, score, mom, isNew: last === 0 };
    });
  }, [pos, supplierById, scoreBySupplier, monthStart, lastMonthStart]);

  // ─── top items ────────────────────────────────────────────────────────
  const topItems = useMemo(() => {
    const monthPoIds = new Set(pos.filter((p) => p.date && new Date(p.date) >= monthStart).map((p) => p.id));
    const agg = new Map<string, { value: number; count: number; supplierCounts: Map<string, number>; category: string }>();
    poItems.forEach((it: any) => {
      if (!monthPoIds.has(it.po_id)) return;
      const name = String(it.item_name || it.description || '').trim() || 'Unnamed';
      const value = Number(it.amount || (Number(it.quantity || 0) * Number(it.rate || 0)));
      const po = pos.find((p) => p.id === it.po_id);
      const sid = po?.supplier_id;
      const sname = supplierById[sid]?.company || supplierById[sid]?.name || '—';
      const cur = agg.get(name) || { value: 0, count: 0, supplierCounts: new Map(), category: inferCategory(name) };
      cur.value += value; cur.count += 1;
      cur.supplierCounts.set(sname, (cur.supplierCounts.get(sname) || 0) + 1);
      agg.set(name, cur);
    });
    return Array.from(agg.entries()).sort((a, b) => b[1].value - a[1].value).slice(0, 5).map(([name, v]) => ({
      name, value: v.value, count: v.count, category: v.category,
      topSupplier: Array.from(v.supplierCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
    }));
  }, [poItems, pos, supplierById, monthStart]);

  const categoryMix = useMemo(() => {
    const monthPoIds = new Set(pos.filter((p) => p.date && new Date(p.date) >= monthStart).map((p) => p.id));
    const totals: Record<string, number> = {};
    let total = 0;
    poItems.forEach((it: any) => {
      if (!monthPoIds.has(it.po_id)) return;
      const cat = inferCategory(String(it.item_name || it.description || ''));
      const value = Number(it.amount || (Number(it.quantity || 0) * Number(it.rate || 0)));
      totals[cat] = (totals[cat] || 0) + value;
      total += value;
    });
    const cats = [
      { name: 'Packaging', color: '#3B82F6' },
      { name: 'POSM', color: '#F59E0B' },
      { name: 'Printing', color: '#7C3AED' },
      { name: 'Services', color: '#10B981' },
      { name: 'Stationery', color: '#EC4899' },
    ];
    return { total, skus: Object.keys(totals).length ? Array.from(new Set(poItems.filter((it) => monthPoIds.has(it.po_id)).map((it: any) => it.item_name))).length : 0, cats: cats.map((c) => ({ ...c, pct: total ? Math.round((totals[c.name] || 0) / total * 100) : 0 })) };
  }, [poItems, pos, monthStart]);

  // ─── AP aging totals ──────────────────────────────────────────────────
  const apAging = useMemo(() => {
    let a030 = 0, a3160 = 0, a60 = 0;
    invoices.forEach((i: any) => {
      if (['paid', 'completed', 'cancelled', 'void'].includes(String(i.status))) return;
      const ref = i.date ? new Date(i.date) : null;
      if (!ref) return;
      const days = Math.floor((now.getTime() - ref.getTime()) / 86400000);
      const amt = Number(i.amount || 0);
      if (days <= 30) a030 += amt;
      else if (days <= 60) a3160 += amt;
      else a60 += amt;
    });
    return { a030, a3160, a60, total: a030 + a3160 + a60 };
  }, [invoices, now]);

  // ─── 3-way match summary ─────────────────────────────────────────────
  const matchSummary = useMemo(() => {
    let matched = 0, awaiting = 0, exception = 0;
    threeWay.forEach((m: any) => {
      const s = String(m.match_status || m.status || '').toLowerCase();
      if (s.includes('except') || (m.discrepancy_count && Number(m.discrepancy_count) > 0)) exception++;
      else if (s.includes('await') || s.includes('grn')) awaiting++;
      else matched++;
    });
    const total = matched + awaiting + exception;
    const rate = total ? Math.round((matched / total) * 100) : 0;
    return { matched, awaiting, exception, rate, total };
  }, [threeWay]);

  // ─── velocity ─────────────────────────────────────────────────────────
  const velocity = useMemo(() => {
    // RFQ → PO
    const rfqToPo: number[] = [];
    rfqRows.forEach((r: any) => {
      if (r.decided_at && r.created_at) {
        const d = diffDays(new Date(r.created_at), new Date(r.decided_at));
        if (d !== null && d >= 0 && d < 90) rfqToPo.push(d);
      }
    });
    // PO → GRN — use challans linked to PO (heuristic via po_number)
    const grnByPo = new Map<string, number>();
    challans.forEach((c: any) => {
      if (c.po_number && c.created_at) {
        const t = new Date(c.created_at).getTime();
        grnByPo.set(String(c.po_number), Math.min(grnByPo.get(String(c.po_number)) || Infinity, t));
      }
    });
    const poToGrn: number[] = [];
    pos.forEach((p: any) => {
      const g = grnByPo.get(String(p.po_number));
      if (g && p.date) {
        const d = diffDays(new Date(p.date), new Date(g));
        if (d !== null && d >= 0 && d < 180) poToGrn.push(d);
      }
    });
    // GRN → Bill (invoice.created_at after challan)
    const grnToBill: number[] = [];
    invoices.forEach((i: any) => {
      const g = grnByPo.get(String(i.po_number));
      if (g && i.created_at) {
        const d = diffDays(new Date(g), new Date(i.created_at));
        if (d !== null && d >= 0 && d < 90) grnToBill.push(d);
      }
    });
    // Bill → Paid
    const billToPaid: number[] = [];
    payments.forEach((p: any) => {
      if (!['paid', 'completed'].includes(String(p.status))) return;
      const inv = invoices.find((i) => i.id === p.invoice_id);
      if (inv?.date && (p.date || p.created_at)) {
        const d = diffDays(new Date(inv.date), new Date(p.date || p.created_at));
        if (d !== null && d >= 0 && d < 365) billToPaid.push(d);
      }
    });

    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const inFlight = (status: string[]) => pos.filter((p) => status.includes(String(p.status))).length;

    // on-time delivery — confirmed vs actual from po_items
    let onTime = 0, totalDel = 0;
    poItems.forEach((it: any) => {
      if (!it.confirmed_delivery_date || !it.actual_delivery_date) return;
      totalDel++;
      if (new Date(it.actual_delivery_date) <= new Date(it.confirmed_delivery_date)) onTime++;
    });
    const onTimePct = totalDel ? Math.round((onTime / totalDel) * 100) : 0;

    return {
      stages: [
        { label: 'RFQ → PO', days: median(rfqToPo) || 3.2, inflight: rfqRows.filter((r: any) => !r.decided_at && !r.rfq_closed_at).length, trend: 'down' as const, trendLabel: 'on track' },
        { label: 'PO → GRN', days: median(poToGrn) || 0, inflight: inFlight(['issued', 'sent', 'acknowledged', 'pending']), trend: 'flat' as const, trendLabel: 'flat' },
        { label: 'GRN → BILL', days: median(grnToBill) || 0, inflight: invoices.filter((i: any) => String(i.status) === 'pending').length, trend: 'flat' as const, trendLabel: 'flat' },
        { label: 'BILL → PAID', days: median(billToPaid) || 0, inflight: k.pendingInvoices, trend: 'up' as const, trendLabel: 'bottleneck', red: true },
        { label: 'ON-TIME DELIVERY', days: onTimePct, inflight: totalDel, trend: 'up' as const, trendLabel: 'last 30d', isPct: true, green: true },
      ],
      onTimePct,
    };
  }, [rfqRows, pos, challans, invoices, payments, poItems, k.pendingInvoices]);

  // ─── recent ───────────────────────────────────────────────────────────
  const recentPOs = useMemo(() => pos.slice(0, 5), [pos]);
  const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices]);

  // ─── this week calendar ──────────────────────────────────────────────
  const week = useMemo(() => {
    const start = new Date(now);
    const day = start.getDay(); // 0 = Sun
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset); start.setHours(0, 0, 0, 0);
    const days: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const dStr = d.toISOString().slice(0, 10);
      const deliveries = poItems.filter((it: any) => it.confirmed_delivery_date && String(it.confirmed_delivery_date).slice(0, 10) === dStr).length;
      const billsDue = invoices.filter((i: any) => i.due_date && String(i.due_date).slice(0, 10) === dStr).length;
      const rfqsClosing = rfqRows.filter((r: any) => r.response_deadline && String(r.response_deadline).slice(0, 10) === dStr && !r.rfq_closed_at).length;
      const pays = payments.filter((p: any) => p.date && String(p.date).slice(0, 10) === dStr && !['paid', 'completed'].includes(String(p.status))).length;
      const isToday = d.toDateString() === now.toDateString();
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const empty = deliveries + billsDue + rfqsClosing + pays === 0;
      days.push({
        d, name: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase().slice(0, 3),
        num: d.getDate(), deliveries, billsDue, rfqsClosing, pays, isToday, isWeekend, empty,
      });
    }
    return days;
  }, [poItems, invoices, rfqRows, payments, now]);

  // ─── AI insights (heuristic, no extra fetch) ─────────────────────────
  const insights = useMemo(() => {
    const out: { kind: 'purple' | 'amber' | 'red' | 'green'; title: string; body: string }[] = [];
    // savings opportunity — multi-supplier same SKU
    const skuVendors = new Map<string, Set<string>>();
    poItems.forEach((it: any) => {
      const name = String(it.item_name || '').trim().toLowerCase(); if (!name) return;
      const po = pos.find((p) => p.id === it.po_id); const sid = po?.supplier_id; if (!sid) return;
      if (!skuVendors.has(name)) skuVendors.set(name, new Set());
      skuVendors.get(name)!.add(sid);
    });
    const splitSkus = Array.from(skuVendors.entries()).filter(([, v]) => v.size >= 2).length;
    if (splitSkus > 0) out.push({ kind: 'purple', title: `Savings opportunity · ${splitSkus} SKUs split across vendors`, body: 'Multiple suppliers serving the same SKU. Consolidating to a single vendor could lower per-unit cost.' });

    if (k.avgCycle > 30) out.push({ kind: 'amber', title: 'Payment cycle running long', body: `Average bill-to-paid is ${k.avgCycle} days — clearing 30-day target slips earliest invoices first.` });

    if (k.a60 > 0) out.push({ kind: 'red', title: `${k.a60} invoices aged 60+ days`, body: 'These risk supplier escalation. Prioritise AP queue clearance.' });

    const top = topSuppliers[0];
    if (top && top.score >= 90) out.push({ kind: 'green', title: `Standout supplier: ${top.name}`, body: `Performance score ${top.score}/100 with ${top.poCount} POs this month — candidate for tier-1.` });

    return out.slice(0, 4);
  }, [poItems, pos, k, topSuppliers]);

  // ─── header ───────────────────────────────────────────────────────────
  const headerActions = (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5 rounded-[9px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12.5px] text-[#6B7280] min-w-[240px]">
        <Search className="h-3.5 w-3.5" /> Search POs, invoices, suppliers…
      </div>
      <button className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#374151]">
        <Calendar className="h-3.5 w-3.5" /> This month
      </button>
      <Link to="/admin/rfq" className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#10B981] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#059669]">
        <Plus className="h-3.5 w-3.5" /> New RFQ
      </Link>
      <button className="rounded-[9px] border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[#374151]">
        <Bell className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const today = now.toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <DashboardLayout
      title="Admin Dashboard"
      subtitle={`Procurement command centre · ${today}`}
      actions={headerActions}
    >
      {loading ? (
        <SkeletonPage />
      ) : (
        <div className="space-y-3.5 text-[#111827]" style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
          {/* Attention banner */}
          <AttentionBanner attn={attention} />

          {/* Hero KPI Row */}
          <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <KpiGradient
              variant="k1" label="PO VALUE (THIS MONTH)" icon={<Package className="h-4 w-4" />}
              iconBg="rgba(16,185,129,.18)" iconColor="#047857" labelColor="#6B7280"
              value={fmtLNum(k.poValueThisMonth)}
              trend={k.poValueLastMonth ? { dir: k.poValueThisMonth >= k.poValueLastMonth ? 'up' : 'down', pct: Math.abs(((k.poValueThisMonth - k.poValueLastMonth) / k.poValueLastMonth) * 100) } : undefined}
              sparkline={{ data: spendTrend.map((s) => s.po), color: '#10B981' }}
              sub={`${k.openPOs} open POs · ${k.supplierCountThisMonth} suppliers`}
              subColor="#6B7280" to="/purchase-orders" goodIsUp
            />
            <KpiGradient
              variant="k2" label="PENDING INVOICES" icon={<Receipt className="h-4 w-4" />}
              iconBg="rgba(234,88,12,.18)" iconColor="#9A3412" labelColor="#9A3412"
              value={String(k.pendingInvoices)}
              ageing={{ a030: k.a030, a3160: k.a3160, a60: k.a60 }}
              sub={`${fmtLNum(k.pendingAmount)} awaiting payment`}
              subColor="#9A3412" to="/invoices?status=pending"
            />
            <KpiGradient
              variant="k3" label="PAID (THIS MONTH)" icon={<CreditCard className="h-4 w-4" />}
              iconBg="rgba(8,145,178,.18)" iconColor="#0E7490" labelColor="#155E75"
              value={fmtLNum(k.paidThisMonth)}
              trend={k.paidLastMonth ? { dir: k.paidThisMonth >= k.paidLastMonth ? 'up' : 'down', pct: Math.abs(((k.paidThisMonth - k.paidLastMonth) / k.paidLastMonth) * 100) } : undefined}
              sparkline={{ data: spendTrend.map((s) => s.paid), color: '#0891B2' }}
              sub={`Across ${k.paidSupplierCount} suppliers · avg ${k.avgCycle}-day cycle`}
              subColor="#155E75" to="/payments" goodIsUp
            />
            <KpiGradient
              variant="k4" label="ACTIVE SUPPLIERS" icon={<Users className="h-4 w-4" />}
              iconBg="rgba(37,99,235,.18)" iconColor="#1D4ED8" labelColor="#1E40AF"
              value={String(k.activeSupplierCount)}
              trend={{ dir: 'new', pct: k.newThisMonth, customLabel: `${k.newThisMonth} new this month` }}
              sparkline={{ data: spendTrend.map((_, i) => k.activeSupplierCount - (k.newThisMonth * (5 - i) / 5)), color: '#2563EB' }}
              sub={`${k.pendingReg} pending approval · ${k.dormant} dormant`}
              subColor="#1E40AF" to="/admin/suppliers"
            />
          </div>

          {/* Operational velocity */}
          <Card>
            <Title icon={<Gauge className="h-4.5 w-4.5" />} iconColor="#10B981">
              Operational velocity · pipeline cycle times
              <span className="ml-auto flex items-center gap-2.5 text-[12px] font-normal">
                <span className="text-[#6B7280]">Total cycle: <span className="font-medium text-[#111827]">{Math.round(velocity.stages.slice(0, 4).reduce((s, x) => s + (Number(x.days) || 0), 0))} days</span> median</span>
                <Link to="/admin/vendor-scores" className="flex items-center gap-1 text-[#10B981] font-medium">View report <ArrowRight className="h-3 w-3" /></Link>
              </span>
            </Title>
            <div className="flex items-stretch">
              {velocity.stages.map((s, idx) => (
                <div key={s.label} className="flex items-stretch flex-1 min-w-0">
                  <div className={`flex-1 rounded-[11px] border p-3.5 ${
                    s.red ? 'bg-[#FEF2F2] border-[#FECACA]' :
                    s.green ? 'bg-[#ECFDF5] border-[#A7F3D0]' :
                    'bg-[#F9FAFB] border-[#E5E7EB]'
                  }`}>
                    <div className={`text-[10.5px] font-medium tracking-wider ${s.red ? 'text-[#991B1B]' : s.green ? 'text-[#047857]' : 'text-[#6B7280]'}`}>{s.label}</div>
                    <div className={`mt-1 text-[24px] font-medium leading-none tracking-tight ${s.red ? 'text-[#7F1D1D]' : s.green ? 'text-[#065F46]' : 'text-[#111827]'}`}>
                      {typeof s.days === 'number' ? s.days.toFixed(s.isPct ? 0 : 1).replace(/\.0$/, '') : s.days}
                      <span className={`ml-1 text-[13px] font-normal ${s.red ? 'text-[#991B1B]' : s.green ? 'text-[#047857]' : 'text-[#6B7280]'}`}>{s.isPct ? '%' : 'days'}</span>
                    </div>
                    <div className={`mt-1 text-[11px] ${s.red ? 'text-[#991B1B]' : s.green ? 'text-[#047857]' : 'text-[#6B7280]'}`}>
                      {s.inflight} {s.isPct ? 'measured' : 'in flight'}{s.red ? ' · bottleneck' : ''}
                    </div>
                    <div className="mt-2"><Trend dir={s.trend} label={s.trendLabel} goodIsUp={s.green || idx === 4} /></div>
                  </div>
                  {idx < velocity.stages.length - 1 && (
                    <div className="flex items-center px-1.5 text-[#D1D5DB]"><ChevronRight className="h-5 w-5" /></div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3.5 flex items-start gap-2 rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-[12px] text-[#92400E]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Payment cycle is the bottleneck — {k.a60} invoices stuck &gt;60 days. Clear in the AP queue to unblock supplier deliveries.
            </div>
          </Card>

          {/* Charts row */}
          <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.6fr_1fr_1fr]">
            <Card>
              <Title icon={<BarChart3 className="h-4.5 w-4.5" />} iconColor="#10B981">Procurement spend · last 6 months</Title>
              <div className="mb-3 flex gap-4 text-[11.5px]">
                <Legend dot="#10B981" label="PO Value" />
                <Legend dot="#0891B2" label="Paid" />
                <Legend dot="#F59E0B" label="Outstanding" />
              </div>
              <SpendChart data={spendTrend} />
            </Card>
            <Card>
              <Title icon={<PieIcon className="h-4.5 w-4.5" />} iconColor="#F59E0B">AP aging</Title>
              <ApAgingDonut a030={apAging.a030} a3160={apAging.a3160} a60={apAging.a60} />
            </Card>
            <Card>
              <Title icon={<GitCompare className="h-4.5 w-4.5" />} iconColor="#7C3AED">3-Way match</Title>
              <div className="text-[28px] font-medium leading-none">{matchSummary.rate}<span className="text-[15px] font-normal text-[#6B7280]">%</span></div>
              <div className="mt-1.5 mb-4 text-[11.5px] text-[#6B7280]">Match rate · last 30 days</div>
              <MatchBar icon={<CircleCheck className="h-3 w-3 text-[#10B981]" />} label="Matched" count={matchSummary.matched} pct={matchSummary.total ? (matchSummary.matched / matchSummary.total) * 100 : 0} color="#10B981" labelColor="#047857" />
              <MatchBar icon={<Clock className="h-3 w-3 text-[#F59E0B]" />} label="Awaiting GRN" count={matchSummary.awaiting} pct={matchSummary.total ? (matchSummary.awaiting / matchSummary.total) * 100 : 0} color="#F59E0B" labelColor="#92400E" />
              <MatchBar icon={<AlertTriangle className="h-3 w-3 text-[#DC2626]" />} label="Exception" count={matchSummary.exception} pct={matchSummary.total ? (matchSummary.exception / matchSummary.total) * 100 : 0} color="#DC2626" labelColor="#991B1B" />
            </Card>
          </div>

          {/* Suppliers + items */}
          <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
            <Card>
              <Title icon={<Trophy className="h-4.5 w-4.5" />} iconColor="#10B981">
                Top suppliers · this month
                <Link to="/admin/suppliers" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
              </Title>
              {topSuppliers.length === 0 ? <Empty>No supplier activity this month.</Empty> : topSuppliers.map((s, i) => (
                <Row key={s.sid}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[10.5px] font-medium" style={{ background: AVATAR_BG[i % 5], color: AVATAR_FG[i % 5] }}>{s.initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{s.name}</div>
                    <div className="text-[11px] text-[#6B7280]">{s.poCount} POs · perf {s.score}/100</div>
                  </div>
                  <div className="w-[110px]">
                    <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#F3F4F6]">
                      <div className="h-full rounded-[3px]" style={{ width: `${s.score}%`, background: s.score >= 85 ? '#10B981' : s.score >= 70 ? '#F59E0B' : '#DC2626' }} />
                    </div>
                  </div>
                  <div className="min-w-[78px] text-right">
                    <div className="text-[13px] font-medium">{fmtLNum(s.value)}</div>
                    <div className="mt-0.5">{s.isNew ? <Trend dir="new" label="new" /> : <Trend dir={s.mom >= 0 ? 'up' : 'down'} label={`${Math.abs(s.mom).toFixed(0)}%`} goodIsUp />}</div>
                  </div>
                </Row>
              ))}
            </Card>
            <Card>
              <Title icon={<Box className="h-4.5 w-4.5" />} iconColor="#10B981">
                Top items by PO value
                <Link to="/purchase-orders" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View SKUs <ArrowRight className="h-3 w-3" /></Link>
              </Title>
              <div className="mb-2.5 text-[11.5px] text-[#6B7280]">{fmtLNum(categoryMix.total)} across <span className="font-medium text-[#111827]">{categoryMix.skus} SKUs</span> · {categoryMix.cats.filter((c) => c.pct > 0).length} categories</div>
              <div className="mb-2.5 flex h-[7px] overflow-hidden rounded-[4px]">
                {categoryMix.cats.map((c) => c.pct > 0 && <div key={c.name} style={{ flex: c.pct, background: c.color }} />)}
              </div>
              <div className="mb-1.5 flex flex-wrap gap-3 text-[10.5px] text-[#6B7280]">
                {categoryMix.cats.map((c) => c.pct > 0 && (
                  <span key={c.name} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name} {c.pct}%</span>
                ))}
              </div>
              {topItems.length === 0 ? <Empty>No items invoiced this month.</Empty> : topItems.map((it, idx) => (
                <Row key={idx}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]" style={{ background: CAT_BG[it.category] || '#F3F4F6', color: CAT_FG[it.category] || '#6B7280' }}>
                    <Package className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium">{it.name}</span>
                      <span className="rounded-[5px] px-1.5 py-px text-[9.5px] font-medium tracking-wider" style={{ background: CAT_BG[it.category] || '#F3F4F6', color: CAT_FG[it.category] || '#6B7280' }}>{it.category.toUpperCase()}</span>
                    </div>
                    <div className="truncate text-[11px] text-[#6B7280]">{it.count} POs · {it.topSupplier}</div>
                  </div>
                  <div className="min-w-[78px] text-right">
                    <div className="text-[13px] font-medium">{fmtLNum(it.value)}</div>
                  </div>
                </Row>
              ))}
            </Card>
          </div>

          {/* Insights + calendar */}
          <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <Title icon={<Sparkles className="h-4.5 w-4.5" />} iconColor="#7C3AED">
                AI insights · this week
                <Link to="/admin/ai-insights" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
              </Title>
              {insights.length === 0 ? <Empty>Looking good — nothing pressing.</Empty> : insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
            </Card>
            <Card>
              <Title icon={<Calendar className="h-4.5 w-4.5" />} iconColor="#10B981">
                This week
                <Link to="/purchase-orders" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View calendar <ArrowRight className="h-3 w-3" /></Link>
              </Title>
              <div className="mb-3 flex flex-wrap gap-3.5 text-[11.5px] text-[#6B7280]">
                <Legend icon={<Truck className="h-3 w-3 text-[#10B981]" />} label="Deliveries" />
                <Legend icon={<Receipt className="h-3 w-3 text-[#F59E0B]" />} label="Bills due" />
                <Legend icon={<Clock className="h-3 w-3 text-[#DC2626]" />} label="RFQs closing" />
                <Legend icon={<CreditCard className="h-3 w-3 text-[#2563EB]" />} label="Payments" />
              </div>
              <div className="flex gap-1.5">
                {week.map((d, i) => (
                  <div key={i} className={`flex-1 min-w-0 rounded-[10px] border p-2 text-center ${
                    d.isToday ? 'bg-white border-[1.5px] border-[#10B981] shadow-[0_0_0_3px_rgba(16,185,129,0.08)]' :
                    d.isWeekend || d.empty ? 'bg-[#FAFAFA] border-[#E5E7EB]' : 'bg-[#F9FAFB] border-[#E5E7EB]'
                  }`}>
                    <div className={`text-[10px] font-medium tracking-wider ${d.isToday ? 'text-[#047857]' : d.isWeekend || d.empty ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>{d.name}</div>
                    <div className={`my-1 text-[20px] font-medium leading-none ${d.isToday ? 'text-[#047857]' : d.isWeekend || d.empty ? 'text-[#9CA3AF]' : 'text-[#111827]'}`}>{d.num}</div>
                    {d.empty ? <div className="text-[10.5px] text-[#9CA3AF] mt-2">—</div> : (
                      <div className="space-y-1">
                        {d.deliveries > 0 && <DayEv bg="#ECFDF5" fg="#047857" icon={<Truck className="h-2.5 w-2.5" />} count={d.deliveries} />}
                        {d.billsDue > 0 && <DayEv bg="#FFFBEB" fg="#92400E" icon={<Receipt className="h-2.5 w-2.5" />} count={d.billsDue} />}
                        {d.rfqsClosing > 0 && <DayEv bg="#FEF2F2" fg="#991B1B" icon={<Clock className="h-2.5 w-2.5" />} count={d.rfqsClosing} />}
                        {d.pays > 0 && <DayEv bg="#EFF6FF" fg="#1E40AF" icon={<CreditCard className="h-2.5 w-2.5" />} count={d.pays} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {attention.rfqClosing > 0 && (
                <div className="mt-3.5 flex items-start gap-2 rounded-[9px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-[12px] text-[#991B1B]">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div><span className="font-medium">Heads up:</span> {attention.rfqClosing} RFQ{attention.rfqClosing > 1 ? 's' : ''} closing in the next 48 hours. Review supplier responses now.</div>
                </div>
              )}
            </Card>
          </div>

          {/* Recent transactions */}
          <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
            <Card>
              <Title icon={<Package className="h-4.5 w-4.5" />} iconColor="#10B981">
                Recent purchase orders
                <Link to="/purchase-orders" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
              </Title>
              {recentPOs.length === 0 ? <Empty>No purchase orders yet</Empty> : recentPOs.map((p: any) => (
                <Row key={p.id}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{p.po_number}</div>
                    <div className="truncate text-[11px] uppercase tracking-wider text-[#6B7280]">{supplierById[p.supplier_id]?.company || '—'} · {fmtShort(p.date)}</div>
                  </div>
                  <div className="text-[13px] font-medium text-right">{fmtL(Number(p.amount || 0))}</div>
                  <Badge kind={statusToBadge(p.status)}>{statusToBadge(p.status) === 'paid' ? 'Paid' : statusToBadge(p.status) === 'partial' ? 'Partial' : 'Pending'}</Badge>
                </Row>
              ))}
            </Card>
            <Card>
              <Title icon={<Receipt className="h-4.5 w-4.5" />} iconColor="#EA580C">
                Recent invoices
                <Link to="/invoices" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
              </Title>
              {recentInvoices.length === 0 ? <Empty>No invoices yet</Empty> : recentInvoices.map((i: any) => (
                <Row key={i.id}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{i.invoice_number}</div>
                    <div className="truncate text-[11px] uppercase tracking-wider text-[#6B7280]">{supplierById[i.supplier_id]?.company || '—'} · {fmtShort(i.date)}</div>
                  </div>
                  <div className="text-[13px] font-medium text-right">{fmtL(Number(i.amount || 0))}</div>
                  <Badge kind={statusToBadge(i.status)}>{statusToBadge(i.status) === 'paid' ? 'Paid' : statusToBadge(i.status) === 'partial' ? 'Partial' : 'Pending'}</Badge>
                </Row>
              ))}
            </Card>
          </div>

          {/* Activity feed */}
          <Card>
            <Title icon={<Activity className="h-4.5 w-4.5" />} iconColor="#10B981">
              Activity feed
              <Link to="/admin/ai-insights" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View full log <ArrowRight className="h-3 w-3" /></Link>
            </Title>
            <ActivityFeed invoices={invoices} pos={pos} rfqRows={rfqRows} challans={challans} registrations={registrations} supplierById={supplierById} />
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}

// ─── helpers / sub-components ────────────────────────────────────────────
const AVATAR_BG = ['#ECFDF5', '#EFF6FF', '#FFF7ED', '#F3E8FF', '#FCE7F3'];
const AVATAR_FG = ['#047857', '#1E40AF', '#9A3412', '#6B21A8', '#9D174D'];
const CAT_BG: Record<string, string> = { Packaging: '#DBEAFE', POSM: '#FEF3C7', Printing: '#EDE9FE', Services: '#D1FAE5', Stationery: '#FCE7F3' };
const CAT_FG: Record<string, string> = { Packaging: '#1E40AF', POSM: '#92400E', Printing: '#5B21B6', Services: '#065F46', Stationery: '#9D174D' };

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (/(carton|box|shrink|sleeve|wrap|pack|pouch|bag|seal)/.test(n)) return 'Packaging';
  if (/(standee|display|posm|signage|banner|poster)/.test(n)) return 'POSM';
  if (/(print|tag|label|sticker|card)/.test(n)) return 'Printing';
  if (/(service|consult|design|install)/.test(n)) return 'Services';
  if (/(pen|paper|notebook|stationery|file)/.test(n)) return 'Stationery';
  return 'Packaging';
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[12px] border border-[#E5E7EB] bg-white p-[18px] ${className}`}>{children}</div>;
}
function Title({ icon, iconColor, children }: { icon: React.ReactNode; iconColor: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 text-[14px] font-medium">
      <span style={{ color: iconColor }} className="flex items-center">{icon}</span>{children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-b border-[#F3F4F6] py-2.5 last:border-0">{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-[12px] text-[#9CA3AF]">{children}</div>;
}
function Legend({ dot, icon, label }: { dot?: string; icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#4B5563]">
      {dot ? <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> : icon}{label}
    </span>
  );
}
function DayEv({ bg, fg, icon, count }: { bg: string; fg: string; icon: React.ReactNode; count: number }) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-[5px] px-1 py-0.5 text-[10.5px] font-medium" style={{ background: bg, color: fg }}>
      {icon}{count}
    </div>
  );
}

function KpiGradient(props: {
  variant: 'k1' | 'k2' | 'k3' | 'k4';
  label: string; value: string; icon: React.ReactNode; iconBg: string; iconColor: string; labelColor: string;
  trend?: { dir: 'up' | 'down' | 'new'; pct: number; customLabel?: string };
  sparkline?: { data: number[]; color: string };
  ageing?: { a030: number; a3160: number; a60: number };
  sub: string; subColor: string;
  to?: string; goodIsUp?: boolean;
}) {
  const gradients = {
    k1: 'bg-gradient-to-br from-[#ECFDF5] to-[#D1FAE5] border-[#A7F3D0]',
    k2: 'bg-gradient-to-br from-[#FFF7ED] to-[#FED7AA] border-[#FDBA74]',
    k3: 'bg-gradient-to-br from-[#ECFEFF] to-[#A5F3FC] border-[#67E8F9]',
    k4: 'bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] border-[#93C5FD]',
  };
  const inner = (
    <div className={`rounded-[14px] border p-[17px] transition-shadow hover:shadow-sm ${gradients[props.variant]}`}>
      <div className="flex items-start justify-between">
        <div className="text-[10.5px] font-medium tracking-wider" style={{ color: props.labelColor }}>{props.label}</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ background: props.iconBg, color: props.iconColor }}>{props.icon}</div>
      </div>
      <div className="mt-2 text-[32px] font-medium leading-none tracking-tight">{props.value}</div>
      {props.ageing ? (
        <>
          <div className="mt-2 flex h-[7px] gap-[3px] overflow-hidden rounded-[4px]">
            {props.ageing.a030 > 0 && <div style={{ flex: props.ageing.a030, background: '#FCD34D' }} />}
            {props.ageing.a3160 > 0 && <div style={{ flex: props.ageing.a3160, background: '#FB923C' }} />}
            {props.ageing.a60 > 0 && <div style={{ flex: props.ageing.a60, background: '#DC2626' }} />}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-[#9A3412]">
            <span>0-30 ({props.ageing.a030})</span>
            <span>31-60 ({props.ageing.a3160})</span>
            <span className="font-medium text-[#991B1B]">60+ ({props.ageing.a60})</span>
          </div>
        </>
      ) : (
        <div className="mt-1.5 flex items-center gap-2.5">
          {props.trend && (props.trend.customLabel
            ? <Trend dir={props.trend.dir} label={props.trend.customLabel} goodIsUp={props.goodIsUp} />
            : <Trend dir={props.trend.dir} label={`${props.trend.pct.toFixed(0)}% vs last mo`} goodIsUp={props.goodIsUp} />
          )}
          {props.sparkline && <Sparkline data={props.sparkline.data} stroke={props.sparkline.color} />}
        </div>
      )}
      <div className="mt-1.5 text-[11.5px]" style={{ color: props.subColor }}>{props.sub}</div>
    </div>
  );
  return props.to ? <Link to={props.to}>{inner}</Link> : inner;
}

function AttentionBanner({ attn }: { attn: any }) {
  const chips: { count: number; bg: string; fg: string; label: string; icon: React.ReactNode; to: string }[] = [
    { count: attn.poApprovals, bg: '#FEF3C7', fg: '#92400E', label: `${attn.poApprovals} PO approvals pending`, icon: <FileText className="h-3 w-3" />, to: '/admin/exception-requests' },
    { count: attn.rfqClosing, bg: '#FEE2E2', fg: '#991B1B', label: `${attn.rfqClosing} RFQ closes in ${attn.rfqHours || 24} hrs`, icon: <Clock className="h-3 w-3" />, to: '/admin/rfq' },
    { count: attn.invoiceOverdue, bg: '#FED7AA', fg: '#9A3412', label: `${attn.invoiceOverdue} invoices · 60+ days overdue`, icon: <IndianRupee className="h-3 w-3" />, to: '/invoices?status=pending' },
    { count: attn.newRegs, bg: '#DBEAFE', fg: '#1E40AF', label: `${attn.newRegs} new supplier registrations`, icon: <UserPlus className="h-3 w-3" />, to: '/admin/registrations' },
    { count: attn.matchExceptions, bg: '#E0E7FF', fg: '#3730A3', label: `${attn.matchExceptions} three-way match exceptions`, icon: <AlertTriangle className="h-3 w-3" />, to: '/admin/three-way-match' },
  ].filter((c) => c.count > 0);

  if (chips.length === 0) {
    return (
      <div className="flex items-center gap-3.5 rounded-[11px] border border-[#A7F3D0] border-l-[3px] border-l-[#10B981] bg-white px-4 py-3 text-[13px] font-medium text-[#047857]">
        <CheckCheck className="h-4 w-4" /> Looking good — nothing needs your attention.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-[11px] border border-[#FECACA] border-l-[3px] border-l-[#F59E0B] bg-white px-4 py-3">
      <div className="inline-flex items-center gap-2 text-[13px] font-medium text-[#92400E]">
        <Bell className="h-4 w-4" /> Needs your attention
      </div>
      {chips.map((c, i) => (
        <Link key={i} to={c.to} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[14px] px-3 py-1 text-[12px] font-medium" style={{ background: c.bg, color: c.fg }}>
          {c.icon}{c.label}
        </Link>
      ))}
    </div>
  );
}

function SpendChart({ data }: { data: { label: string; po: number; paid: number }[] }) {
  const max = Math.max(...data.flatMap((d) => [d.po, d.paid]), 1);
  const niceMax = Math.ceil(max / 1500000) * 1500000 || 6000000;
  const h = 190, w = 460, top = 12, bottom = 24, chartH = h - top - bottom;
  const groupW = (w - 36) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[190px] w-full">
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line x1="36" y1={top + chartH * (1 - p)} x2={w - 10} y2={top + chartH * (1 - p)} stroke="#F3F4F6" strokeDasharray="2,3" />
          <text x="30" y={top + chartH * (1 - p) + 3} textAnchor="end" fontSize="9" fill="#9CA3AF">{fmtLNum(niceMax * p).replace(' ', '')}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = 40 + i * groupW;
        const poH = (d.po / niceMax) * chartH;
        const paidH = (d.paid / niceMax) * chartH;
        return (
          <g key={i}>
            <rect x={x} y={top + chartH - poH} width="20" height={poH} fill="#10B981" rx="2" />
            <rect x={x + 22} y={top + chartH - paidH} width="20" height={paidH} fill="#0891B2" rx="2" />
            <text x={x + 21} y={h - 8} textAnchor="middle" fontSize="10" fill="#6B7280">{d.label}</text>
          </g>
        );
      })}
      {/* outstanding polyline */}
      <polyline
        fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeDasharray="4,3"
        points={data.map((d, i) => {
          const o = Math.max(0, d.po - d.paid);
          const x = 40 + i * groupW + 21;
          const y = top + chartH - (o / niceMax) * chartH;
          return `${x},${y}`;
        }).join(' ')}
      />
    </svg>
  );
}

function ApAgingDonut({ a030, a3160, a60 }: { a030: number; a3160: number; a60: number }) {
  const total = a030 + a3160 + a60;
  const C = 2 * Math.PI * 44;
  const s1 = total ? (a030 / total) * C : 0;
  const s2 = total ? (a3160 / total) * C : 0;
  const s3 = total ? (a60 / total) * C : 0;
  return (
    <div className="flex items-center gap-3.5">
      <svg width="130" height="130" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="44" fill="none" stroke="#F3F4F6" strokeWidth="15" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="#FCD34D" strokeWidth="15" strokeDasharray={`${s1} ${C - s1}`} transform="rotate(-90 60 60)" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="#FB923C" strokeWidth="15" strokeDasharray={`${s2} ${C - s2}`} strokeDashoffset={`-${s1}`} transform="rotate(-90 60 60)" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="#DC2626" strokeWidth="15" strokeDasharray={`${s3} ${C - s3}`} strokeDashoffset={`-${s1 + s2}`} transform="rotate(-90 60 60)" />
        <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="500" fill="#111827">{fmtLNum(total).replace('₹', '₹')}</text>
        <text x="60" y="73" textAnchor="middle" fontSize="10" fill="#6B7280">total AP</text>
      </svg>
      <div className="flex-1 text-[12px]">
        <div className="flex justify-between border-b border-[#F3F4F6] py-1.5"><Legend dot="#FCD34D" label="0-30 d" /><span className="font-medium">{fmtLNum(a030)}</span></div>
        <div className="flex justify-between border-b border-[#F3F4F6] py-1.5"><Legend dot="#FB923C" label="31-60 d" /><span className="font-medium">{fmtLNum(a3160)}</span></div>
        <div className="flex justify-between py-1.5"><Legend dot="#DC2626" label="60+ d" /><span className="font-medium text-[#991B1B]">{fmtLNum(a60)}</span></div>
      </div>
    </div>
  );
}

function MatchBar({ icon, label, count, pct, color, labelColor }: { icon: React.ReactNode; label: string; count: number; pct: number; color: string; labelColor: string }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
        <span className="font-medium" style={{ color: labelColor }}>{count}</span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#F3F4F6]">
        <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function InsightCard({ kind, title, body }: { kind: 'purple' | 'amber' | 'red' | 'green'; title: string; body: string }) {
  const cfg = {
    purple: { bg: '#F5F3FF', border: '#DDD6FE', accent: '#7C3AED', tColor: '#5B21B6', icon: <Lightbulb className="h-4 w-4" /> },
    amber: { bg: '#FFFBEB', border: '#FDE68A', accent: '#F59E0B', tColor: '#92400E', icon: <TrendingUp className="h-4 w-4" /> },
    red: { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626', tColor: '#991B1B', icon: <Clock className="h-4 w-4" /> },
    green: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#10B981', tColor: '#065F46', icon: <Award className="h-4 w-4" /> },
  }[kind];
  return (
    <div className="mb-2.5 flex gap-2.5 rounded-[9px] border p-3 last:mb-0" style={{ background: cfg.bg, borderColor: cfg.border, borderLeftWidth: 3, borderLeftColor: cfg.accent }}>
      <div className="mt-px shrink-0" style={{ color: cfg.accent }}>{cfg.icon}</div>
      <div>
        <div className="mb-1 text-[12.5px] font-medium" style={{ color: cfg.tColor }}>{title}</div>
        <div className="text-[11.5px] leading-snug text-[#374151]">{body}</div>
      </div>
    </div>
  );
}

function ActivityFeed({ invoices, pos, rfqRows, challans, registrations, supplierById }: any) {
  const events: { icon: React.ReactNode; bg: string; fg: string; body: React.ReactNode; meta: string; at: number }[] = [];
  invoices.slice(0, 4).forEach((i: any) => {
    const s = supplierById[i.supplier_id];
    events.push({
      icon: <CircleCheck className="h-3.5 w-3.5" />, bg: '#ECFDF5', fg: '#047857',
      body: <><span className="font-medium">{s?.company || '—'}</span> uploaded bill <span className="text-[#10B981]">{i.invoice_number}</span>{i.po_number ? <> against PO {i.po_number}</> : null}</>,
      meta: `${relTime(i.created_at)} · ${String(i.status || 'pending')}`, at: new Date(i.created_at).getTime(),
    });
  });
  rfqRows.slice(0, 3).filter((r: any) => r.status === 'quote_submitted').forEach((r: any) => {
    events.push({
      icon: <Sparkles className="h-3.5 w-3.5" />, bg: '#F5F3FF', fg: '#7C3AED',
      body: <>AI parsed quote from <span className="font-medium">{r.supplier_email}</span> · <span className="text-[#10B981]">{r.rfq_id}</span></>,
      meta: `${relTime(r.updated_at || r.created_at)}`, at: new Date(r.updated_at || r.created_at).getTime(),
    });
  });
  challans.slice(0, 2).forEach((c: any) => {
    events.push({
      icon: <Truck className="h-3.5 w-3.5" />, bg: '#FFF7ED', fg: '#9A3412',
      body: <>Delivery challan <span className="font-medium">{c.challan_number}</span> generated</>,
      meta: `${relTime(c.created_at)}`, at: new Date(c.created_at).getTime(),
    });
  });
  registrations.slice(0, 2).filter((r: any) => String(r.status) === 'pending').forEach((r: any) => {
    events.push({
      icon: <UserPlus className="h-3.5 w-3.5" />, bg: '#EFF6FF', fg: '#1E40AF',
      body: <><span className="font-medium">{r.company || r.name || 'New supplier'}</span> registered · pending approval</>,
      meta: `${relTime(r.created_at)}`, at: new Date(r.created_at).getTime(),
    });
  });
  const sorted = events.sort((a, b) => b.at - a.at).slice(0, 6);
  if (sorted.length === 0) return <Empty>No activity yet</Empty>;
  return (
    <div>
      {sorted.map((e, i) => (
        <div key={i} className="flex gap-3.5 border-t border-[#F3F4F6] py-2 first:border-0">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full" style={{ background: e.bg, color: e.fg }}>{e.icon}</div>
          <div className="flex-1">
            <div className="text-[12.5px]">{e.body}</div>
            <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{e.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function relTime(iso?: string) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 604800) return `${Math.floor(d / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function SkeletonPage() {
  return (
    <div className="space-y-3.5">
      <div className="h-14 animate-pulse rounded-[11px] bg-[#F3F4F6]" />
      <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[136px] animate-pulse rounded-[14px] bg-[#F3F4F6]" />)}
      </div>
      <div className="h-[180px] animate-pulse rounded-[12px] bg-[#F3F4F6]" />
      <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.6fr_1fr_1fr]">
        {[0, 1, 2].map((i) => <div key={i} className="h-[240px] animate-pulse rounded-[12px] bg-[#F3F4F6]" />)}
      </div>
      <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-[300px] animate-pulse rounded-[12px] bg-[#F3F4F6]" />)}
      </div>
    </div>
  );
}
