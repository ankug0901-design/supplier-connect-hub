import { generateText } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const InvoiceValidationItemSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string(),
  supplier: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  recommendation: z.enum(["approve", "review", "reject"]),
  issues: z.array(z.string()).describe("Specific issues found"),
  summary: z.string().describe("One-line explanation"),
});

const RawInvoiceValidationItemSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string().optional(),
  supplier: z.string().optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
  recommendation: z.enum(["approve", "review", "reject"]).optional(),
  issues: z.array(z.string()).optional(),
  summary: z.string().optional(),
  status: z.string().optional(),
  remarks: z.string().optional(),
}).passthrough();

const VendorScoreItemSchema = z.object({
  supplier_id: z.string(),
  company: z.string(),
  score: z.number().min(0).max(100).describe("Overall performance score 0-100"),
  grade: z.enum(["A", "B", "C", "D"]),
  strengths: z.array(z.string()).max(3),
  weaknesses: z.array(z.string()).max(3),
  recommendation: z.string(),
});

const RawVendorScoreItemSchema = z.object({
  supplier_id: z.string(),
  company: z.string().optional(),
  score: z.coerce.number().optional(),
  grade: z.enum(["A", "B", "C", "D"]).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  recommendation: z.string().optional(),
}).passthrough();

const ForecastSchema = z.object({
  summary: z.string().describe("Overall demand outlook for next 90 days"),
  trend: z.enum(["growing", "stable", "declining", "volatile"]),
  next_month_forecast_inr: z.number().describe("Projected PO value next month in INR"),
  next_quarter_forecast_inr: z.number().describe("Projected PO value next quarter in INR"),
  top_categories: z.array(
    z.object({
      category: z.string(),
      projected_inr: z.number(),
      reasoning: z.string(),
    }),
  ),
  reorder_alerts: z.array(
    z.object({
      item_or_supplier: z.string(),
      reason: z.string(),
      urgency: z.enum(["low", "medium", "high"]),
    }),
  ),
  risks: z.array(z.string()),
});

