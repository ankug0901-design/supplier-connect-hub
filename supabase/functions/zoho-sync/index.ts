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

function mapPOStatus(s?: string): string {
  const v = (s || "").toLowerCase();
  if (["billed", "closed", "completed"].includes(v)) return "completed";
  if (["partially_billed", "partial"].includes(v)) return "partial";
  if (["invoiced"].includes(v)) return "invoiced";
  return "pending";
}

function mapInvoiceStatus(s?: string): string {
  const v = (s || "").toLowerCase();
  if (["paid"].includes(v)) return "paid";
  if (["rejected", "void"].includes(v)) return "rejected";
  if (["open", "approved", "partially_paid"].includes(v)) return "approved";
  return "pending";
}

function mapPaymentStatus(s?: string): string {
  const v = (s || "").toLowerCase();
  if (["paid", "completed", "success"].includes(v)) return "completed";
  if (["processing", "pending_approval"].includes(v)) return "processing";
  return "completed"; // Zoho payments default to completed once recorded
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
    // Optional: sync a single supplier when called with { supplier_id }
    let supplierQuery = supabase
      .from("suppliers")
      .select("id, zoho_vendor_id")
      .not("zoho_vendor_id", "is", null);

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.supplier_id) supplierQuery = supplierQuery.eq("id", body.supplier_id);
      } catch (_) { /* no body */ }
    }

    const { data: suppliers, error: sErr } = await supplierQuery;
    if (sErr) throw sErr;

    for (const sup of suppliers || []) {
      summary.suppliers++;
      const vendorId = sup.zoho_vendor_id as string;
      if (!vendorId) continue;

      // ---- Purchase Orders ----
      try {
        const posR = await zoho("get_pos", vendorId);
        const pos = posR.purchaseOrders || [];
        const poRows = pos.map((p: any) => ({
          supplier_id: sup.id,
          po_number: p.purchaseorder_number,
          zoho_id: p.purchaseorder_id,
          date: p.date || new Date().toISOString().slice(0, 10),
          amount: Number(p.total || 0),
          status: mapPOStatus(p.status),
          expected_delivery: p.delivery_date || null,
          delivery_address: p.delivery_address || null,
        })).filter((r: any) => r.po_number);

        if (poRows.length) {
          const { error } = await supabase
            .from("purchase_orders")
            .upsert(poRows, { onConflict: "supplier_id,po_number" });
          if (error) throw error;
          summary.pos_upserted += poRows.length;
        }
      } catch (e: any) {
        summary.errors.push(`PO sync ${sup.id}: ${e.message}`);
      }

      // Build PO lookup for invoice/payment linkage
      const { data: poList } = await supabase
        .from("purchase_orders")
        .select("id, po_number, zoho_id")
        .eq("supplier_id", sup.id);
      const poByNumber = new Map((poList || []).map(p => [p.po_number, p.id]));

      // ---- Invoices (Bills) ----
      let invRows: any[] = [];
      try {
        const invR = await zoho("get_bills", vendorId);
        const invs = invR.invoices || [];
        invRows = invs.map((i: any) => {
          const poNum = i.purchaseorder_number || (i.purchaseorders?.[0]?.purchaseorder_number);
          const poId = poNum ? poByNumber.get(poNum) : null;
          if (!poId) return null;
          return {
            supplier_id: sup.id,
            po_id: poId,
            invoice_number: i.bill_number,
            zoho_id: i.bill_id,
            date: i.date || new Date().toISOString().slice(0, 10),
            amount: Number(i.total || 0),
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
        summary.errors.push(`Invoice sync ${sup.id}: ${e.message}`);
      }

      // ---- Payments ----
      try {
        const { data: invList } = await supabase
          .from("invoices")
          .select("id, invoice_number, zoho_id")
          .eq("supplier_id", sup.id);
        const invByZohoId = new Map((invList || []).map(i => [i.zoho_id, i.id]));
        const invByNumber = new Map((invList || []).map(i => [i.invoice_number, i.id]));

        const payR = await zoho("get_payments", vendorId);
        const pays = payR.payments || [];
        const payRows: any[] = [];
        for (const p of pays) {
          // payment may reference one or more bills
          const refs = p.bills || p.applied_bills || (p.bill_id ? [{ bill_id: p.bill_id, bill_number: p.bill_number }] : []);
          const targets = refs.length ? refs : [{ bill_id: null, bill_number: p.bill_number }];
          for (const r of targets) {
            const invId = (r.bill_id && invByZohoId.get(r.bill_id)) || (r.bill_number && invByNumber.get(r.bill_number));
            if (!invId) continue;
            payRows.push({
              invoice_id: invId,
              amount: Number(r.amount_applied || r.amount || p.amount || 0),
              date: p.date || new Date().toISOString().slice(0, 10),
              status: mapPaymentStatus(p.status),
              transaction_id: p.payment_id || p.reference_number || p.payment_number || `${p.date}-${invId}`,
            });
          }
        }

        if (payRows.length) {
          const { error } = await supabase
            .from("payments")
            .upsert(payRows, { onConflict: "invoice_id,transaction_id" });
          if (error) throw error;
          summary.payments_upserted += payRows.length;
        }
      } catch (e: any) {
        summary.errors.push(`Payment sync ${sup.id}: ${e.message}`);
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
