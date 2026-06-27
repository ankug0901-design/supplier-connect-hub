import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package, Receipt, CreditCard, Wallet, FileText, Truck, Users, ClipboardList,
  AlertCircle, Bell, Search, Calendar, Plus, Gauge, ChevronRight, ArrowRight,
  ArrowUpRight, ArrowDownRight, Minus, Info, PieChart as PieIcon, FileQuestion,
  Activity, Award, CheckCircle, Clock, Sparkles, CheckCheck, IndianRupee,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentPOTable } from '@/components/dashboard/RecentPOTable';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { PerformanceCard } from '@/components/dashboard/PerformanceCard';
import { PaymentPredictionCard } from '@/components/dashboard/PaymentPredictionCard';
import { Button } from '@/components/ui/button';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { SupplierAssistant } from '@/components/SupplierAssistant';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchPurchaseOrders, fetchInvoices, fetchPayments } from '@/services/api';
import {
  useSupplierDashboard,
  type SupplierVelocityStage,
  type ActiveRfqItem,
  type SupplierActivityEvent,
} from '@/hooks/useSupplierDashboard';

// ─── shared helpers (mirrors AdminDashboard) ────────────────────────────
function fmtLakh(n: number | null | undefined) {
  const v = Number(n || 0);
  if (!v) return '₹0 L';
  if (v >= 100) return `₹${(v / 100).toFixed(2)} Cr`;
  return `₹${v.toFixed(2)} L`;
}
function fmtINR(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}
function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  if (!data || !data.length) return null;
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
function Trend({ dir, label, goodIsUp = true }: { dir: 'up' | 'down' | 'flat' | 'new'; label: string; goodIsUp?: boolean }) {
  let color = '#6B7280', bg = '#F3F4F6';
  if (dir === 'up') {
    color = goodIsUp ? '#047857' : '#9A3412';
    bg = goodIsUp ? 'rgba(16,185,129,.15)' : 'rgba(234,88,12,.15)';
  } else if (dir === 'down') {
    color = !goodIsUp ? '#047857' : '#9A3412';
    bg = !goodIsUp ? 'rgba(16,185,129,.15)' : 'rgba(234,88,12,.15)';
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
function relTime(iso?: string) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 604800) return `${Math.floor(d / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── KPI gradient (mirrors admin layout exactly) ────────────────────────
function KpiGradient(props: {
  variant: 'k1' | 'k2' | 'k3' | 'k4';
  label: string; value: string; icon: React.ReactNode; iconBg: string; iconColor: string; labelColor: string;
  trend?: { dir: 'up' | 'down' | 'new'; pct: number; customLabel?: string };
  sparkline?: { data: number[]; color: string };
  ageing?: { a030: number; a3160: number; a60: number; amount?: number };
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
            {(props.ageing.a030 + props.ageing.a3160 + props.ageing.a60) === 0 && <div style={{ flex: 1, background: '#F3F4F6' }} />}
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

// ─── Attention banner (supplier-scoped) ─────────────────────────────────
function AttentionBanner({ a }: { a: ReturnType<typeof useSupplierDashboard>['data']['attention'] }) {
  if (!a) return null;
  const chips: { count: number; bg: string; fg: string; label: string; icon: React.ReactNode; to: string }[] = [
    { count: a.pos_awaiting_invoice, bg: '#FEF3C7', fg: '#92400E', icon: <FileText className="h-3 w-3" />, label: `${a.pos_awaiting_invoice} POs awaiting invoice submission`, to: '/purchase-orders?status=pending' },
    { count: a.invoices_overdue, bg: '#FED7AA', fg: '#9A3412', icon: <IndianRupee className="h-3 w-3" />, label: `${a.invoices_overdue} invoices · overdue from Emboss`, to: '/invoices?filter=overdue' },
    { count: a.open_rfqs, bg: '#DBEAFE', fg: '#1E40AF', icon: <FileQuestion className="h-3 w-3" />, label: `${a.open_rfqs} open RFQs · quote pending`, to: '/rfq-requests?status=open' },
    { count: a.deliveries_this_week, bg: '#E0E7FF', fg: '#3730A3', icon: <Truck className="h-3 w-3" />, label: `${a.deliveries_this_week} deliveries scheduled this week`, to: '/delivery-challan' },
    { count: a.new_pos_this_week, bg: '#D1FAE5', fg: '#065F46', icon: <Package className="h-3 w-3" />, label: `${a.new_pos_this_week} new POs received this week`, to: '/purchase-orders?filter=new' },
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

// ─── Velocity strip ─────────────────────────────────────────────────────
function VelocityStrip({ velocity }: { velocity: ReturnType<typeof useSupplierDashboard>['data']['velocity'] }) {
  const navigate = useNavigate();
  if (!velocity) return null;
  const stages = [...velocity.stages] as Array<SupplierVelocityStage & { red?: boolean }>;
  if (stages.length) {
    const longestIdx = stages.reduce((m, s, i, arr) => (s.median_days > arr[m].median_days ? i : m), 0);
    stages[longestIdx].red = true;
  }
  const routeFor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('invoice') && n.includes('paid')) return '/payments';
    if (n.includes('po') && n.includes('invoice')) return '/invoices/upload';
    if (n.includes('delivery')) return '/delivery-challan';
    return '/purchase-orders';
  };
  const bottleneck = stages.find((s) => s.red);
  const tip = bottleneck && bottleneck.name.toLowerCase().includes('po')
    ? `Your invoice turnaround averages ${bottleneck.median_days}d — invoicing within 3d of PO speeds up payment.`
    : bottleneck && bottleneck.name.toLowerCase().includes('paid')
    ? `Payments from Emboss are averaging ${bottleneck.median_days}d after invoicing — flag overdue invoices in the attention banner above.`
    : bottleneck ? `Slowest stage: ${bottleneck.name} (${bottleneck.median_days}d median). Worth optimising.` : null;

  return (
    <div role="button" tabIndex={0} className="cursor-pointer rounded-[12px] transition-all duration-150 hover:shadow-sm"
      onClick={() => navigate('/purchase-orders')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/purchase-orders'); } }}>
      <Card>
        <Title icon={<Gauge className="h-4.5 w-4.5" />} iconColor="#10B981">
          My pipeline · cycle times
          <span className="ml-auto flex items-center gap-2.5 text-[12px] font-normal">
            <span className="text-[#6B7280]">Total cycle: <span className="font-medium text-[#111827]">{Math.round(velocity.total_cycle_days)} days</span></span>
            <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/purchase-orders'); }} className="flex items-center gap-1 text-[#10B981] font-medium hover:underline">
              View report <ArrowRight className="h-3 w-3" />
            </button>
          </span>
        </Title>
        <div className="flex items-stretch overflow-x-auto">
          {stages.map((s, idx) => {
            const dir: 'up' | 'down' | 'flat' = s.delta_days > 0 ? 'up' : s.delta_days < 0 ? 'down' : 'flat';
            const label = s.delta_days === 0 ? 'flat' : `${Math.abs(s.delta_days).toFixed(1)}d ${s.delta_days > 0 ? 'slower' : 'faster'}`;
            const route = routeFor(s.name);
            return (
              <div key={s.name} className="flex items-stretch flex-1 min-w-[180px]">
                <div role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); navigate(route); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(route); } }}
                  className={`flex-1 rounded-[11px] border p-3.5 cursor-pointer transition-all duration-150 hover:shadow-sm ${
                    s.red ? 'bg-[#FEF2F2] border-[#FECACA] hover:bg-[#FEE2E2]' : 'bg-[#F9FAFB] border-[#E5E7EB] hover:bg-gray-50'
                  }`}>
                  <div className={`text-[10.5px] font-medium tracking-wider ${s.red ? 'text-[#991B1B]' : 'text-[#6B7280]'}`}>{s.name.toUpperCase()}</div>
                  <div className={`mt-1 text-[24px] font-medium leading-none tracking-tight ${s.red ? 'text-[#7F1D1D]' : 'text-[#111827]'}`}>
                    {Number(s.median_days || 0).toFixed(1).replace(/\.0$/, '')}
                    <span className={`ml-1 text-[13px] font-normal ${s.red ? 'text-[#991B1B]' : 'text-[#6B7280]'}`}>days</span>
                  </div>
                  <div className={`mt-1 text-[11px] ${s.red ? 'text-[#991B1B]' : 'text-[#6B7280]'}`}>{s.in_flight} in flight{s.red ? ' · bottleneck' : ''}</div>
                  <div className="mt-2"><Trend dir={dir} label={label} goodIsUp={false} /></div>
                </div>
                <div className="flex items-center px-1.5 text-[#D1D5DB]"><ChevronRight className="h-5 w-5" /></div>
              </div>
            );
          })}
          <div className="flex items-stretch flex-1 min-w-[180px]">
            <div role="button" tabIndex={0}
              onClick={(e) => { e.stopPropagation(); navigate('/delivery-challan'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate('/delivery-challan'); } }}
              className="flex-1 rounded-[11px] border p-3.5 bg-[#ECFDF5] border-[#A7F3D0] cursor-pointer transition-all duration-150 hover:bg-[#D1FAE5] hover:shadow-sm">
              <div className="text-[10.5px] font-medium tracking-wider text-[#047857]">ON-TIME DELIVERY</div>
              <div className="mt-1 text-[24px] font-medium leading-none tracking-tight text-[#065F46]">
                {Number(velocity.on_time_delivery_pct || 0).toFixed(0)}
                <span className="ml-1 text-[13px] font-normal text-[#047857]">%</span>
              </div>
              <div className="mt-1 text-[11px] text-[#047857]">last 30 days</div>
              <div className="mt-2">
                <Trend dir={velocity.on_time_delta > 0 ? 'up' : velocity.on_time_delta < 0 ? 'down' : 'flat'}
                  label={velocity.on_time_delta === 0 ? 'flat' : `${Math.abs(velocity.on_time_delta).toFixed(1)}%`} goodIsUp />
              </div>
            </div>
          </div>
        </div>
        {tip && (
          <div className="mt-3.5 flex items-start gap-2 rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-[12px] text-[#92400E]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />{tip}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Receivables Aging donut ────────────────────────────────────────────
function ReceivablesDonut({ a030, a3160, a60 }: { a030: number; a3160: number; a60: number }) {
  const total = a030 + a3160 + a60;
  const C = 2 * Math.PI * 44;
  const s1 = total ? (a030 / total) * C : 0;
  const s2 = total ? (a3160 / total) * C : 0;
  const s3 = total ? (a60 / total) * C : 0;
  return (
    <div className="flex items-center gap-3.5">
      <svg width="130" height="130" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="44" fill="none" stroke="#F3F4F6" strokeWidth="15" />
        {total > 0 && <>
          <circle cx="60" cy="60" r="44" fill="none" stroke="#FCD34D" strokeWidth="15" strokeDasharray={`${s1} ${C - s1}`} transform="rotate(-90 60 60)" />
          <circle cx="60" cy="60" r="44" fill="none" stroke="#FB923C" strokeWidth="15" strokeDasharray={`${s2} ${C - s2}`} strokeDashoffset={`-${s1}`} transform="rotate(-90 60 60)" />
          <circle cx="60" cy="60" r="44" fill="none" stroke="#DC2626" strokeWidth="15" strokeDasharray={`${s3} ${C - s3}`} strokeDashoffset={`-${s1 + s2}`} transform="rotate(-90 60 60)" />
        </>}
        <text x="60" y="58" textAnchor="middle" fontSize="14" fontWeight="500" fill="#111827">{fmtLakh(total)}</text>
        <text x="60" y="73" textAnchor="middle" fontSize="10" fill="#6B7280">outstanding</text>
      </svg>
      <div className="flex-1 text-[12px]">
        <div className="flex justify-between border-b border-[#F3F4F6] py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FCD34D]" />0-30 d</span><span className="font-medium">{fmtLakh(a030)}</span></div>
        <div className="flex justify-between border-b border-[#F3F4F6] py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FB923C]" />31-60 d</span><span className="font-medium">{fmtLakh(a3160)}</span></div>
        <div className="flex justify-between py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#DC2626]" />60+ d</span><span className="font-medium text-[#991B1B]">{fmtLakh(a60)}</span></div>
      </div>
    </div>
  );
}

// ─── Active RFQs card ───────────────────────────────────────────────────
function ActiveRfqs({ rfqs }: { rfqs: ReturnType<typeof useSupplierDashboard>['data']['rfqs'] }) {
  const navigate = useNavigate();
  if (!rfqs) return null;
  const closingPill = (hrs: number) => {
    if (hrs < 24) return { bg: '#FEE2E2', fg: '#991B1B', label: `Closes in ${Math.max(1, Math.round(hrs))}h` };
    if (hrs < 72) return { bg: '#FEF3C7', fg: '#92400E', label: `Closes in ${Math.round(hrs / 24)}d` };
    return { bg: '#F3F4F6', fg: '#4B5563', label: `Closes in ${Math.round(hrs / 24)}d` };
  };
  return (
    <Card>
      <Title icon={<FileQuestion className="h-4.5 w-4.5" />} iconColor="#7C3AED">
        Active RFQs
        <Link to="/rfq-requests" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
      </Title>
      <div className="mb-2.5 text-[11.5px] text-[#6B7280]">
        <span className="font-medium text-[#111827]">{rfqs.open_count} open</span> · {rfqs.responded_count} quoted
      </div>
      {rfqs.items.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[#9CA3AF]">No active RFQs right now.</div>
      ) : rfqs.items.map((r: ActiveRfqItem) => {
        const pill = closingPill(r.hours_left || 0);
        const quoted = !!r.quote_submitted_at;
        return (
          <div key={r.id} role="button" tabIndex={0}
            onClick={() => navigate(`/rfq-requests`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/rfq-requests'); } }}
            className="flex items-center gap-3 border-b border-[#F3F4F6] py-2.5 last:border-0 cursor-pointer transition-all duration-150 hover:bg-gray-50 -mx-2 px-2 rounded-[6px]">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">{r.rfq_id} · {r.product_name}</div>
              <div className="mt-0.5"><span className="inline-flex items-center gap-1 rounded-[12px] px-2 py-px text-[10.5px] font-medium" style={{ background: pill.bg, color: pill.fg }}><Clock className="h-2.5 w-2.5" />{pill.label}</span></div>
            </div>
            <div className="text-right">
              {quoted && r.total_price
                ? <div className="text-[12.5px] font-medium">{fmtLakh(Number(r.total_price) / 100000)}</div>
                : <span className="rounded-[8px] bg-[#10B981] px-2.5 py-1 text-[11px] font-medium text-white">Submit quote</span>}
            </div>
          </div>
        );
      })}
      {rfqs.open_count > rfqs.items.length && (
        <Link to="/rfq-requests" className="mt-2.5 block text-center text-[11.5px] font-medium text-[#10B981] hover:underline">
          +{rfqs.open_count - rfqs.items.length} more open RFQs
        </Link>
      )}
    </Card>
  );
}

// ─── Recent invoices card ───────────────────────────────────────────────
const INV_STATUS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#FEF3C7', fg: '#92400E' },
  approved: { bg: '#DBEAFE', fg: '#1E40AF' },
  paid: { bg: '#D1FAE5', fg: '#065F46' },
  rejected: { bg: '#FEE2E2', fg: '#991B1B' },
};
function RecentInvoicesCard({ invoices }: { invoices: any[] }) {
  const navigate = useNavigate();
  return (
    <Card>
      <Title icon={<Receipt className="h-4.5 w-4.5" />} iconColor="#F59E0B">
        Recent Invoices
        <Link to="/invoices" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
      </Title>
      {invoices.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[#9CA3AF]">No invoices yet.</div>
      ) : invoices.slice(0, 5).map((inv) => {
        const s = INV_STATUS[(inv.status || 'pending') as string] || INV_STATUS.pending;
        return (
          <div key={inv.id} role="button" tabIndex={0}
            onClick={() => navigate(`/invoices`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/invoices'); } }}
            className="flex items-center gap-3 border-b border-[#F3F4F6] py-2.5 last:border-0 cursor-pointer transition-all duration-150 hover:bg-gray-50 -mx-2 px-2 rounded-[6px]">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">{inv.invoiceNumber || inv.invoice_number}</div>
              <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-[#9CA3AF]">
                {(inv.poNumber || inv.po_number || '—')} · {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12.5px] font-medium">{fmtINR(Number(inv.amount || 0))}</div>
              <div className="mt-0.5">
                <span className="inline-flex items-center rounded-[12px] px-2 py-px text-[10.5px] font-medium capitalize" style={{ background: s.bg, color: s.fg }}>{inv.status || 'pending'}</span>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────────
const ACTIVITY_STYLES: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
  po_received: { bg: '#ECFDF5', fg: '#047857', icon: <Package className="h-3.5 w-3.5" /> },
  invoice_status: { bg: '#F5F3FF', fg: '#7C3AED', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  payment_received: { bg: '#ECFEFF', fg: '#0E7490', icon: <CreditCard className="h-3.5 w-3.5" /> },
  rfq_closing: { bg: '#FFFBEB', fg: '#92400E', icon: <Clock className="h-3.5 w-3.5" /> },
  challan_generated: { bg: '#FFF7ED', fg: '#9A3412', icon: <Truck className="h-3.5 w-3.5" /> },
};
function ActivityFeed({ events }: { events: SupplierActivityEvent[] }) {
  if (!events.length) return <div className="py-6 text-center text-[12px] text-[#9CA3AF]">No recent activity.</div>;
  const routeFor = (e: SupplierActivityEvent) => {
    switch (e.type) {
      case 'po_received': return '/purchase-orders';
      case 'invoice_status': return '/invoices';
      case 'payment_received': return '/payments';
      case 'rfq_closing': return '/rfq-requests';
      case 'challan_generated': return '/delivery-challan';
      default: return '/';
    }
  };
  return (
    <div>
      {events.map((e, i) => {
        const st = ACTIVITY_STYLES[e.type] || ACTIVITY_STYLES.po_received;
        return (
          <Link key={i} to={routeFor(e)} className="flex gap-3.5 border-t border-[#F3F4F6] py-2 first:border-0 cursor-pointer hover:bg-gray-50 rounded-[6px] -mx-2 px-2 transition-all">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full" style={{ background: st.bg, color: st.fg }}>{st.icon}</div>
            <div className="flex-1">
              <div className="text-[12.5px]">{e.body}</div>
              <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{relTime(e.created_at)}{e.meta ? ` · ${e.meta}` : ''}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────
function SkeletonPage() {
  return (
    <div className="space-y-3.5">
      <div className="h-14 animate-pulse rounded-[11px] bg-[#F3F4F6]" />
      <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[136px] animate-pulse rounded-[14px] bg-[#F3F4F6]" />)}
      </div>
      <div className="h-[180px] animate-pulse rounded-[12px] bg-[#F3F4F6]" />
      <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-[300px] animate-pulse rounded-[12px] bg-[#F3F4F6]" />)}
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { supplier, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [, setPayments] = useState<any[]>([]);
  const [poLoading, setPoLoading] = useState(true);

  const [adminStats, setAdminStats] = useState({ suppliers: 0, pendingRegs: 0, challans: 0, awbs: 0 });
  const [adminLoading, setAdminLoading] = useState(false);

  const { data: dash, loading: dashLoading } = useSupplierDashboard(!isAdmin ? supplier?.id : null);

  useEffect(() => {
    if (isAdmin) {
      let cancelled = false;
      setAdminLoading(true);
      (async () => {
        try {
          const [s, r, c, a] = await Promise.all([
            supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('role', 'supplier'),
            supabase.from('supplier_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('delivery_challans').select('*', { count: 'exact', head: true }),
            supabase.from('awb').select('*', { count: 'exact', head: true }),
          ]);
          if (cancelled) return;
          setAdminStats({ suppliers: s.count ?? 0, pendingRegs: r.count ?? 0, challans: c.count ?? 0, awbs: a.count ?? 0 });
        } finally { if (!cancelled) setAdminLoading(false); }
      })();
      return () => { cancelled = true; };
    }

    if (!supplier?.zoho_vendor_id) { setPoLoading(false); return; }
    let cancelled = false;
    (async () => {
      setPoLoading(true);
      try {
        const [pos, invs, pays] = await Promise.all([
          fetchPurchaseOrders(supplier.zoho_vendor_id!),
          fetchInvoices(supplier.zoho_vendor_id!),
          fetchPayments(supplier.zoho_vendor_id!),
        ]);
        if (cancelled) return;
        setPurchaseOrders(pos); setInvoices(invs); setPayments(pays);
      } finally { if (!cancelled) setPoLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [supplier?.zoho_vendor_id, isAdmin]);

  const firstName = (supplier?.name || 'there').split(' ')[0];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const supplierHeaderActions = (
    <div className="flex items-center gap-2.5">
      <div className="hidden md:flex items-center gap-1.5 rounded-[9px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12.5px] text-[#6B7280] min-w-[220px]">
        <Search className="h-3.5 w-3.5" /> Search POs, invoices, RFQs…
      </div>
      <button className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#374151]">
        <Calendar className="h-3.5 w-3.5" /> This month
      </button>
      <Link to="/invoices/upload" className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#10B981] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#059669]">
        <Plus className="h-3.5 w-3.5" /> Submit Invoice
      </Link>
      <button className="rounded-[9px] border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[#374151]">
        <Bell className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ───────── Admin branch (unchanged) ─────────
  if (isAdmin) {
    if (adminLoading) {
      return (
        <DashboardLayout title="Admin Dashboard" subtitle="Emboss Marketing — Admin Panel">
          <div className="flex min-h-[60vh] items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout title="Admin Dashboard" subtitle="Emboss Marketing — Admin Panel">
        <div className="space-y-6">
          <div className="rounded-xl border bg-gradient-primary p-6 text-primary-foreground shadow-card">
            <h2 className="text-2xl font-bold">Welcome, {supplier?.name || 'Ankur'}!</h2>
            <p className="mt-1 text-primary-foreground/80">You are logged in as Emboss Marketing Admin.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Suppliers" value={adminStats.suppliers} subtitle="Active suppliers" icon={<Users className="h-6 w-6" />} variant="primary" />
            <StatCard title="Pending Registrations" value={adminStats.pendingRegs} subtitle="Awaiting review" icon={<ClipboardList className="h-6 w-6" />} variant="warning" />
            <StatCard title="Total Challans" value={adminStats.challans} subtitle="Generated" icon={<Truck className="h-6 w-6" />} variant="success" />
            <StatCard title="Total AWBs" value={adminStats.awbs} subtitle="Created" icon={<Package className="h-6 w-6" />} variant="default" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="default"><Link to="/admin/suppliers">Manage Suppliers</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/registrations">View Registrations</Link></Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ───────── Supplier branch ─────────
  if (!supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Dashboard" subtitle={`Welcome back, ${firstName} · ${today}`}>
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  if (poLoading || dashLoading || !dash.kpis) {
    return (
      <DashboardLayout title="Dashboard" subtitle={`Welcome back, ${firstName} · ${today}`} actions={supplierHeaderActions}>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  const { kpis, attention, velocity, aging, rfqs, activity } = dash;

  const paidMomPct = kpis.paid_last_month
    ? Math.abs(((kpis.paid_this_month - kpis.paid_last_month) / kpis.paid_last_month) * 100) : 0;
  const recvDelta = kpis.outstanding_invoice_count - kpis.outstanding_invoice_count_last_month;

  return (
    <DashboardLayout title="Dashboard" subtitle={`Welcome back, ${firstName} · ${today}`} actions={supplierHeaderActions}>
      <div className="space-y-3.5 text-[#111827]" style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <AttentionBanner a={attention} />

        {/* Hero KPI row */}
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KpiGradient
            variant="k1" label="TOTAL PURCHASE ORDERS" icon={<Package className="h-4 w-4" />}
            iconBg="rgba(16,185,129,.18)" iconColor="#047857" labelColor="#065F46"
            value={String(kpis.total_po_count)}
            trend={kpis.new_po_this_month ? { dir: 'new', pct: kpis.new_po_this_month, customLabel: `+${kpis.new_po_this_month} this month` } : undefined}
            sparkline={{ data: kpis.po_count_trend || [], color: '#10B981' }}
            sub={`${kpis.pending_invoice_po_count} pending invoice · ${kpis.partial_po_count} partial`}
            subColor="#065F46" to="/purchase-orders" goodIsUp
          />
          <KpiGradient
            variant="k2" label="PENDING INVOICES" icon={<FileText className="h-4 w-4" />}
            iconBg="rgba(234,88,12,.18)" iconColor="#9A3412" labelColor="#9A3412"
            value={String(kpis.pending_invoice_count)}
            ageing={{ a030: kpis.aging_0_30, a3160: kpis.aging_31_60, a60: kpis.aging_60_plus }}
            sub={`${fmtLakh(kpis.pending_invoice_amount)} awaiting payment from Emboss`}
            subColor="#9A3412" to="/invoices?status=pending"
          />
          <KpiGradient
            variant="k3" label="PAYMENTS RECEIVED" icon={<CreditCard className="h-4 w-4" />}
            iconBg="rgba(8,145,178,.18)" iconColor="#0E7490" labelColor="#155E75"
            value={fmtLakh(kpis.paid_this_month)}
            trend={kpis.paid_last_month ? { dir: kpis.paid_this_month >= kpis.paid_last_month ? 'up' : 'down', pct: paidMomPct } : undefined}
            sparkline={{ data: kpis.paid_trend || [], color: '#0891B2' }}
            sub={`Avg ${kpis.avg_days_to_pay}-day cycle from Emboss`}
            subColor="#155E75" to="/payments" goodIsUp
          />
          <KpiGradient
            variant="k4" label="TOTAL RECEIVABLES" icon={<Wallet className="h-4 w-4" />}
            iconBg="rgba(37,99,235,.18)" iconColor="#1D4ED8" labelColor="#1E40AF"
            value={fmtLakh(kpis.total_outstanding)}
            trend={{ dir: recvDelta > 0 ? 'up' : recvDelta < 0 ? 'down' : 'flat', pct: Math.abs(recvDelta), customLabel: `${recvDelta >= 0 ? '+' : ''}${recvDelta} invoices vs last mo` }}
            sparkline={{ data: kpis.receivables_trend || [], color: '#2563EB' }}
            sub={`${kpis.outstanding_invoice_count} invoices · oldest ${kpis.oldest_outstanding_days}d old`}
            subColor="#1E40AF" to="/invoices" goodIsUp={false}
          />
        </div>

        {/* Velocity strip */}
        <VelocityStrip velocity={velocity} />

        {/* Performance score (unchanged) */}
        {supplier?.id && <PerformanceCard supplierId={supplier.id} />}

        {/* AI Payment Date Prediction (minor tweaks) */}
        <PaymentPredictionCard />

        {/* Receivables aging + Active RFQs */}
        <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
          <Card>
            <Title icon={<PieIcon className="h-4.5 w-4.5" />} iconColor="#F59E0B">Receivables aging</Title>
            <ReceivablesDonut a030={aging?.amount_0_30 || 0} a3160={aging?.amount_31_60 || 0} a60={aging?.amount_60_plus || 0} />
          </Card>
          <ActiveRfqs rfqs={rfqs} />
        </div>

        {/* Recent POs + Recent Invoices */}
        <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-[12px] overflow-hidden">
            <RecentPOTable orders={purchaseOrders.slice(0, 5) as any} />
          </div>
          <RecentInvoicesCard invoices={invoices} />
        </div>

        {/* Activity feed */}
        <Card>
          <Title icon={<Activity className="h-4.5 w-4.5" />} iconColor="#10B981">Activity feed</Title>
          <ActivityFeed events={activity} />
        </Card>

        {/* Quick Actions (unchanged) */}
        <QuickActions />
      </div>
      <SupplierAssistant />
    </DashboardLayout>
  );
}
