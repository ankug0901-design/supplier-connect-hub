import { createClient } from "npm:@supabase/supabase-js@2";
import { nextCursorOffset } from "./cursor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_BASE = "https://n8n.srv1141999.hstgr.cloud/webhook";
const ACCESS_CODE = Deno.env.get("N8N_ACCESS_CODE") ?? "";
const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 6;
const UPSTREAM_TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Zoho (via n8n) rate-limits aggressively (429 -> proxy 502). Retry with
// backoff so a transient throttle doesn't produce an empty/partial payload.
async function zoho(operation: string, vendorId: string, attempts = 2) {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${N8N_BASE}/zoho-supplier-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_code: ACCESS_CODE, operation, vendor_id: vendorId }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (res.ok) return res.json();
      lastErr = `Zoho proxy ${operation} failed ${res.status}`;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (error) {
      lastErr = error instanceof DOMException && error.name === "TimeoutError"
        ? `Zoho proxy ${operation} timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s`
        : `Zoho proxy ${operation} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (i < attempts - 1) await sleep(2000 * Math.pow(2, i));
  }
  throw new Error(lastErr);
}


// Pass through Zoho's status verbatim (lowercased)
const passthrough = (s?: string) => (s || "pending").toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const requestedSupplierId = typeof requestBody?.supplier_id === "string" ? requestBody.supplier_id : null;
  let requestedOffset = Number.isFinite(Number(requestBody?.offset))
    ? Math.max(0, Math.floor(Number(requestBody.offset)))
    : 0;
  const requestedBatchSize = Number.isFinite(Number(requestBody?.batch_size))
    ? Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(Number(requestBody.batch_size))))
    : DEFAULT_BATCH_SIZE;

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
  const useCursor = requestBody?.use_cursor === true && !requestedSupplierId;
  if (useCursor && token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let cursorLease: string | null = null;

  // Keep scheduled authorization aligned with this function's live runtime binding.
  // The service-role-only RPC writes through Vault's API and never returns the key.
  const { error: credentialRefreshError } = await supabase.rpc("refresh_zoho_cron_credential", {
    runtime_key: serviceRoleKey,
  });
  if (credentialRefreshError) console.warn("Scheduled Zoho credential refresh failed");

  const summary = {
    suppliers: 0,
    pos_upserted: 0,
    invoices_upserted: 0,
    payments_upserted: 0,
    errors: [] as string[],
  };

  try {
    if (useCursor) {
      const { data: claim, error } = await supabase.rpc("claim_zoho_sync_cursor");
      if (error) throw error;
      if (!claim) return new Response(JSON.stringify({ success: true, skipped: true, reason: "Cursor batch already running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      requestedOffset = claim.offset;
      cursorLease = claim.lease_token;
    }
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
    } else {
      supplierQuery = supplierQuery
        .order("id", { ascending: true })
        .range(requestedOffset, requestedOffset + requestedBatchSize - 1);
    }

    const { data: suppliers, error: sErr } = await supplierQuery;
    if (sErr) throw sErr;

    await Promise.all((suppliers || []).map(async (sup) => {
      const vendorId = sup.zoho_vendor_id as string;
      if (!vendorId) return;
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
          // Prefer Zoho's real order status (approved / open / closed / draft /
          // pending_approval / cancelled) over the legacy `status` field which
          // collapses approved+open into "pending" and hides valid POs from suppliers.
          status: passthrough(p.zohoOrderStatus || p.status),
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

          // Preserve item UUIDs and production tracking during commercial-data sync.
          // The Zoho unique index is partial, so PostgREST cannot infer it from
          // onConflict alone. Match existing line IDs first and upsert on the PK.
          const poIdsWithItems = [...new Set(itemRows.map((r: any) => r.po_id))];
          const withZohoId = itemRows.filter((r: any) => r.zoho_line_item_id);
          const withoutZohoId = itemRows.filter((r: any) => !r.zoho_line_item_id);
          if (poIdsWithItems.length) {
            const { data: storedItems, error: lookupItemsError } = await supabase
              .from("po_items")
              .select("id, po_id, zoho_line_item_id")
              .in("po_id", poIdsWithItems);
            if (lookupItemsError) throw lookupItemsError;

            if (withZohoId.length) {
              const rows = withZohoId.map((row: any) => {
                const existing = storedItems?.find((item: any) =>
                  item.po_id === row.po_id && item.zoho_line_item_id === row.zoho_line_item_id
                );
                return existing ? { ...row, id: existing.id } : row;
              });
              const { error: upsertError } = await supabase
                .from("po_items")
                .upsert(rows, { onConflict: "id", ignoreDuplicates: false });
              if (upsertError) throw upsertError;
            }

            for (const row of withoutZohoId) {
              let lookup = supabase.from("po_items").select("id").eq("po_id", row.po_id);
              lookup = row.item_name === null
                ? lookup.is("item_name", null)
                : lookup.eq("item_name", row.item_name);
              const { data: existing, error: lookupError } = await lookup.maybeSingle();
              if (lookupError) throw lookupError;
              if (existing) {
                const { error: updateError } = await supabase.from("po_items").update({
                  description: row.description,
                  quantity: row.quantity,
                  unit_price: row.unit_price,
                  total: row.total,
                  hsn: row.hsn,
                  tax_percentage: row.tax_percentage,
                  tax_name: row.tax_name,
                }).eq("id", existing.id);
                if (updateError) throw updateError;
              } else {
                const { error: insertError } = await supabase.from("po_items").insert(row);
                if (insertError) throw insertError;
              }
            }

            // Missing/empty Zoho responses never wipe stored items. Only prune
            // obsolete identified lines after confirming they have no history.
            for (const poId of poIdsWithItems) {
              const idsForPo = new Set(withZohoId.filter((r: any) => r.po_id === poId)
                .map((r: any) => r.zoho_line_item_id));
              if (!idsForPo.size) continue;
              const staleItems = (storedItems || []).filter((item: any) =>
                item.po_id === poId && item.zoho_line_item_id && !idsForPo.has(item.zoho_line_item_id)
              );
              for (const staleItem of staleItems) {
                const { count, error: historyError } = await supabase
                  .from("po_production_updates")
                  .select("id", { count: "exact", head: true })
                  .eq("item_id", staleItem.id);
                if (historyError) throw historyError;
                if (count === 0) {
                  const { error: deleteError } = await supabase.from("po_items").delete().eq("id", staleItem.id);
                  if (deleteError) throw deleteError;
                }
              }
            }
          }

        }
      } catch (e: any) {
        summary.errors.push(`PO ${sup.id}: ${e.message}`);
      }

      // PO lookup for invoice linkage
      let poByNumber = new Map<string, string>();
      try {
        const { data: poList, error: poListErr } = await supabase
          .from("purchase_orders")
          .select("id, po_number")
          .eq("supplier_id", sup.id);
        if (poListErr) throw poListErr;
        poByNumber = new Map((poList || []).map(p => [p.po_number, p.id]));
      } catch (e: any) {
        summary.errors.push(`PO lookup ${sup.id}: ${e.message}`);
      }

      // ---- Invoices (Bills) ----
      try {
        const invR = await zoho("get_bills", vendorId);
        const invs = invR.invoices || [];
        const activeInvoiceNumbers = new Set<string>(
          invs.map((i: any) => i.invoiceNumber).filter((n: any) => !!n)
        );
        const invRows = invs.map((i: any) => {
          const poId = i.poNumber ? poByNumber.get(i.poNumber) : null;
          return {
            supplier_id: sup.id,
            po_id: poId || null,
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

        // Reconcile deletions: invoices previously synced from Zoho (zoho_id set)
        // that no longer appear in Zoho's response have been deleted upstream.
        // Remove them locally along with their line items and payments so PO
        // "Invoiced" quantities stay accurate.
        const { data: localSynced } = await supabase
          .from("invoices")
          .select("id, invoice_number")
          .eq("supplier_id", sup.id)
          .not("zoho_id", "is", null);
        const stale = (localSynced || []).filter(
          (row: any) => !activeInvoiceNumbers.has(row.invoice_number)
        );
        if (stale.length) {
          const staleIds = stale.map((r: any) => r.id);
          const staleNumbers = stale.map((r: any) => r.invoice_number);
          await supabase.from("payments").delete().in("invoice_id", staleIds);
          await supabase
            .from("invoice_line_items")
            .delete()
            .eq("supplier_id", sup.id)
            .in("invoice_number", staleNumbers);
          await supabase.from("invoices").delete().in("id", staleIds);
        }

        // Orphan cleanup: invoice_line_items rows whose invoice_number is
        // neither in Zoho's active set nor in our invoices table (e.g. their
        // invoices row was already removed). Skip very recent uploads (<6h)
        // to avoid wiping line items submitted before Zoho ingests the bill.
        const { data: localInvNums } = await supabase
          .from("invoices")
          .select("invoice_number")
          .eq("supplier_id", sup.id);
        const knownInvNumbers = new Set<string>(
          [
            ...(localInvNums || []).map((r: any) => r.invoice_number),
            ...activeInvoiceNumbers,
          ].filter(Boolean)
        );
        const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: liRows } = await supabase
          .from("invoice_line_items")
          .select("id, invoice_number")
          .eq("supplier_id", sup.id)
          .lt("created_at", cutoff);
        const orphanIds = (liRows || [])
          .filter((r: any) => !knownInvNumbers.has(r.invoice_number))
          .map((r: any) => r.id);
        if (orphanIds.length) {
          await supabase.from("invoice_line_items").delete().in("id", orphanIds);
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
          const invoiceNumbers = invoiceNumber ? String(invoiceNumber).split(',').map((s: string) => s.trim()).filter(Boolean) : [];
          let invId: string | null = null;
          for (const num of invoiceNumbers) {
            const found = invByNumber.get(num);
            if (found) { invId = found; break; }
          }
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

        // payments.invoice_id is NOT NULL; skip unmatched payments instead of
        // failing the whole supplier batch on a not-null violation.
        const matchedPayRows = payRows.filter((r: any) => !!r.invoice_id);
        const unmatchedCount = payRows.length - matchedPayRows.length;
        if (unmatchedCount) {
          summary.errors.push(`Payment ${sup.id}: ${unmatchedCount} payment(s) skipped (no matching invoice)`);
        }

        if (matchedPayRows.length) {
          const { error } = await supabase
            .from("payments")
            .upsert(matchedPayRows, { onConflict: "invoice_id,transaction_id" });
          if (error) throw error;
          summary.payments_upserted += matchedPayRows.length;
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
          signal: AbortSignal.timeout(8_000),
        });
      } catch (e) {
        console.warn("po-delivery-reminder kick failed", e);
      }
    }

    const processedCount = (suppliers || []).length;
    const hasMore = !requestedSupplierId && processedCount === requestedBatchSize;
    const cursorNext = nextCursorOffset(requestedOffset, processedCount, requestedBatchSize);
    if (cursorLease) {
      const { data: completed, error } = await supabase.rpc("complete_zoho_sync_cursor", {
        p_token: cursorLease, p_next_offset: cursorNext,
      });
      if (error || !completed) throw error || new Error("Cursor lease expired before completion");
    }
    return new Response(JSON.stringify({
      success: true,
      ...summary,
      has_more: hasMore,
      offset: requestedOffset,
      next_offset: useCursor ? cursorNext : hasMore ? requestedOffset + processedCount : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (cursorLease) {
      await supabase.rpc("complete_zoho_sync_cursor", { p_token: cursorLease, p_next_offset: requestedOffset });
    }
    console.error("zoho-sync fatal", {
      message: e?.message, code: e?.code, details: e?.details, hint: e?.hint, stack: e?.stack,
    });
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e), code: e?.code, details: e?.details, hint: e?.hint, ...summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
