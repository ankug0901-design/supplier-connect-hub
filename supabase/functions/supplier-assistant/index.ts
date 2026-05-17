import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

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
  if (!res.ok) throw new Error(`Zoho proxy error ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) {
      console.error("auth.getUser failed", { hasJwt: !!jwt, err: userErr?.message });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: supplier } = await supabase
      .from("suppliers")
      .select("id, name, company, email, zoho_vendor_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!supplier) {
      return new Response(JSON.stringify({ error: "Supplier profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages }: { messages: UIMessage[] } = await req.json();
    const vendorId = supplier.zoho_vendor_id;

    const tools = {
      list_purchase_orders: tool({
        description: "List purchase orders (POs) for the current supplier. Returns PO numbers, dates, amounts, and statuses.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!vendorId) return { error: "Account not linked to Zoho yet." };
          const data = await zoho("get_pos", vendorId);
          const pos = (data.purchaseOrders || []).slice(0, 50).map((p: any) => ({
            po_number: p.purchaseorder_number,
            date: p.date,
            status: p.status,
            total: p.total,
            currency: p.currency_code,
            expected_delivery: p.delivery_date,
          }));
          return { count: pos.length, purchase_orders: pos };
        },
      }),
      list_invoices: tool({
        description: "List invoices/bills the supplier has submitted, with status and amounts.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!vendorId) return { error: "Account not linked to Zoho yet." };
          const data = await zoho("get_bills", vendorId);
          const invs = (data.invoices || []).slice(0, 50).map((i: any) => ({
            invoice_number: i.bill_number,
            date: i.date,
            status: i.status,
            total: i.total,
            balance: i.balance,
            due_date: i.due_date,
          }));
          return { count: invs.length, invoices: invs };
        },
      }),
      list_payments: tool({
        description: "List payments received by the supplier from the client.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!vendorId) return { error: "Account not linked to Zoho yet." };
          const data = await zoho("get_payments", vendorId);
          const pays = (data.payments || []).slice(0, 50).map((p: any) => ({
            payment_number: p.payment_number,
            date: p.date,
            amount: p.amount,
            status: p.status,
            reference: p.reference_number,
          }));
          return { count: pays.length, payments: pays };
        },
      }),
      list_submission_status: tool({
        description: "Summarize the supplier's submission status: pending POs (no invoice yet), pending invoices (awaiting payment), and totals.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!vendorId) return { error: "Account not linked to Zoho yet." };
          const [posR, invR, payR] = await Promise.all([
            zoho("get_pos", vendorId),
            zoho("get_bills", vendorId),
            zoho("get_payments", vendorId),
          ]);
          const pos = posR.purchaseOrders || [];
          const invs = invR.invoices || [];
          const pays = payR.payments || [];
          return {
            total_pos: pos.length,
            pending_pos: pos.filter((p: any) => p.status === "pending" || p.status === "open").length,
            total_invoices: invs.length,
            pending_invoices: invs.filter((i: any) => i.status === "pending" || i.status === "open").length,
            total_payments_received: pays
              .filter((p: any) => p.status === "completed" || p.status === "paid")
              .reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
          };
        },
      }),
    };

    const gateway = createLovableAiGatewayProvider(Deno.env.get("LOVABLE_API_KEY")!);
    const model = gateway("google/gemini-3-flash-preview");

    const system = `You are the assistant for the Emboss Marketing supplier portal.
You help the supplier "${supplier.name}" (company: ${supplier.company}) answer questions about their purchase orders (POs), invoices, payments, and submission status.

Rules:
- Use the available tools to look up live data before answering anything factual about POs, invoices, payments, or status. Never invent numbers.
- Be concise. Prefer compact markdown tables for lists.
- Format currency in INR (₹) unless the data indicates otherwise.
- If the account isn't linked to Zoho yet (tool returns "Account not linked"), tell the user to complete account setup.
- For navigation help, mention these pages: /purchase-orders, /invoices, /payments, /invoices/upload, /delivery-challan, /shipments.`;

    const result = streamText({
      model,
      system,
      tools,
      stopWhen: stepCountIs(50),
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (e) {
    console.error("supplier-assistant error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
