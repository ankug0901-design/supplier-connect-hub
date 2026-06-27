import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Shapes — match the SQL JSON output of dashboard_* RPCs exactly ─────
export interface DashboardKpis {
  po_value_this_month: number;
  po_value_last_month: number;
  open_po_count: number;
  po_supplier_count: number;
  pending_invoice_count: number;
  pending_invoice_amount: number;
  aging_0_30: number;
  aging_31_60: number;
  aging_60_plus: number;
  paid_this_month: number;
  paid_last_month: number;
  paid_supplier_count: number;
  avg_payment_cycle: number;
  active_supplier_count: number;
  new_supplier_count: number;
  pending_approval_count: number;
  dormant_count: number;
}

export interface AttentionCounts {
  po_approvals_pending: number;
  next_rfq_closing: null | {
    rfq_id: string;
    product_name: string;
    hours_left: number;
    closes_at: string;
  };
  invoices_60_plus_overdue: number;
  new_supplier_registrations: number;
  three_way_match_exceptions: number;
}

export interface VelocityStage {
  name: string;
  median_days: number;
  in_flight: number;
  delta_days: number;
}
export interface Velocity {
  stages: VelocityStage[];
  on_time_delivery_pct: number;
  on_time_delta: number;
  total_cycle_days: number;
}

export interface MatchStatus {
  matched: number;
  awaiting_grn: number;
  exception: number;
  match_rate_pct: number;
}

export interface TopItem {
  item_name: string;
  category: string;
  top_supplier_name: string | null;
  po_count: number;
  value: number; // lakhs
  mom_delta_pct: number | null;
}

export interface TopSupplier {
  supplier_id: string;
  name: string;
  initials: string;
  po_count: number;
  value: number; // lakhs
  perf_score: number;
  mom_delta_pct: number | null;
  status: 'new' | 'returning';
}

export interface CategoryMix {
  category: string;
  pct: number;
}

export type ActivityType =
  | 'bill_uploaded'
  | 'rfq_quote_submitted'
  | 'supplier_registered'
  | 'challan_generated';
export interface ActivityEvent {
  type: ActivityType;
  actor: string | null;
  target: string | null;
  ref_id: string | null;
  body: string;
  created_at: string;
  meta: string | null;
}

export type InsightSeverity = 'warning' | 'risk' | 'positive' | 'opportunity';
export interface AiInsight {
  type: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  action_url: string;
}

export interface WeekDay {
  date: string;
  day_name: string;
  day_num: number;
  is_today: boolean;
  deliveries_count: number;
  bills_due_count: number;
  rfqs_closing_count: number;
  payments_count: number;
}
export interface ThisWeek {
  days: WeekDay[];
  next_imminent: null | {
    type: 'rfq_closing';
    rfq_id: string;
    product_name: string;
    closes_at: string;
    response_count: number;
    total_invited: number;
  };
}

export interface SpendTrendPoint {
  month: string;
  month_start: string;
  po_value: number;   // lakhs
  paid: number;       // lakhs
  outstanding: number; // lakhs
}

export interface ApAging {
  amount_0_30: number;   // lakhs
  amount_31_60: number;  // lakhs
  amount_60_plus: number; // lakhs
  total: number;          // lakhs
}

export interface DashboardData {
  kpis: DashboardKpis | null;
  attention: AttentionCounts | null;
  velocity: Velocity | null;
  matchStatus: MatchStatus | null;
  topItems: TopItem[];
  topSuppliers: TopSupplier[];
  categoryMix: CategoryMix[];
  activity: ActivityEvent[];
  insights: AiInsight[];
  thisWeek: ThisWeek | null;
  spendTrend: SpendTrendPoint[];
  apAging: ApAging | null;
}

const EMPTY: DashboardData = {
  kpis: null,
  attention: null,
  velocity: null,
  matchStatus: null,
  topItems: [],
  topSuppliers: [],
  categoryMix: [],
  activity: [],
  insights: [],
  thisWeek: null,
  spendTrend: [],
  apAging: null,
};

export function useDashboardData() {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = supabase as any;
        const calls = await Promise.all([
          sb.rpc('dashboard_kpis'),
          sb.rpc('dashboard_attention_counts'),
          sb.rpc('dashboard_velocity'),
          sb.rpc('dashboard_match_status'),
          sb.rpc('dashboard_top_items', { p_limit: 5 }),
          sb.rpc('dashboard_top_suppliers', { p_limit: 5 }),
          sb.rpc('dashboard_category_mix'),
          sb.rpc('dashboard_activity_feed', { p_limit: 6 }),
          sb.rpc('dashboard_ai_insights', { p_limit: 4 }),
          sb.rpc('dashboard_this_week'),
          sb.rpc('dashboard_spend_trend', { months: 6 }),
          sb.rpc('dashboard_ap_aging'),
        ]);
        if (cancelled) return;
        const firstErr = calls.find((r: any) => r?.error);
        if (firstErr?.error) throw new Error(firstErr.error.message);
        setData({
          kpis: calls[0].data ?? null,
          attention: calls[1].data ?? null,
          velocity: calls[2].data ?? null,
          matchStatus: calls[3].data ?? null,
          topItems: calls[4].data ?? [],
          topSuppliers: calls[5].data ?? [],
          categoryMix: calls[6].data ?? [],
          activity: calls[7].data ?? [],
          insights: calls[8].data ?? [],
          thisWeek: calls[9].data ?? null,
          spendTrend: calls[10].data ?? [],
          apAging: calls[11].data ?? null,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
