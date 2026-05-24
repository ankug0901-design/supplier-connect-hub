// Edge function for N8N "3 Way Matching" workflow — SO-level upsert.
// One record per Sales Order (SO). Each SO holds arrays of client_invoices
// and supplier_invoices. Totals + match logic are derived across the group.
//
// Auth: header `x-n8n-key: <N8N_ACCESS_CODE>`.
//
// Accepted payload shapes (one SO):
// {
//   "so_number": "SO-00094",
//   "client_name": "WISECAPE MANUFACTURING PRIVATE LIMITED",
//   "supplier_name": "BK PRINTPACK INNOVATIONS PRIVATE LIMITED",
//   "supplier_company": "...",
//   "po_numbers": ["EM/125/25-26"],          // optional
//   "client_invoices": [
//     { "invoice_number":"EM/229/2025-26","date":"2026-02-17","amount":326287.50,
//       "quantity":55000,"status":"paid","payment_date":"2026-03-30",
//       "payment_amount":325962.00,"payment_reference":"..." }
//   ],
//   "supplier_invoices": [
//     { "invoice_number":"BKHW/25-26/10759","date":"2026-02-17",
//       "amount":297412.50,"quantity":55000,"status":"paid","po_number":"EM/125/25-26" }
//   ],
//   "notes": "...optional..."
// }
//
// Also accepts a top-level array of such objects, or { records:[ ... ] }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-n8n-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Invoice = {
  invoice_number?: string;
  date?: string | null;
  amount?: number | null;
  quantity?: number | null;
  status?: string | null;
  po_number?: string | null;
  payment_date?: string | null;
  payment_amount?: number | null;
  payment_reference?: string | null;
  [k: string]: unknown;
};

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function asArray<T = any>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") return [v as T];
  return [];
}

function isPaid(status: unknown): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "paid";
}

function buildRow(input: any) {
  const so_number: string | null =
    input?.so_number ?? input?.SO ?? input?.so ?? input?.so_no ?? null;
  if (!so_number) return null;

  const client_invoices: Invoice[] = asArray<Invoice>(
    input.client_invoices ?? input.clientInvoices ?? input.sales_invoices ?? [],
  );
  const supplier_invoices: Invoice[] = asArray<Invoice>(
    input.supplier_invoices ?? input.supplierInvoices ?? input.bills ?? [],
  );

  const total_client_amount = client_invoices.reduce((s, i) => s + num(i.amount), 0);
  const total_supplier_amount = supplier_invoices.reduce((s, i) => s + num(i.amount), 0);
  const total_client_qty = client_invoices.reduce((s, i) => s + num(i.quantity), 0);
  const total_supplier_qty = supplier_invoices.reduce((s, i) => s + num(i.quantity), 0);

  const quantity_match =
    total_client_qty > 0 && total_supplier_qty > 0
      ? total_client_qty === total_supplier_qty
      : null;

  const all_client_paid =
    client_invoices.length > 0 && client_invoices.every((i) => isPaid(i.status));
  const any_client_paid = client_invoices.some((i) => isPaid(i.status));
  const all_supplier_paid =
    supplier_invoices.length > 0 && supplier_invoices.every((i) => isPaid(i.status));

  // PO numbers: from explicit field or derived from supplier invoice lines
  const po_set = new Set<string>();
  asArray<string>(input.po_numbers ?? input.purchase_orders).forEach((p) => p && po_set.add(String(p)));
  supplier_invoices.forEach((i) => i.po_number && po_set.add(String(i.po_number)));
  const po_numbers = Array.from(po_set);

  // Pick latest client payment for display
  const paidClients = client_invoices.filter((i) => isPaid(i.status));
  const latestPay = paidClients.sort((a, b) =>
    String(b.payment_date ?? "").localeCompare(String(a.payment_date ?? "")),
  )[0];

  // Match status — based on quantity + PO link, NOT amount (buy vs sell differ)
  let match_status: string;
  if (quantity_match === true && po_numbers.length > 0) match_status = "matched";
  else if (quantity_match === false) match_status = "mismatch";
  else match_status = "partial";

  const supplier_payment_eligible = all_client_paid && quantity_match === true;
  let supplier_payment_status: string;
  if (all_supplier_paid) supplier_payment_status = "paid";
  else if (supplier_payment_eligible) supplier_payment_status = "eligible";
  else supplier_payment_status = "pending";

  return {
    so_number,
    client_name: input.client_name ?? input.customer_name ?? null,
    supplier_name: input.supplier_name ?? null,
    supplier_company: input.supplier_company ?? input.supplier_name ?? null,
    supplier_id: input.supplier_id ?? null,
    po_numbers,
    po_number: po_numbers[0] ?? null, // legacy single
    client_invoices,
    supplier_invoices,
    client_invoice_amount: total_client_amount,
    supplier_invoice_amount: total_supplier_amount,
    client_quantity: total_client_qty,
    supplier_quantity: total_supplier_qty,
    quantity_match,
    amount_match: null,
    client_invoice_status: all_client_paid ? "paid" : (any_client_paid ? "partial" : "unpaid"),
    client_payment_received: all_client_paid,
    client_payment_date: latestPay?.payment_date ?? null,
    client_payment_amount: paidClients.reduce((s, i) => s + num(i.payment_amount ?? i.amount), 0) || null,
    client_payment_reference: latestPay?.payment_reference ?? null,
    match_status,
    supplier_payment_status,
    supplier_payment_eligible,
    notes: input.notes ?? null,
    raw_payload: input,
    matched_at: new Date().toISOString(),
    // legacy single-invoice fields kept populated from first item for compat
    client_invoice_number: client_invoices[0]?.invoice_number ?? null,
    client_invoice_date: client_invoices[0]?.date ?? null,
    supplier_invoice_number: supplier_invoices[0]?.invoice_number ?? null,
    supplier_invoice_date: supplier_invoices[0]?.date ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const expected = Deno.env.get("N8N_ACCESS_CODE");
    const provided =
      req.headers.get("x-n8n-key") ??
      req.headers.get("x_n8n_key") ??
      req.headers.get("X-N8N-Key") ??
      "";
    const cleaned = provided.trim().replace(/^["']|["']$/g, "");

    if (!expected || cleaned !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const records: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.records)
      ? body.records
      : [body];

    const rows = records.map(buildRow).filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid rows (so_number required)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("three_way_matches")
      .upsert(rows, { onConflict: "so_number", ignoreDuplicates: false })
      .select();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, count: data?.length ?? rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
