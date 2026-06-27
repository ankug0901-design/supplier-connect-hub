import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SupplierKpis {
  total_po_count: number;
  new_po_this_month: number;
  pending_invoice_po_count: number;
  partial_po_count: number;
  po_pending_invoice_count: number;
  po_partial_count: number;
  pending_invoice_count: number;
  pending_invoice_amount: number;
  aging_0_30: number;
  aging_31_60: number;
  aging_60_plus: number;
  paid_this_month: number;
  paid_last_month: number;
  avg_days_to_pay: number;
  total_outstanding: number;
  total_receivables: number;
  total_receivables_last_month: number;
  outstanding_invoice_count: number;
  receivable_invoice_count: number;
  outstanding_invoice_count_last_month: number;
  receivable_invoice_count_last_month: number;
  oldest_outstanding_days: number;
  oldest_receivable_days: number;
  po_count_trend: number[];
  paid_trend: number[];
  receivables_trend: number[];
}
export interface SupplierAttention {
  pos_awaiting_invoice: number;
  invoices_overdue: number;
  open_rfqs: number;
  deliveries_this_week: number;
  new_pos_this_week: number;
}
export interface SupplierVelocityStage {
  name: string; median_days: number; in_flight: number; delta_days: number;
}
export interface SupplierVelocity {
  stages: SupplierVelocityStage[];
  on_time_delivery_pct: number;
  on_time_delta: number;
  total_cycle_days: number;
}
export interface ReceivablesAging {
  amount_0_30: number; amount_31_60: number; amount_60_plus: number; total: number;
}
export interface ActiveRfqItem {
  id: string; rfq_id: string; product_name: string; response_deadline: string;
  hours_left: number; quote_submitted_at: string | null;
  total_price: number | null; quoted_unit_price: number | null;
}
export interface ActiveRfqs { open_count: number; responded_count: number; items: ActiveRfqItem[]; }
export interface SupplierActivityEvent {
  type: 'po_received' | 'invoice_status' | 'payment_received' | 'rfq_closing' | 'challan_generated';
  target: string | null; ref_id: string | null; body: string;
  created_at: string; meta: string | null;
}

export interface SupplierDashboardData {
  kpis: SupplierKpis | null;
  attention: SupplierAttention | null;
  velocity: SupplierVelocity | null;
  aging: ReceivablesAging | null;
  rfqs: ActiveRfqs | null;
  activity: SupplierActivityEvent[];
}

const EMPTY: SupplierDashboardData = {
  kpis: null, attention: null, velocity: null, aging: null, rfqs: null, activity: [],
};

export function useSupplierDashboard(supplierId: string | null | undefined) {
  const [data, setData] = useState<SupplierDashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supplierId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rpc = (name: string, args: any) => (supabase as any).rpc(name, args);
      try {
        const [kpis, attention, velocity, aging, rfqs, activity] = await Promise.all([
          rpc('supplier_kpis', { p_supplier_id: supplierId }),
          rpc('supplier_attention_counts', { p_supplier_id: supplierId }),
          rpc('supplier_velocity', { p_supplier_id: supplierId }),
          rpc('supplier_receivables_aging', { p_supplier_id: supplierId }),
          rpc('supplier_active_rfqs', { p_supplier_id: supplierId, p_limit: 5 }),
          rpc('supplier_activity_feed', { p_supplier_id: supplierId, p_limit: 8 }),
        ]);
        if (cancelled) return;
        setData({
          kpis: kpis.data || null,
          attention: attention.data || null,
          velocity: velocity.data || null,
          aging: aging.data || null,
          rfqs: rfqs.data || { open_count: 0, responded_count: 0, items: [] },
          activity: activity.data || [],
        });
      } catch (e) {
        console.error('supplier dashboard fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supplierId]);

  return { data, loading };
}