function extractJSON(raw: string): unknown {
  let cleaned = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
    const start = isArray ? arrStart : objStart;
    const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("AI response did not contain valid JSON");
    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

async function generateJson<T>(params: {
  model: any;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const { text, finishReason } = await generateText({
    model: params.model,
    system: `${params.system}\nReturn only valid JSON. Do not use markdown fences, prose, or thousands separators in numbers.`,
    prompt: params.prompt,
  });

  if (finishReason === "length") throw new Error("AI response was truncated; please retry.");
  return params.schema.parse(extractJSON(text));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: me } = await admin
      .from("suppliers")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (me?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { operation } = await req.json();

    const gateway = createLovableAiGatewayProvider(Deno.env.get("LOVABLE_API_KEY")!);
    const model = gateway("google/gemini-2.5-flash");

    if (operation === "validate_invoices") {
      const { data: invoices } = await admin
        .from("invoices")
        .select("id, invoice_number, amount, date, status, po_id, supplier_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!invoices || invoices.length === 0) {
        return new Response(JSON.stringify({ data: { results: [] } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supplierIds = [...new Set(invoices.map((i) => i.supplier_id))];
      const poIds = [...new Set(invoices.map((i) => i.po_id).filter(Boolean))];

      const [{ data: suppliers }, { data: pos }, { data: allInvoices }] = await Promise.all([
        admin.from("suppliers").select("id, company, gst_number").in("id", supplierIds),
        admin.from("purchase_orders").select("id, po_number, amount, status, date, expected_delivery").in("id", poIds),
        admin.from("invoices").select("invoice_number, supplier_id, amount, po_id"),
      ]);

      const supplierMap = new Map(suppliers?.map((s) => [s.id, s]) || []);
      const poMap = new Map(pos?.map((p) => [p.id, p]) || []);
      const dupCounts = new Map<string, number>();
      (allInvoices || []).forEach((inv) => {
        const k = `${inv.supplier_id}::${(inv.invoice_number || "").toLowerCase().trim()}`;
        dupCounts.set(k, (dupCounts.get(k) || 0) + 1);
      });

      const payload = invoices.map((inv) => {
        const sup = supplierMap.get(inv.supplier_id);
        const po = inv.po_id ? poMap.get(inv.po_id) : null;
        const dupKey = `${inv.supplier_id}::${(inv.invoice_number || "").toLowerCase().trim()}`;
        return {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          supplier: sup?.company || "Unknown",
          supplier_gst: sup?.gst_number || null,
          amount: Number(inv.amount || 0),
          date: inv.date,
          po_number: po?.po_number || null,
          po_amount: po ? Number(po.amount || 0) : null,
          po_status: po?.status || null,
          po_expected_delivery: po?.expected_delivery || null,
          duplicate_count: dupCounts.get(dupKey) || 1,
        };
      });

      const resultsArr = await generateJson({
        model,
        schema: z.array(InvoiceValidationItemSchema),
        system:
          "You are an invoice audit assistant for an Indian B2B procurement portal. Flag issues like: amount exceeds PO value, missing/invalid GST, duplicate invoice numbers per supplier, missing PO reference, invoice date before PO date or far in the future, unrealistic round amounts. Be strict but pragmatic. Always return one result per invoice in the same order.",
        prompt: `Validate these ${payload.length} pending invoices and return a JSON array of results. Each result must include invoice_id, invoice_number, supplier, risk, recommendation, issues, and summary.\n\n${JSON.stringify(payload, null, 2)}`,
      });

      return new Response(JSON.stringify({ data: { results: resultsArr } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (operation === "score_vendors") {
      // Refresh data from Zoho first so scoring uses the latest vendor performance metrics
      const syncErrors: string[] = [];
      try {
        const syncRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/zoho-sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({}),
          },
        );
        const syncJson = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok || syncJson?.success === false) {
          syncErrors.push(syncJson?.error || `Zoho sync returned ${syncRes.status}`);
        }
        if (Array.isArray(syncJson?.errors)) syncErrors.push(...syncJson.errors);
      } catch (e: any) {
        syncErrors.push(`Zoho sync failed: ${String(e?.message || e)}`);
      }

      const [{ data: suppliers }, { data: pos }, { data: invoices }, { data: payments }, { data: challans }] =
        await Promise.all([
          admin.from("suppliers").select("id, company, created_at").eq("role", "supplier").limit(200),
          admin.from("purchase_orders").select("supplier_id, amount, status, date, expected_delivery"),
          admin.from("invoices").select("supplier_id, amount, status, date"),
          admin.from("payments").select("invoice_id, amount, status, date"),
          admin.from("delivery_challans").select("supplier_id, date, manifest_status"),
        ]);

      const invBySup = new Map<string, any[]>();
      (invoices || []).forEach((i) => {
        if (!invBySup.has(i.supplier_id)) invBySup.set(i.supplier_id, []);
        invBySup.get(i.supplier_id)!.push(i);
      });

      const aggregated = (suppliers || []).map((s) => {
        const supPos = (pos || []).filter((p) => p.supplier_id === s.id);
        const supInvs = invBySup.get(s.id) || [];
        const supChal = (challans || []).filter((c) => c.supplier_id === s.id);
        const totalPoValue = supPos.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const completedPos = supPos.filter((p) => ["completed", "closed"].includes(String(p.status))).length;
        const onTimeShipments = supChal.filter((c) => String(c.manifest_status) === "delivered").length;
        const rejectedInvoices = supInvs.filter((i) => String(i.status) === "rejected").length;
        const paidInvoices = supInvs.filter((i) => String(i.status) === "paid").length;
        return {
          supplier_id: s.id,
          company: s.company,
          months_active: Math.max(
            1,
            Math.round((Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)),
          ),
          po_count: supPos.length,
          total_po_value_inr: Math.round(totalPoValue),
          completed_po_count: completedPos,
          po_completion_rate: supPos.length ? +(completedPos / supPos.length).toFixed(2) : 0,
          invoice_count: supInvs.length,
          paid_invoice_count: paidInvoices,
          rejected_invoice_count: rejectedInvoices,
          shipment_count: supChal.length,
          on_time_shipment_count: onTimeShipments,
        };
      }).filter((v) => v.po_count > 0 || v.invoice_count > 0);

      if (aggregated.length === 0) {
        return new Response(JSON.stringify({ data: { vendors: [], sync_errors: syncErrors } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const topVendors = aggregated
        .sort((a, b) => b.total_po_value_inr - a.total_po_value_inr)
        .slice(0, 30);

      const vendorsArr = await generateJson({
        model,
        schema: z.array(VendorScoreItemSchema),
        system:
          "You are a vendor performance analyst. Score each vendor 0-100 based on PO completion rate, invoice quality (rejection rate), shipment reliability, and volume. A=excellent (85+), B=good (70-84), C=needs improvement (50-69), D=poor (<50). Be concise.",
        prompt: `Score these vendors based on real procurement data. Return a JSON array with one entry per vendor. Each entry must include supplier_id, company, score, grade, strengths, weaknesses, and recommendation.\n\n${JSON.stringify(topVendors, null, 2)}`,
      });

      // Persist scores for historical tracking
      const metricsBySupplier = new Map(topVendors.map((v) => [v.supplier_id, v]));
      const scoredAt = new Date().toISOString();
      const rows = (vendorsArr || []).map((v) => ({
        supplier_id: v.supplier_id,
        company: v.company,
        score: Math.round(v.score),
        grade: v.grade,
        strengths: v.strengths || [],
        weaknesses: v.weaknesses || [],
        recommendation: v.recommendation,
        metrics: metricsBySupplier.get(v.supplier_id) || {},
        scored_at: scoredAt,
      }));
      if (rows.length) {
        const { error: insertErr } = await admin.from("vendor_scores").insert(rows);
        if (insertErr) console.error("vendor_scores insert error", insertErr);
      }

      return new Response(
        JSON.stringify({ data: { vendors: vendorsArr, scored_at: scoredAt, sync_errors: syncErrors } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (operation === "forecast_demand") {
      const sinceDate = new Date();
      sinceDate.setMonth(sinceDate.getMonth() - 12);
      const { data: pos } = await admin
        .from("purchase_orders")
        .select("id, amount, date, status, supplier_id")
        .gte("date", sinceDate.toISOString().slice(0, 10))
        .order("date", { ascending: true });

      const { data: poItems } = await admin
        .from("po_items")
        .select("po_id, description, quantity, total");

      const monthly = new Map<string, { count: number; value: number }>();
      (pos || []).forEach((p) => {
        const key = String(p.date).slice(0, 7);
        const cur = monthly.get(key) || { count: 0, value: 0 };
        cur.count += 1;
        cur.value += Number(p.amount || 0);
        monthly.set(key, cur);
      });
      const monthlySeries = [...monthly.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, po_count: v.count, total_value_inr: Math.round(v.value) }));

      const itemCounts = new Map<string, { qty: number; value: number; count: number }>();
      (poItems || []).forEach((it) => {
        const key = String(it.description || "Other").toLowerCase().trim().slice(0, 60);
        const cur = itemCounts.get(key) || { qty: 0, value: 0, count: 0 };
        cur.qty += Number(it.quantity || 0);
        cur.value += Number(it.total || 0);
        cur.count += 1;
        itemCounts.set(key, cur);
      });
      const topItems = [...itemCounts.entries()]
        .sort((a, b) => b[1].value - a[1].value)
        .slice(0, 15)
        .map(([item, v]) => ({
          item,
          total_quantity: Math.round(v.qty),
          total_value_inr: Math.round(v.value),
          order_count: v.count,
        }));

      const totals = {
        last_12mo_po_count: (pos || []).length,
        last_12mo_value_inr: Math.round((pos || []).reduce((s, p) => s + Number(p.amount || 0), 0)),
      };

      const object = await generateJson({
        model,
        schema: ForecastSchema,
        system:
          "You are a demand-forecasting analyst for a B2B printing/marketing supplier portal. Use the monthly PO time series to forecast next month and next quarter. Identify seasonality, top recurring categories, and reorder alerts. Be specific and quantitative. All currency in INR.",
        prompt: `Analyze this 12-month procurement history and produce a demand forecast.\n\nTotals: ${JSON.stringify(totals)}\n\nMonthly series:\n${JSON.stringify(monthlySeries, null, 2)}\n\nTop recurring items:\n${JSON.stringify(topItems, null, 2)}`,
      });

      return new Response(JSON.stringify({ data: object }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown operation" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-ai-insights error", e);
    const msg = String((e as any)?.message || e);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
