import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_BASE = "https://n8n.srv1141999.hstgr.cloud/webhook";
const ACCESS_CODE = Deno.env.get("N8N_ACCESS_CODE") ?? "";

async function zoho(operation: string, vendorId: string) {
  const res = await fetch(`${N8N_BASE}/zoho-supplier-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_code: ACCESS_CODE, operation, vendor_id: vendorId }),
  });
  if (!res.ok) throw new Error(`Zoho proxy ${operation} failed ${res.status}`);
  return res.json();
}

// Pass through Zoho's status verbatim (lowercased)
const passthrough = (s?: string) => (s || "pending").toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const requestedSupplierId = typeof requestBody?.supplier_id === "string" ? requestBody.supplier_id : null;

  // Auth check: accept either the service role key (for internal calls from other edge
  // functions like admin-ai-insights), cron, an admin user, or a supplier syncing
  // only their own supplier row.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const apikeyHeader = req.headers.get("apikey") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  let authorized = false;
  // Allow scheduled cron triggers (identified by apikey=anon key, no user JWT).
  // The function only proxies vendor data into our DB using a fixed access code,
  // so a cron-triggered bulk sync is safe to run unauthenticated.
  if (!token && apikeyHeader && apikeyHeader === anonKey) {
    authorized = true;
  } else if (token && token === serviceRoleKey) {
    authorized = true;
  } else if (token) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    if (userData?.user) {
      const { data: supplierRow } = await userClient
        .from("suppliers")
        .select("id, role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (["admin", "super_user"].includes(String(supplierRow?.role || ""))) authorized = true;
      if (requestedSupplierId && supplierRow?.id === requestedSupplierId) authorized = true;
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    if (requestedSupplierId) {
      supplierQuery = supabase
        .from("suppliers")
        .select("id, zoho_vendor_id")
        .eq("id", requestedSupplierId);
    }

    const { data: suppliers, error: sErr } = await supplierQuery;
    if (sErr) throw sErr;

    await Promise.all((suppliers || []).map(async (sup) => {
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
          status: passthrough(p.status),
          expected_delivery: p.expectedDelivery || null,
          delivery_address: p.deliveryAddress || null,
        })).filter((r: any) => r.po_number);

        if (poRows.length) {
          const { error } = await supabase
            .from("purchase_orders")
            .upsert(poRows, { onConflict: "supplier_id,po_number" });
          if (error) throw error;
          summary.pos_upserted += poRows.length;

          const { data: syncedPoList, error: lookupError } = await supabase
            .from("purchase_orders")
            .select("id, po_number")
            .eq("supplier_id", sup.id)
            .in("po_number", poRows.map((p: any) => p.po_number));
          if (lookupError) throw lookupError;

          const poIdByNumber = new Map((syncedPoList || []).map((p: any) => [p.po_number, p.id]));
          const itemRows = pos.flatMap((p: any) => {
            const poId = poIdByNumber.get(p.poNumber);
            const items = Array.isArray(p.items) ? p.items : Array.isArray(p.line_items) ? p.line_items : [];
            if (!poId || !items.length) return [];
            return items.map((it: any) => {
              const quantity = Number(it.quantity || 0);
              const unitPrice = Number(it.rate ?? it.unit_price ?? it.unitPrice ?? 0);
              const zohoLineId = it.line_item_id ?? it.lineItemId ?? it.line_id ?? it.item_id ?? null;
              const zohoName = it.item_name ?? it.name ?? null;
              const zohoDescription = it.description ?? it.item_description ?? zohoName ?? "Item";
              const hsn = it.hsn_or_sac ?? it.hsn ?? it.sac ?? it.hsn_sac ?? null;
              const taxPctRaw = it.tax_percentage ?? it.tax_rate ?? it.tax_percent ?? null;
              const taxPct = taxPctRaw === null || taxPctRaw === '' ? null : Number(taxPctRaw);
              const taxName = it.tax_name ?? it.tax_type ?? null;
              return {
                po_id: poId,
                description: zohoDescription,
                item_name: zohoName,
                zoho_line_item_id: zohoLineId ? String(zohoLineId) : null,
                quantity: Math.max(1, Math.round(quantity || 1)),
                unit_price: unitPrice,
                total: Number(it.total ?? it.item_total ?? quantity * unitPrice ?? 0),
                hsn: hsn ? String(hsn) : null,
                tax_percentage: Number.isFinite(taxPct as number) ? taxPct : null,
                tax_name: taxName ? String(taxName) : null,
              };
            });
          });

          if (syncedPoList?.length) {
            const { error: deleteItemsError } = await supabase
              .from("po_items")
              .delete()
              .in("po_id", syncedPoList.map((p: any) => p.id));
            if (deleteItemsError) throw deleteItemsError;
          }
          if (itemRows.length) {
            const { error: itemError } = await supabase.from("po_items").insert(itemRows);
            if (itemError) throw itemError;
          }
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
            due_date: i.dueDate || i.due_date || null,
            payment_date: i.paymentDate || i.payment_date || i.last_payment_date || null,
            amount: Number(i.amount || 0),
            balance: Number(i.balance ?? i.balance_due ?? i.amount ?? 0),
            has_attachment: Boolean(i.hasAttachment ?? i.has_attachment ?? false),
            attachment_name: i.attachmentName || i.attachment_name || null,
            status: passthrough(i.status),
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
          const invoiceNumber = p.invoiceNumber || p.invoice_number || p.billNumber || p.bill_number;
          const paymentNumber = p.paymentNumber || p.payment_number || p.referenceNumber || p.reference_number || p.id || p.payment_id;
          const invId = invoiceNumber ? invByNumber.get(invoiceNumber) : null;
          if (!invId) return null;
          return {
            invoice_id: invId,
            amount: Number(p.amount || p.payment_amount || p.paymentAmount || 0),
            date: p.date || p.payment_date || p.paymentDate || new Date().toISOString().slice(0, 10),
            status: passthrough(p.status),
            transaction_id: p.transactionId || p.transaction_id || p.referenceNumber || p.reference_number || paymentNumber,
            payment_number: paymentNumber,
            payment_mode: p.paymentMode || p.payment_mode || p.mode || null,
            account: p.account || p.paidThroughAccountName || p.paid_through_account_name || p.accountName || p.account_name || p.paidThrough || p.paid_through || null,
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
    }));

    // Fire-and-forget: trigger PO delivery confirmation reminder for any newly
    // synced POs that still need confirmation. The function itself deduplicates
    // so the daily cron and ad-hoc kicks won't double-send within 20h.
    if (summary.pos_upserted > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/po-delivery-reminder`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
          body: "{}",
        });
      } catch (e) {
        console.warn("po-delivery-reminder kick failed", e);
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
