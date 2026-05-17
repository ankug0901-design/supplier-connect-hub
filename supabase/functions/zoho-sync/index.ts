import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_BASE = "https://n8n.srv1141999.hstgr.cloud/webhook";
const ACCESS_CODE = "Embmkt@2026";

async function zoho(operation: string, vendorId: string) {
  const res = await fetch(`${N8N_BASE}/zoho-supplier-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_code: ACCESS_CODE, operation, vendor_id: vendorId }),
  });
  if (!res.ok) throw new Error(`Zoho proxy ${operation} failed ${res.status}`);
  return res.json();
}

function mapPOStatus(s?: string, billed?: string): string {
  const v = (s || "").toLowerCase();
  const b = (billed || "").toLowerCase();
  if (b === "billed" || v === "closed" || v === "completed") return "completed";
  if (b === "partially_billed" || v === "partial") return "partial";
  if (v === "invoiced") return "invoiced";
  return "pending";
}

function mapInvoiceStatus(s?: string): string {
  const v = (s || "").toLowerCase();
  if (v === "paid") return "paid";
  if (v === "rejected" || v === "void") return "rejected";
  if (v === "approved" || v === "open" || v === "partially_paid") return "approved";
  return "pending";
}

function mapPaymentStatus(s?: string): string {
  const v = (s || "").toLowerCase();
  if (v === "processing" || v === "pending") return "processing";
  return "completed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const summary = {
    suppliers: 0,
    pos_upserted: 0,
    invoices_upserted: 0,
    payments_upserted: 0,
    errors: [] as string[],
  };

  try {
    let supplierQuery = supabase
      .from("suppliers")
      .select("id, zoho_vendor_id")
      .not("zoho_vendor_id", "is", null)
      .neq("zoho_vendor_id", "");

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.supplier_id) supplierQuery = supabase
          .from("suppliers")
          .select("id, zoho_vendor_id")
          .eq("id", body.supplier_id);
      } catch (_) { /* no body */ }
    }

    const { data: suppliers, error: sErr } = await supplierQuery;
    if (sErr) throw sErr;

    for (const sup of suppliers || []) {
      const vendorId = sup.zoho_vendor_id as string;
      if (!vendorId) continue;
      summary.suppliers++;

      // ---- Purchase Orders ----
      try {
        const posR = await zoho("get_pos", vendorId);
        const pos = posR.purchaseOrders || [];
        const poRows = pos.map((p: any) => ({
          supplier_id: sup.id,
          po_number: p.poNumber,
          zoho_id: p.id,
          date: p.date || new Date().toISOString().slice(0, 10),
          amount: Number(p.amount || 0),
          status: mapPOStatus(p.status, p.zohoBilledStatus),
          expected_delivery: p.expectedDelivery || null,
          delivery_address: p.deliveryAddress || null,
        })).filter((r: any) => r.po_number);

        if (poRows.length) {
          const { error } = await supabase
            .from("purchase_orders")
            .upsert(poRows, { onConflict: "supplier_id,po_number" });
          if (error) throw error;
          summary.pos_upserted += poRows.length;
        }
      } catch (e: any) {
        summary.errors.push(`PO ${sup.id}: ${e.message}`);
      }

      // PO lookup for invoice linkage
      const { data: poList } = await supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("supplier_id", sup.id);
      const poByNumber = new Map((poList || []).map(p => [p.po_number, p.id]));

      // ---- Invoices (Bills) ----
      try {
        const invR = await zoho("get_bills", vendorId);
        const invs = invR.invoices || [];
        const invRows = invs.map((i: any) => {
          const poId = i.poNumber ? poByNumber.get(i.poNumber) : null;
          if (!poId) return null;
          return {
            supplier_id: sup.id,
            po_id: poId,
            invoice_number: i.invoiceNumber,
            zoho_id: i.id,
            date: i.date || new Date().toISOString().slice(0, 10),
            amount: Number(i.amount || 0),
            status: mapInvoiceStatus(i.status),
          };
        }).filter((r: any) => r && r.invoice_number);

        if (invRows.length) {
          const { error } = await supabase
            .from("invoices")
            .upsert(invRows, { onConflict: "supplier_id,invoice_number" });
          if (error) throw error;
          summary.invoices_upserted += invRows.length;
        }
      } catch (e: any) {
        summary.errors.push(`Invoice ${sup.id}: ${e.message}`);
      }

      // ---- Payments ----
      try {
        const { data: invList } = await supabase
          .from("invoices")
          .select("id, invoice_number")
          .eq("supplier_id", sup.id);
        const invByNumber = new Map((invList || []).map(i => [i.invoice_number, i.id]));

        const payR = await zoho("get_payments", vendorId);
        const pays = payR.payments || [];
        const payRows = pays.map((p: any) => {
          const invId = p.invoiceNumber ? invByNumber.get(p.invoiceNumber) : null;
          if (!invId) return null;
          return {
            invoice_id: invId,
            amount: Number(p.amount || 0),
            date: p.date || new Date().toISOString().slice(0, 10),
            status: mapPaymentStatus(p.status),
            transaction_id: p.transactionId || p.paymentNumber || p.id,
          };
        }).filter((r: any) => r && r.transaction_id);

        if (payRows.length) {
          const { error } = await supabase
            .from("payments")
            .upsert(payRows, { onConflict: "invoice_id,transaction_id" });
          if (error) throw error;
          summary.payments_upserted += payRows.length;
        }
      } catch (e: any) {
        summary.errors.push(`Payment ${sup.id}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("zoho-sync fatal", e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e), ...summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
