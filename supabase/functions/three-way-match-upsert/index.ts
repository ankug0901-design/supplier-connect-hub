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
  balance_due?: number | null;
  balance?: number | null;
  due_date?: string | null;
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
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "paid" || s === "yes";
}

function mapN8nStatus(n8nStatus: string | null): {
  match_status: string;
  supplier_payment_status: string;
  supplier_payment_eligible: boolean;
} {
  switch (n8nStatus) {
    case "Fully Settled":
      return { match_status: "matched", supplier_payment_status: "paid", supplier_payment_eligible: false };
    case "Release to Supplier":
      return { match_status: "matched", supplier_payment_status: "eligible", supplier_payment_eligible: true };
    case "Awaiting 45 Days":
      return { match_status: "matched", supplier_payment_status: "pending", supplier_payment_eligible: false };
    case "Client Payment Due":
      return { match_status: "matched", supplier_payment_status: "pending", supplier_payment_eligible: false };
    case "Awaiting Supplier Bill":
      return { match_status: "partial", supplier_payment_status: "pending", supplier_payment_eligible: false };
    case "Partial":
      return { match_status: "partial", supplier_payment_status: "pending", supplier_payment_eligible: false };
    case "Both Unpaid":
      return { match_status: "partial", supplier_payment_status: "pending", supplier_payment_eligible: false };
    default:
      return { match_status: "partial", supplier_payment_status: "pending", supplier_payment_eligible: false };
  }
}

function isOverdue(supplier_invoices: Invoice[]): boolean {
  const today = Date.now();
  return supplier_invoices.some((si) => {
    if (isPaid(si.status)) return false;
    const bal = num(si.balance_due ?? si.balance ?? si.amount);
    if (bal <= 0) return false;
    if (!si.date) return false;
    const age = (today - new Date(si.date).getTime()) / (1000 * 60 * 60 * 24);
    return age >= 45;
  });
}

function buildRow(input: any) {
  const so_number: string | null =
    input?.so_number ?? input?.SO ?? input?.so ?? input?.so_no ?? null;
  if (!so_number) return null;

  const n8nStatus: string | null = input.status ?? null;

  const client_invoices: Invoice[] = asArray<Invoice>(
    input.client_invoices ?? input.clientInvoices ?? input.sales_invoices ?? [],
  );
  const supplier_invoices: Invoice[] = asArray<Invoice>(
    input.supplier_invoices ?? input.supplierInvoices ?? input.bills ?? [],
  );

  const total_client_amount = num(input.total_invoice_amount) ||
    client_invoices.reduce((s, i) => s + num(i.amount), 0);
  const total_supplier_amount = num(input.total_supplier_amount) ||
    supplier_invoices.reduce((s, i) => s + num(i.amount), 0);
  const total_balance_due = num(input.total_balance_due) ||
    supplier_invoices.reduce((s, i) => s + num(i.balance_due ?? 0), 0);
  const total_margin = num(input.total_margin) || (total_client_amount - total_supplier_amount);

  const all_client_paid = client_invoices.length > 0 && client_invoices.every((i) => isPaid(i.status));
  const any_client_paid = client_invoices.some((i) => isPaid(i.status));
  const all_supplier_paid = supplier_invoices.length > 0 && supplier_invoices.every((i) => isPaid(i.status));

  const po_set = new Set<string>();
  asArray<string>(input.po_numbers ?? input.purchase_orders).forEach((p) => p && po_set.add(String(p)));
  supplier_invoices.forEach((i) => i.po_number && po_set.add(String(i.po_number)));
  const po_numbers = Array.from(po_set);

  const paidClients = client_invoices.filter((i) => isPaid(i.status));
  const latestPay = [...paidClients].sort((a, b) =>
    String(b.payment_date ?? "").localeCompare(String(a.payment_date ?? ""))
  )[0];

  const { match_status, supplier_payment_status, supplier_payment_eligible } = mapN8nStatus(n8nStatus);
  const overdue = isOverdue(supplier_invoices);

  return {
    so_number,
    client_name: input.client_name ?? input.customer_name ?? null,
    supplier_name: input.supplier_name ?? null,
    supplier_company: input.supplier_company ?? input.supplier_name ?? null,
    supplier_id: input.supplier_id ?? null,
    po_numbers,
    po_number: po_numbers[0] ?? null,
    client_invoices,
    supplier_invoices,
    client_invoice_amount: total_client_amount,
    supplier_invoice_amount: total_supplier_amount,
    client_quantity: 0,
    supplier_quantity: 0,
    quantity_match: null,
    amount_match: null,
    client_invoice_status: all_client_paid ? "paid" : (any_client_paid ? "partial" : "unpaid"),
    client_payment_received: all_client_paid,
    client_payment_date: latestPay?.payment_date ?? null,
    client_payment_amount: paidClients.reduce((s, i) => s + num(i.payment_amount ?? i.amount), 0) || null,
    client_payment_reference: latestPay?.payment_reference ?? null,
    match_status,
    supplier_payment_status,
    supplier_payment_eligible,
    overdue,
    n8n_status: n8nStatus,
    total_invoice_amount: total_client_amount,
    total_supplier_amount,
    total_balance_due,
    total_margin,
    notes: input.notes ?? null,
    raw_payload: input,
    matched_at: new Date().toISOString(),
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    const { data, error } = await supabase
      .from("three_way_matches")
      .upsert(rows, { onConflict: "so_number", ignoreDuplicates: false })
      .select("so_number");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentSoNumbers = rows.map((r) => r.so_number);
    const { error: delError } = await supabase
      .from("three_way_matches")
      .delete()
      .not("so_number", "in", `(${currentSoNumbers.map((s) => `"${s}"`).join(",")})`);

    if (delError) {
      console.error("Stale SO cleanup error:", delError.message);
    }

    return new Response(
      JSON.stringify({ ok: true, upserted: data?.length ?? rows.length, cleaned_stale: !delError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
