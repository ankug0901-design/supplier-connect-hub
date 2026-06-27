import { Link, useNavigate } from 'react-router-dom';
import {
  Package, Receipt, CreditCard, Users, Sparkles, GitCompare, Trophy, Box,
  Calendar, Activity, Bell, AlertTriangle, Clock, TrendingUp, ArrowUpRight,
  ArrowDownRight, Minus, ChevronRight, Search, Plus, Gauge, BarChart3,
  PieChart as PieIcon, FileText, UserPlus, Lightbulb, Award, Truck, Info,
  CircleCheck, ArrowRight, IndianRupee, CalendarClock, CheckCheck,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  useDashboardData,
  type ActivityEvent,
  type AiInsight,
  type SpendTrendPoint,
  type VelocityStage,
  type WeekDay,
} from '@/hooks/useDashboard';

// ─── formatters ──────────────────────────────────────────────────────────
// RPCs already convert money to lakhs via public.to_lakhs(). These helpers
// expect lakh-denominated inputs.
function fmtLakh(n: number | null | undefined) {
  const v = Number(n || 0);
  if (!v) return '₹0 L';
  if (v >= 100) return `₹${(v / 100).toFixed(2)} Cr`;
  return `₹${v.toFixed(2)} L`;
}
function fmtShort(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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

// ─── main page ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { data, loading } = useDashboardData();
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

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

  if (loading || !data.kpis) {
    return (
      <DashboardLayout title="Admin Dashboard" subtitle={`Procurement command centre · ${today}`} actions={headerActions}>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  const { kpis, attention, velocity, matchStatus, topItems, topSuppliers, categoryMix, activity, insights, thisWeek, spendTrend, apAging } = data;

  const poTrend = spendTrend.map((s) => s.po_value);
  const paidTrend = spendTrend.map((s) => s.paid);
  const supplierTrend = spendTrend.map((_, i, arr) =>
    kpis.active_supplier_count - (kpis.new_supplier_count * (arr.length - 1 - i)) / Math.max(arr.length - 1, 1)
  );

  const poMomPct = kpis.po_value_last_month
    ? Math.abs(((kpis.po_value_this_month - kpis.po_value_last_month) / kpis.po_value_last_month) * 100)
    : 0;
  const paidMomPct = kpis.paid_last_month
    ? Math.abs(((kpis.paid_this_month - kpis.paid_last_month) / kpis.paid_last_month) * 100)
    : 0;

  const totalCycle = velocity?.total_cycle_days ?? 0;

  // Build the 5-stage strip: 4 from velocity (median_days) + on-time delivery %
  const stages: Array<VelocityStage & { red?: boolean; green?: boolean; isPct?: boolean }> = [
    ...((velocity?.stages || []) as VelocityStage[]),
  ];
  // Ensure the 4th (Bill → Paid) is flagged as bottleneck if it's the longest
  if (stages.length >= 3) {
    const longestIdx = stages.reduce((m, s, i, arr) => (s.median_days > arr[m].median_days ? i : m), 0);
    if (longestIdx === stages.length - 1) (stages[longestIdx] as any).red = true;
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      subtitle={`Procurement command centre · ${today}`}
      actions={headerActions}
    >
      <div className="space-y-3.5 text-[#111827]" style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <AttentionBanner a={attention} />

        {/* Hero KPI Row */}
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KpiGradient
            variant="k1" label="PO VALUE (THIS MONTH)" icon={<Package className="h-4 w-4" />}
            iconBg="rgba(16,185,129,.18)" iconColor="#047857" labelColor="#6B7280"
            value={fmtLakh(kpis.po_value_this_month)}
            trend={kpis.po_value_last_month ? { dir: kpis.po_value_this_month >= kpis.po_value_last_month ? 'up' : 'down', pct: poMomPct } : undefined}
            sparkline={{ data: poTrend, color: '#10B981' }}
            sub={`${kpis.open_po_count} open POs · ${kpis.po_supplier_count} suppliers`}
            subColor="#6B7280" to="/purchase-orders" goodIsUp
          />
          <KpiGradient
            variant="k2" label="PENDING INVOICES" icon={<Receipt className="h-4 w-4" />}
            iconBg="rgba(234,88,12,.18)" iconColor="#9A3412" labelColor="#9A3412"
            value={String(kpis.pending_invoice_count)}
            ageing={{ a030: kpis.aging_0_30, a3160: kpis.aging_31_60, a60: kpis.aging_60_plus }}
            sub={`${fmtLakh(kpis.pending_invoice_amount)} awaiting payment`}
            subColor="#9A3412" to="/invoices?status=pending"
          />
          <KpiGradient
            variant="k3" label="PAID (THIS MONTH)" icon={<CreditCard className="h-4 w-4" />}
            iconBg="rgba(8,145,178,.18)" iconColor="#0E7490" labelColor="#155E75"
            value={fmtLakh(kpis.paid_this_month)}
            trend={kpis.paid_last_month ? { dir: kpis.paid_this_month >= kpis.paid_last_month ? 'up' : 'down', pct: paidMomPct } : undefined}
            sparkline={{ data: paidTrend, color: '#0891B2' }}
            sub={`Across ${kpis.paid_supplier_count} suppliers · avg ${kpis.avg_payment_cycle}-day cycle`}
            subColor="#155E75" to="/payments" goodIsUp
          />
          <KpiGradient
            variant="k4" label="ACTIVE SUPPLIERS" icon={<Users className="h-4 w-4" />}
            iconBg="rgba(37,99,235,.18)" iconColor="#1D4ED8" labelColor="#1E40AF"
            value={String(kpis.active_supplier_count)}
            trend={{ dir: 'new', pct: kpis.new_supplier_count, customLabel: `${kpis.new_supplier_count} new this month` }}
            sparkline={{ data: supplierTrend, color: '#2563EB' }}
            sub={`${kpis.pending_approval_count} pending approval · ${kpis.dormant_count} dormant`}
            subColor="#1E40AF" to="/admin/suppliers"
          />
        </div>

        {/* Operational velocity */}
        {(() => {
          const VELOCITY_ROOT = '/admin/vendor-scores';
          const routeForStage = (name: string) => {
            const n = (name || '').toLowerCase();
            if (n.includes('rfq')) return '/admin/rfq?status=pending';
            if (n.includes('paid')) return '/admin/three-way-match?filter=unpaid';
            if (n.includes('po') || n.includes('invoice') || n.includes('bill') || n.includes('grn')) return '/admin/suppliers';
            return VELOCITY_ROOT;
          };
          const go = (to: string) => (e: React.MouseEvent | React.KeyboardEvent) => {
            e.stopPropagation();
            navigate(to);
          };
          const bottleneck = stages.find((s) => (s as any).red);
          const bottleneckRoute = bottleneck ? routeForStage(bottleneck.name) : '/admin/three-way-match?filter=unpaid';
          return (
            <div
              role="button"
              tabIndex={0}
              aria-label="Open operational velocity report"
              onClick={() => navigate(VELOCITY_ROOT)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(VELOCITY_ROOT); } }}
              className="cursor-pointer transition-all duration-150 hover:shadow-sm rounded-[12px]"
            >
              <Card>
                <Title icon={<Gauge className="h-4.5 w-4.5" />} iconColor="#10B981">
                  Operational velocity · pipeline cycle times
                  <span className="ml-auto flex items-center gap-2.5 text-[12px] font-normal">
                    <span className="text-[#6B7280]">Total cycle: <span className="font-medium text-[#111827]">{Math.round(totalCycle)} days</span> median</span>
                    <button
                      type="button"
                      onClick={go(VELOCITY_ROOT)}
                      aria-label="View velocity report"
                      className="flex items-center gap-1 text-[#10B981] font-medium hover:underline cursor-pointer"
                    >
                      View report <ArrowRight className="h-3 w-3" />
                    </button>
                  </span>
                </Title>
                <div className="flex items-stretch">
                  {stages.map((s, idx) => {
                    const dir: 'up' | 'down' | 'flat' = s.delta_days > 0 ? 'up' : s.delta_days < 0 ? 'down' : 'flat';
                    const label = s.delta_days === 0 ? 'flat' : `${Math.abs(s.delta_days).toFixed(1)}d ${s.delta_days > 0 ? 'slower' : 'faster'}`;
                    const route = routeForStage(s.name);
                    return (
                      <div key={s.name} className="flex items-stretch flex-1 min-w-0">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${s.name} stage — ${Number(s.median_days || 0).toFixed(1)} days median, ${s.in_flight} in flight`}
                          onClick={go(route)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(route)(e); } }}
                          className={`flex-1 rounded-[11px] border p-3.5 cursor-pointer transition-all duration-150 hover:shadow-sm ${
                            (s as any).red ? 'bg-[#FEF2F2] border-[#FECACA] hover:bg-[#FEE2E2]' :
                            (s as any).green ? 'bg-[#ECFDF5] border-[#A7F3D0] hover:bg-[#D1FAE5]' :
                            'bg-[#F9FAFB] border-[#E5E7EB] hover:bg-gray-50'
                          }`}
                        >
                          <div className={`text-[10.5px] font-medium tracking-wider ${(s as any).red ? 'text-[#991B1B]' : 'text-[#6B7280]'}`}>{s.name.toUpperCase()}</div>
                          <div className={`mt-1 text-[24px] font-medium leading-none tracking-tight ${(s as any).red ? 'text-[#7F1D1D]' : 'text-[#111827]'}`}>
                            {Number(s.median_days || 0).toFixed(1).replace(/\.0$/, '')}
                            <span className={`ml-1 text-[13px] font-normal ${(s as any).red ? 'text-[#991B1B]' : 'text-[#6B7280]'}`}>days</span>
                          </div>
                          <div className={`mt-1 text-[11px] ${(s as any).red ? 'text-[#991B1B]' : 'text-[#6B7280]'}`}>
                            {s.in_flight} in flight{(s as any).red ? ' · bottleneck' : ''}
                          </div>
                          <div className="mt-2"><Trend dir={dir} label={label} goodIsUp={false} /></div>
                        </div>
                        {idx < stages.length - 1 && (
                          <div className="flex items-center px-1.5 text-[#D1D5DB]"><ChevronRight className="h-5 w-5" /></div>
                        )}
                      </div>
                    );
                  })}
                  {velocity && (
                    <div className="flex items-stretch flex-1 min-w-0">
                      <div className="flex items-center px-1.5 text-[#D1D5DB]"><ChevronRight className="h-5 w-5" /></div>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`On-time delivery ${Number(velocity.on_time_delivery_pct || 0).toFixed(0)} percent`}
                        onClick={go('/admin/vendor-scores')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('/admin/vendor-scores')(e); } }}
                        className="flex-1 rounded-[11px] border p-3.5 bg-[#ECFDF5] border-[#A7F3D0] cursor-pointer transition-all duration-150 hover:bg-[#D1FAE5] hover:shadow-sm"
                      >
                        <div className="text-[10.5px] font-medium tracking-wider text-[#047857]">ON-TIME DELIVERY</div>
                        <div className="mt-1 text-[24px] font-medium leading-none tracking-tight text-[#065F46]">
                          {Number(velocity.on_time_delivery_pct || 0).toFixed(0)}
                          <span className="ml-1 text-[13px] font-normal text-[#047857]">%</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[#047857]">last 30 days</div>
                        <div className="mt-2">
                          <Trend
                            dir={velocity.on_time_delta > 0 ? 'up' : velocity.on_time_delta < 0 ? 'down' : 'flat'}
                            label={velocity.on_time_delta === 0 ? 'flat' : `${Math.abs(velocity.on_time_delta).toFixed(1)}%`}
                            goodIsUp
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {kpis.aging_60_plus > 0 && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Open bottleneck stage filter"
                    onClick={go(bottleneckRoute)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(bottleneckRoute)(e); } }}
                    className="mt-3.5 flex items-start gap-2 rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-[12px] text-[#92400E] cursor-pointer transition-all duration-150 hover:bg-[#FEF3C7] hover:shadow-sm"
                  >
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    Payment cycle is the bottleneck — {kpis.aging_60_plus} invoices stuck &gt;60 days. Clear in the AP queue to unblock supplier deliveries.
                  </div>
                )}
              </Card>
            </div>
          );
        })()}

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
            <ApAgingDonut a030={apAging?.amount_0_30 || 0} a3160={apAging?.amount_31_60 || 0} a60={apAging?.amount_60_plus || 0} />
          </Card>
          <Card>
            <Title icon={<GitCompare className="h-4.5 w-4.5" />} iconColor="#7C3AED">3-Way match</Title>
            <div className="text-[28px] font-medium leading-none">{matchStatus?.match_rate_pct ?? 0}<span className="text-[15px] font-normal text-[#6B7280]">%</span></div>
            <div className="mt-1.5 mb-4 text-[11.5px] text-[#6B7280]">Match rate · last 30 days</div>
            {(() => {
              const m = matchStatus || { matched: 0, awaiting_grn: 0, exception: 0, match_rate_pct: 0 };
              const total = m.matched + m.awaiting_grn + m.exception;
              return (
                <>
                  <MatchBar icon={<CircleCheck className="h-3 w-3 text-[#10B981]" />} label="Matched" count={m.matched} pct={total ? (m.matched / total) * 100 : 0} color="#10B981" labelColor="#047857" />
                  <MatchBar icon={<Clock className="h-3 w-3 text-[#F59E0B]" />} label="Awaiting GRN" count={m.awaiting_grn} pct={total ? (m.awaiting_grn / total) * 100 : 0} color="#F59E0B" labelColor="#92400E" />
                  <MatchBar icon={<AlertTriangle className="h-3 w-3 text-[#DC2626]" />} label="Exception" count={m.exception} pct={total ? (m.exception / total) * 100 : 0} color="#DC2626" labelColor="#991B1B" />
                </>
              );
            })()}
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
              <Row key={s.supplier_id} ariaLabel={`Open supplier ${s.name}`} onClick={() => navigate(`/admin/suppliers?id=${s.supplier_id}`)}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[10.5px] font-medium" style={{ background: AVATAR_BG[i % 5], color: AVATAR_FG[i % 5] }}>{s.initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{s.name}</div>
                  <div className="text-[11px] text-[#6B7280]">{s.po_count} POs · perf {s.perf_score}/100</div>
                </div>
                <div className="w-[110px]">
                  <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#F3F4F6]">
                    <div className="h-full rounded-[3px]" style={{ width: `${s.perf_score}%`, background: s.perf_score >= 85 ? '#10B981' : s.perf_score >= 70 ? '#F59E0B' : '#DC2626' }} />
                  </div>
                </div>
                <div className="min-w-[78px] text-right">
                  <div className="text-[13px] font-medium">{fmtLakh(s.value)}</div>
                  <div className="mt-0.5">
                    {s.status === 'new' || s.mom_delta_pct == null
                      ? <Trend dir="new" label="new" />
                      : <Trend dir={s.mom_delta_pct >= 0 ? 'up' : 'down'} label={`${Math.abs(s.mom_delta_pct).toFixed(0)}%`} goodIsUp />}
                  </div>
                </div>
              </Row>
            ))}
          </Card>
          <Card>
            <Title icon={<Box className="h-4.5 w-4.5" />} iconColor="#10B981">
              Top items by PO value
              <Link to="/purchase-orders" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View SKUs <ArrowRight className="h-3 w-3" /></Link>
            </Title>
            {(() => {
              const totalMixPct = categoryMix.reduce((s, c) => s + c.pct, 0) || 1;
              const palette = ['#3B82F6', '#F59E0B', '#7C3AED', '#10B981', '#EC4899', '#6B7280'];
              const totalValue = topItems.reduce((s, i) => s + i.value, 0);
              return (
                <>
                  <div className="mb-2.5 text-[11.5px] text-[#6B7280]">{fmtLakh(totalValue)} across <span className="font-medium text-[#111827]">{topItems.length} SKUs</span> · {categoryMix.length} categories</div>
                  <div className="mb-2.5 flex h-[7px] overflow-hidden rounded-[4px]">
                    {categoryMix.map((c, i) => c.pct > 0 && <div key={c.category} style={{ flex: c.pct / totalMixPct, background: palette[i % palette.length] }} />)}
                  </div>
                  <div className="mb-1.5 flex flex-wrap gap-3 text-[10.5px] text-[#6B7280]">
                    {categoryMix.map((c, i) => c.pct > 0 && (
                      <span key={c.category} className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
                        {c.category} {c.pct}%
                      </span>
                    ))}
                  </div>
                  {topItems.length === 0 ? <Empty>No items invoiced this month.</Empty> : topItems.map((it, idx) => (
                    <Row key={idx} ariaLabel={`Open item ${it.item_name}`} onClick={() => navigate(`/purchase-orders?item=${encodeURIComponent(it.item_name)}`)}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[#F3F4F6] text-[#6B7280]">
                        <Package className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-medium">{it.item_name}</span>
                          <span className="rounded-[5px] px-1.5 py-px text-[9.5px] font-medium tracking-wider bg-[#F3F4F6] text-[#6B7280]">{(it.category || '').toUpperCase()}</span>
                        </div>
                        <div className="truncate text-[11px] text-[#6B7280]">{it.po_count} POs · {it.top_supplier_name || '—'}</div>
                      </div>
                      <div className="min-w-[78px] text-right">
                        <div className="text-[13px] font-medium">{fmtLakh(it.value)}</div>
                        {it.mom_delta_pct != null && (
                          <div className="mt-0.5"><Trend dir={it.mom_delta_pct >= 0 ? 'up' : 'down'} label={`${Math.abs(it.mom_delta_pct).toFixed(0)}%`} goodIsUp /></div>
                        )}
                      </div>
                    </Row>
                  ))}
                </>
              );
            })()}
          </Card>
        </div>

        {/* Insights + calendar */}
        <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <Title icon={<Sparkles className="h-4.5 w-4.5" />} iconColor="#7C3AED">
              AI insights · this week
              <Link to="/admin/ai-insights" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View all <ArrowRight className="h-3 w-3" /></Link>
            </Title>
            {insights.length === 0 ? <Empty>Looking good — nothing pressing.</Empty> : insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
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
              {(thisWeek?.days || []).map((d: WeekDay, i: number) => {
                const empty = d.deliveries_count + d.bills_due_count + d.rfqs_closing_count + d.payments_count === 0;
                const dayObj = new Date(d.date);
                const isWeekend = dayObj.getDay() === 0 || dayObj.getDay() === 6;
                return (
                  <div key={i} className={`flex-1 min-w-0 rounded-[10px] border p-2 text-center ${
                    d.is_today ? 'bg-white border-[1.5px] border-[#10B981] shadow-[0_0_0_3px_rgba(16,185,129,0.08)]' :
                    isWeekend || empty ? 'bg-[#FAFAFA] border-[#E5E7EB]' : 'bg-[#F9FAFB] border-[#E5E7EB]'
                  }`}>
                    <div className={`text-[10px] font-medium tracking-wider ${d.is_today ? 'text-[#047857]' : isWeekend || empty ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>{d.day_name.toUpperCase()}</div>
                    <div className={`my-1 text-[20px] font-medium leading-none ${d.is_today ? 'text-[#047857]' : isWeekend || empty ? 'text-[#9CA3AF]' : 'text-[#111827]'}`}>{d.day_num}</div>
                    {empty ? <div className="text-[10.5px] text-[#9CA3AF] mt-2">—</div> : (
                      <div className="space-y-1">
                        {d.deliveries_count > 0 && <DayEv bg="#ECFDF5" fg="#047857" icon={<Truck className="h-2.5 w-2.5" />} count={d.deliveries_count} />}
                        {d.bills_due_count > 0 && <DayEv bg="#FFFBEB" fg="#92400E" icon={<Receipt className="h-2.5 w-2.5" />} count={d.bills_due_count} />}
                        {d.rfqs_closing_count > 0 && <DayEv bg="#FEF2F2" fg="#991B1B" icon={<Clock className="h-2.5 w-2.5" />} count={d.rfqs_closing_count} />}
                        {d.payments_count > 0 && <DayEv bg="#EFF6FF" fg="#1E40AF" icon={<CreditCard className="h-2.5 w-2.5" />} count={d.payments_count} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {thisWeek?.next_imminent && (
              <div className="mt-3.5 flex items-start gap-2 rounded-[9px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-[12px] text-[#991B1B]">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-medium">Heads up:</span> RFQ {thisWeek.next_imminent.rfq_id} · {thisWeek.next_imminent.product_name} closes today
                  {thisWeek.next_imminent.total_invited > 0 ? ` · ${thisWeek.next_imminent.response_count}/${thisWeek.next_imminent.total_invited} responses` : ''}.
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Activity feed */}
        <Card>
          <Title icon={<Activity className="h-4.5 w-4.5" />} iconColor="#10B981">
            Activity feed
            <Link to="/admin/ai-insights" className="ml-auto flex items-center gap-1 text-[12px] font-medium text-[#10B981]">View full log <ArrowRight className="h-3 w-3" /></Link>
          </Title>
          <ActivityFeed events={activity} />
        </Card>
      </div>
    </DashboardLayout>
  );
}

// ─── helpers / sub-components ────────────────────────────────────────────
const AVATAR_BG = ['#ECFDF5', '#EFF6FF', '#FFF7ED', '#F3E8FF', '#FCE7F3'];
const AVATAR_FG = ['#047857', '#1E40AF', '#9A3412', '#6B21A8', '#9D174D'];

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
function Row({ children, onClick, ariaLabel }: { children: React.ReactNode; onClick?: () => void; ariaLabel?: string }) {
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        className="flex items-center gap-3 border-b border-[#F3F4F6] py-2.5 last:border-0 cursor-pointer transition-all duration-150 hover:bg-gray-50 hover:shadow-sm -mx-2 px-2 rounded-[6px]"
      >
        {children}
      </div>
    );
  }
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

function AttentionBanner({ a }: { a: ReturnType<typeof useDashboardData>['data']['attention'] }) {
  if (!a) return null;
  const chips: { count: number; bg: string; fg: string; label: string; icon: React.ReactNode; to: string }[] = [
    { count: a.po_approvals_pending, bg: '#FEF3C7', fg: '#92400E', label: `${a.po_approvals_pending} PO approvals pending`, icon: <FileText className="h-3 w-3" />, to: '/admin/exception-requests' },
    ...(a.next_rfq_closing ? [{
      count: 1, bg: '#FEE2E2', fg: '#991B1B',
      label: `RFQ ${a.next_rfq_closing.rfq_id} closes in ${Math.max(1, Math.round(a.next_rfq_closing.hours_left))} hrs`,
      icon: <Clock className="h-3 w-3" />, to: '/admin/rfq',
    }] : []),
    { count: a.invoices_60_plus_overdue, bg: '#FED7AA', fg: '#9A3412', label: `${a.invoices_60_plus_overdue} invoices · 60+ days overdue`, icon: <IndianRupee className="h-3 w-3" />, to: '/invoices?overdue=60' },
    { count: a.new_supplier_registrations, bg: '#DBEAFE', fg: '#1E40AF', label: `${a.new_supplier_registrations} new supplier registrations`, icon: <UserPlus className="h-3 w-3" />, to: '/admin/registrations' },
    { count: a.three_way_match_exceptions, bg: '#E0E7FF', fg: '#3730A3', label: `${a.three_way_match_exceptions} three-way match exceptions`, icon: <AlertTriangle className="h-3 w-3" />, to: '/admin/three-way-match' },
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

function SpendChart({ data }: { data: SpendTrendPoint[] }) {
  if (!data.length) return <div className="py-10 text-center text-[12px] text-[#9CA3AF]">No spend data yet</div>;
  const max = Math.max(...data.flatMap((d) => [d.po_value, d.paid]), 1);
  // round to a "nice" max in lakhs
  const niceMax = Math.ceil(max / 15) * 15 || 60;
  const h = 190, w = 460, top = 12, bottom = 24, chartH = h - top - bottom;
  const groupW = (w - 36) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[190px] w-full">
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line x1="36" y1={top + chartH * (1 - p)} x2={w - 10} y2={top + chartH * (1 - p)} stroke="#F3F4F6" strokeDasharray="2,3" />
          <text x="30" y={top + chartH * (1 - p) + 3} textAnchor="end" fontSize="9" fill="#9CA3AF">{fmtLakh(niceMax * p).replace(' ', '')}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = 40 + i * groupW;
        const poH = (d.po_value / niceMax) * chartH;
        const paidH = (d.paid / niceMax) * chartH;
        return (
          <g key={i}>
            <rect x={x} y={top + chartH - poH} width="20" height={poH} fill="#10B981" rx="2" />
            <rect x={x + 22} y={top + chartH - paidH} width="20" height={paidH} fill="#0891B2" rx="2" />
            <text x={x + 21} y={h - 8} textAnchor="middle" fontSize="10" fill="#6B7280">{d.month}</text>
          </g>
        );
      })}
      <polyline
        fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeDasharray="4,3"
        points={data.map((d, i) => {
          const x = 40 + i * groupW + 21;
          const y = top + chartH - (d.outstanding / niceMax) * chartH;
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
        <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="500" fill="#111827">{fmtLakh(total)}</text>
        <text x="60" y="73" textAnchor="middle" fontSize="10" fill="#6B7280">total AP</text>
      </svg>
      <div className="flex-1 text-[12px]">
        <div className="flex justify-between border-b border-[#F3F4F6] py-1.5"><Legend dot="#FCD34D" label="0-30 d" /><span className="font-medium">{fmtLakh(a030)}</span></div>
        <div className="flex justify-between border-b border-[#F3F4F6] py-1.5"><Legend dot="#FB923C" label="31-60 d" /><span className="font-medium">{fmtLakh(a3160)}</span></div>
        <div className="flex justify-between py-1.5"><Legend dot="#DC2626" label="60+ d" /><span className="font-medium text-[#991B1B]">{fmtLakh(a60)}</span></div>
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

function InsightCard({ insight }: { insight: AiInsight }) {
  const map: Record<string, { bg: string; border: string; accent: string; tColor: string; icon: React.ReactNode }> = {
    opportunity: { bg: '#F5F3FF', border: '#DDD6FE', accent: '#7C3AED', tColor: '#5B21B6', icon: <Lightbulb className="h-4 w-4" /> },
    warning: { bg: '#FFFBEB', border: '#FDE68A', accent: '#F59E0B', tColor: '#92400E', icon: <TrendingUp className="h-4 w-4" /> },
    risk: { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626', tColor: '#991B1B', icon: <Clock className="h-4 w-4" /> },
    positive: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#10B981', tColor: '#065F46', icon: <Award className="h-4 w-4" /> },
  };
  const cfg = map[insight.severity] || map.opportunity;
  return (
    <Link to={insight.action_url || '#'} aria-label={insight.title} className="mb-2.5 flex gap-2.5 rounded-[9px] border p-3 last:mb-0 cursor-pointer transition-all duration-150 hover:shadow-sm" style={{ background: cfg.bg, borderColor: cfg.border, borderLeftWidth: 3, borderLeftColor: cfg.accent }}>
      <div className="mt-px shrink-0" style={{ color: cfg.accent }}>{cfg.icon}</div>
      <div>
        <div className="mb-1 text-[12.5px] font-medium" style={{ color: cfg.tColor }}>{insight.title}</div>
        <div className="text-[11.5px] leading-snug text-[#374151]">{insight.body}</div>
      </div>
    </Link>
  );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (!events.length) return <Empty>No activity yet</Empty>;
  const styles: Record<string, { icon: React.ReactNode; bg: string; fg: string }> = {
    bill_uploaded: { icon: <CircleCheck className="h-3.5 w-3.5" />, bg: '#ECFDF5', fg: '#047857' },
    rfq_quote_submitted: { icon: <Sparkles className="h-3.5 w-3.5" />, bg: '#F5F3FF', fg: '#7C3AED' },
    challan_generated: { icon: <Truck className="h-3.5 w-3.5" />, bg: '#FFF7ED', fg: '#9A3412' },
    supplier_registered: { icon: <UserPlus className="h-3.5 w-3.5" />, bg: '#EFF6FF', fg: '#1E40AF' },
  };
  const routeFor = (e: ActivityEvent): string | null => {
    switch (e.type) {
      case 'bill_uploaded': return e.ref_id ? `/invoices?id=${e.ref_id}` : '/invoices';
      case 'rfq_quote_submitted': return e.ref_id ? `/admin/rfq?id=${e.ref_id}` : '/admin/rfq';
      case 'challan_generated': return e.ref_id ? `/delivery-challan?id=${e.ref_id}` : '/delivery-challan';
      case 'supplier_registered': return '/admin/registrations';
      default: return null;
    }
  };
  return (
    <div>
      {events.map((e, i) => {
        const st = styles[e.type] || styles.bill_uploaded;
        const to = routeFor(e);
        const inner = (
          <>
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full" style={{ background: st.bg, color: st.fg }}>{st.icon}</div>
            <div className="flex-1">
              <div className="text-[12.5px]">{e.body}</div>
              <div className="mt-0.5 text-[11px] text-[#9CA3AF]">
                {relTime(e.created_at)}{e.meta ? ` · ${e.meta}` : ''}
              </div>
            </div>
          </>
        );
        if (to) {
          return (
            <Link
              key={i}
              to={to}
              aria-label={e.body}
              className="flex gap-3.5 border-t border-[#F3F4F6] py-2 first:border-0 cursor-pointer transition-all duration-150 hover:bg-gray-50 hover:shadow-sm rounded-[6px] -mx-2 px-2"
            >
              {inner}
            </Link>
          );
        }
        return (
          <div key={i} className="flex gap-3.5 border-t border-[#F3F4F6] py-2 first:border-0">
            {inner}
          </div>
        );
      })}
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
