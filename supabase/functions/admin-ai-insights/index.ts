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

const RiskLevel = z.preprocess((v) => {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return undefined;
  if (s.includes("high") || s.includes("critical") || s.includes("severe")) return "high";
  if (s.includes("med") || s.includes("moderate") || s.includes("warn")) return "medium";
  if (s.includes("low") || s.includes("minor") || s.includes("none") || s.includes("ok") || s.includes("pass")) return "low";
  return undefined;
}, z.enum(["low", "medium", "high"]).optional());

const RawInvoiceValidationItemSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string().optional(),
  supplier: z.string().optional(),
  risk: RiskLevel,
  recommendation: z.string().optional(),
  issues: z.union([z.array(z.string()), z.string()]).optional(),
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
  strengths: z.union([z.array(z.string()), z.string()]).optional(),
  weaknesses: z.union([z.array(z.string()), z.string()]).optional(),
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

type ForecastTrend = "growing" | "stable" | "declining" | "volatile";

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

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).slice(0, 3);
  if (typeof value === "string") return value.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  return [];
}

function normalizeRecommendation(value: unknown, failed: boolean, hasIssues: boolean): "approve" | "review" | "reject" {
  const rec = String(value || "").toLowerCase();
  if (rec.includes("reject") || rec.includes("fail") || rec.includes("block")) return "reject";
  if (rec.includes("approve") || rec.includes("pass")) return "approve";
  if (rec.includes("review") || rec.includes("check") || rec.includes("hold")) return "review";
  return failed ? "reject" : hasIssues ? "review" : "approve";
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return Math.round(fallback);
}

function normalizeTrend(value: unknown, monthlySeries: Array<{ total_value_inr: number }>): ForecastTrend {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("grow") || raw.includes("increase") || raw.includes("rising")) return "growing";
  if (raw.includes("declin") || raw.includes("decrease") || raw.includes("falling")) return "declining";
  if (raw.includes("volatil") || raw.includes("fluctuat") || raw.includes("uneven")) return "volatile";
  const values = monthlySeries.map((m) => m.total_value_inr).filter((v) => v > 0);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
  const recent = avg(values.slice(-3));
  const previous = avg(values.slice(-6, -3));
  if (previous > 0 && Math.abs(recent - previous) / previous > 0.35) return "volatile";
  if (previous > 0 && recent > previous * 1.15) return "growing";
  if (previous > 0 && recent < previous * 0.85) return "declining";
  return "stable";
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

      const rawResults = await generateJson({
        model,
        schema: z.array(RawInvoiceValidationItemSchema),
        system:
          "You are an invoice audit assistant for an Indian B2B procurement portal. Flag issues like: amount exceeds PO value, missing/invalid GST, duplicate invoice numbers per supplier, missing PO reference, invoice date before PO date or far in the future, unrealistic round amounts. Be strict but pragmatic. Always return one result per invoice in the same order.",
        prompt: `Validate these ${payload.length} pending invoices and return a JSON array of results. Each result must include invoice_id, invoice_number, supplier, risk, recommendation, issues, and summary.\n\n${JSON.stringify(payload, null, 2)}`,
      });
      const invoiceById = new Map(payload.map((p) => [p.invoice_id, p]));
      const resultsArr = rawResults.map((r) => {
        const inv = invoiceById.get(r.invoice_id);
        const issues = toStringArray(r.issues).length ? toStringArray(r.issues) : toStringArray(r.remarks);
        const failed = String(r.status || "").toLowerCase() === "failed";
        return InvoiceValidationItemSchema.parse({
          invoice_id: r.invoice_id,
          invoice_number: r.invoice_number || inv?.invoice_number || "Unknown",
          supplier: r.supplier || inv?.supplier || "Unknown",
          risk: r.risk || (failed || issues.length > 1 ? "high" : issues.length ? "medium" : "low"),
          recommendation: normalizeRecommendation(r.recommendation, failed, issues.length > 0),
          issues,
          summary: r.summary || r.remarks || (issues.length ? issues.join(", ") : "No material issues found"),
        });
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

      const [{ data: suppliers }, { data: pos }, { data: invoices }, { data: payments }, { data: challans }, { data: deliveryPerf }] =
        await Promise.all([
          admin.from("suppliers").select("id, company, created_at").eq("role", "supplier").limit(200),
          admin.from("purchase_orders").select("supplier_id, amount, status, date, expected_delivery"),
          admin.from("invoices").select("supplier_id, amount, status, date"),
          admin.from("payments").select("invoice_id, amount, status, date"),
          admin.from("delivery_challans").select("supplier_id, date, manifest_status"),
          admin
            .from("supplier_delivery_performance")
            .select("supplier_id, days_variance, on_time")
            .not("days_variance", "is", null),
        ]);

      const invBySup = new Map<string, any[]>();
      (invoices || []).forEach((i) => {
        if (!invBySup.has(i.supplier_id)) invBySup.set(i.supplier_id, []);
        invBySup.get(i.supplier_id)!.push(i);
      });

      const deliveryBySup = new Map<string, { variances: number[]; onTime: number; total: number }>();
      (deliveryPerf || []).forEach((d: any) => {
        if (!d.supplier_id || d.days_variance === null) return;
        if (!deliveryBySup.has(d.supplier_id)) {
          deliveryBySup.set(d.supplier_id, { variances: [], onTime: 0, total: 0 });
        }
        const entry = deliveryBySup.get(d.supplier_id)!;
        entry.variances.push(Number(d.days_variance));
        entry.total += 1;
        if (d.on_time) entry.onTime += 1;
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
        const delivery = deliveryBySup.get(s.id);
        const deliveryLineCount = delivery?.total || 0;
        const onTimeDeliveryRate = deliveryLineCount
          ? +(delivery!.onTime / deliveryLineCount).toFixed(2)
          : null;
        const avgDaysLate = deliveryLineCount
          ? +(
              delivery!.variances
                .map((v) => Math.max(v, 0))
                .reduce((s, v) => s + v, 0) / deliveryLineCount
            ).toFixed(1)
          : null;
        const avgDaysVariance = deliveryLineCount
          ? +(delivery!.variances.reduce((s, v) => s + v, 0) / deliveryLineCount).toFixed(1)
          : null;
        const lateDeliveries = deliveryLineCount
          ? delivery!.variances.filter((v) => v > 0).length
          : 0;
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
          // Delivery performance: actual delivery date (per invoice line item) vs PO expected_delivery
          delivery_line_count: deliveryLineCount,
          on_time_delivery_rate: onTimeDeliveryRate,
          avg_days_late: avgDaysLate,
          avg_days_variance: avgDaysVariance,
          late_delivery_count: lateDeliveries,
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

      const rawVendors = await generateJson({
        model,
        schema: z.array(RawVendorScoreItemSchema),
        system:
          "You are a vendor performance analyst for an Indian B2B procurement portal. Score each vendor 0-100 using this weighting: 40% on-time delivery (use on_time_delivery_rate and avg_days_late comparing actual delivery date vs PO expected_delivery — this is the most important factor), 25% PO completion rate, 20% invoice quality (low rejection rate), 15% shipment reliability and volume. Treat delivery_line_count < 3 as 'insufficient delivery data' — note it in weaknesses and lean on other metrics. A=excellent (85+, on_time_delivery_rate >= 0.9), B=good (70-84), C=needs improvement (50-69), D=poor (<50, on_time_delivery_rate < 0.5 or avg_days_late > 7). Mention concrete delivery numbers in strengths/weaknesses (e.g. '92% on-time across 24 deliveries' or 'avg 5.3 days late'). Be concise.",
        prompt: `Score these vendors based on real procurement data. Return a JSON array with one entry per vendor. Each entry must include supplier_id, company, score, grade, strengths, weaknesses, and recommendation.\n\n${JSON.stringify(topVendors, null, 2)}`,
      });
      const vendorById = new Map(topVendors.map((v) => [v.supplier_id, v]));
      const vendorsArr = rawVendors.map((v) => {
        const metrics = vendorById.get(v.supplier_id);
        const score = Math.max(0, Math.min(100, Math.round(v.score ?? 0)));
        const grade = v.grade || (score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D");
        return VendorScoreItemSchema.parse({
          supplier_id: v.supplier_id,
          company: v.company || metrics?.company || "Unknown",
          score,
          grade,
          strengths: toStringArray(v.strengths),
          weaknesses: toStringArray(v.weaknesses),
          recommendation: v.recommendation || (grade === "A" ? "Preferred vendor" : grade === "D" ? "Review before new awards" : "Monitor performance"),
        });
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

      const baselineMonth = monthlySeries.length
        ? Math.round(monthlySeries.slice(-3).reduce((sum, m) => sum + m.total_value_inr, 0) / Math.min(3, monthlySeries.length))
        : Math.round(totals.last_12mo_value_inr / 12);

      const rawForecast = await generateJson({
        model,
        schema: z.record(z.string(), z.any()),
        system:
          "You are a demand-forecasting analyst for a B2B printing/marketing supplier portal. Use the monthly PO time series to forecast next month and next quarter. Identify seasonality, top recurring categories, and reorder alerts. Be specific and quantitative. All currency in INR.",
        prompt: `Analyze this 12-month procurement history and produce a demand forecast as one JSON object. Use these exact keys when possible: summary, trend, next_month_forecast_inr, next_quarter_forecast_inr, top_categories, reorder_alerts, risks.\n\nTotals: ${JSON.stringify(totals)}\n\nMonthly series:\n${JSON.stringify(monthlySeries, null, 2)}\n\nTop recurring items:\n${JSON.stringify(topItems, null, 2)}`,
      });

      const object = ForecastSchema.parse({
        summary: String(rawForecast.summary || rawForecast.outlook || rawForecast.forecast_summary || "Demand is forecast from recent purchase order history and recurring item value."),
        trend: normalizeTrend(rawForecast.trend, monthlySeries),
        next_month_forecast_inr: toNumber(rawForecast.next_month_forecast_inr ?? rawForecast.next_month ?? rawForecast.monthly_forecast_inr, baselineMonth),
        next_quarter_forecast_inr: toNumber(rawForecast.next_quarter_forecast_inr ?? rawForecast.next_quarter ?? rawForecast.quarterly_forecast_inr, baselineMonth * 3),
        top_categories: (Array.isArray(rawForecast.top_categories) ? rawForecast.top_categories : topItems.slice(0, 5)).map((c: any) => ({
          category: String(c.category || c.item || c.description || "Other"),
          projected_inr: toNumber(c.projected_inr ?? c.projected_value_inr ?? c.total_value_inr, baselineMonth),
          reasoning: String(c.reasoning || c.reason || "Based on recurring PO item value."),
        })),
        reorder_alerts: (Array.isArray(rawForecast.reorder_alerts) ? rawForecast.reorder_alerts : []).map((a: any) => ({
          item_or_supplier: String(a.item_or_supplier || a.item || a.supplier || "Recurring item"),
          reason: String(a.reason || "Monitor demand against recent purchase order activity."),
          urgency: ["low", "medium", "high"].includes(String(a.urgency)) ? String(a.urgency) : "medium",
        })),
        risks: toStringArray(rawForecast.risks).length ? toStringArray(rawForecast.risks) : ["Forecast accuracy depends on the available 12-month PO history."],
      });

      return new Response(JSON.stringify({ data: object }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (operation === "generate_nudges") {
      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const [{ data: suppliers }, { data: pendingRegs }, { data: pendingInvoices }, { data: openPos }, { data: allInvoicesForPos }, { data: latestScores }] = await Promise.all([
        admin.from("suppliers").select("id, company, email, name").eq("role", "supplier"),
        admin.from("supplier_registrations").select("id, company, email, created_at, status").eq("status", "pending").lte("created_at", sevenDaysAgo),
        admin.from("invoices").select("id, supplier_id, invoice_number, amount, status, date, po_id").eq("status", "pending"),
        admin.from("purchase_orders").select("id, supplier_id, po_number, amount, status, expected_delivery").in("status", ["pending", "open"]),
        admin.from("invoices").select("id, po_id, amount, status"),
        admin.from("vendor_scores").select("supplier_id, score, grade, weaknesses, scored_at").order("scored_at", { ascending: false }).limit(500),
      ]);

      const supById = new Map((suppliers || []).map((s: any) => [s.id, s]));
      const supByEmail = new Map((suppliers || []).map((s: any) => [String(s.email || "").toLowerCase(), s]));
      const scoreById = new Map<string, any>();
      for (const r of latestScores || []) if (!scoreById.has(r.supplier_id)) scoreById.set(r.supplier_id, r);

      // Index invoices by PO id to compute invoiced/paid coverage per PO
      const invByPo = new Map<string, any[]>();
      for (const inv of allInvoicesForPos || []) {
        if (!inv.po_id) continue;
        if (!invByPo.has(inv.po_id)) invByPo.set(inv.po_id, []);
        invByPo.get(inv.po_id)!.push(inv);
      }
      const poCoverage = (poId: string, poAmount: number) => {
        const invs = invByPo.get(poId) || [];
        const invoicedAmt = invs.reduce((s, i) => s + Number(i.amount || 0), 0);
        const paidAmt = invs.filter((i) => String(i.status) === "paid").reduce((s, i) => s + Number(i.amount || 0), 0);
        const tol = Math.max(1, Number(poAmount || 0) * 0.01);
        return {
          hasAnyInvoice: invs.length > 0,
          fullyInvoiced: invoicedAmt + tol >= Number(poAmount || 0) && Number(poAmount || 0) > 0,
          fullyPaid: paidAmt + tol >= Number(poAmount || 0) && Number(poAmount || 0) > 0,
        };
      };

      // Build candidate triggers per supplier
      type Trigger = { type: string; detail: string; priority: "high" | "medium" | "low" };
      const triggersBySupplier = new Map<string, Trigger[]>();
      const push = (sid: string, t: Trigger) => {
        if (!triggersBySupplier.has(sid)) triggersBySupplier.set(sid, []);
        triggersBySupplier.get(sid)!.push(t);
      };

      // Pending invoices awaiting verification (skip paid; status filter already excludes paid)
      for (const inv of pendingInvoices || []) {
        if (String(inv.status) === "paid") continue;
        push(inv.supplier_id, { type: "pending_invoice", detail: `Invoice ${inv.invoice_number} (₹${inv.amount}) submitted on ${inv.date} is still pending verification/approval`, priority: "low" });
      }
      // PO-driven triggers
      for (const po of openPos || []) {
        const cov = poCoverage(po.id, Number(po.amount || 0));
        // Exclude fully paid POs entirely
        if (cov.fullyPaid) continue;

        // Pending invoice submission: any open PO where supplier has not submitted an invoice yet
        if (!cov.hasAnyInvoice) {
          push(po.supplier_id, {
            type: "pending_invoice_submission",
            detail: `PO ${po.po_number} (₹${po.amount}) has no invoice submitted yet — please raise the invoice`,
            priority: "medium",
          });
        }

        // Delayed delivery: only if expected_delivery passed AND not fully invoiced
        if (po.expected_delivery && String(po.expected_delivery) < today && !cov.fullyInvoiced) {
          push(po.supplier_id, {
            type: "delayed_delivery",
            detail: `PO ${po.po_number} delivery was expected on ${po.expected_delivery} and is now delayed${cov.hasAnyInvoice ? " (partially invoiced)" : ""}`,
            priority: "high",
          });
        }
      }
      // Low scores
      for (const [sid, score] of scoreById.entries()) {
        if (score.score < 60) {
          push(sid, { type: "low_score", detail: `Performance score ${score.score} (${score.grade}). Weaknesses: ${(score.weaknesses || []).join("; ")}`, priority: "medium" });
        }
      }
      // RFQ pending quote reminders intentionally excluded from supplier nudges.

      // Stale registrations as their own nudges
      const regNudges = (pendingRegs || []).map((r: any) => ({
        supplier_id: r.id,
        supplier_name: r.company || r.email,
        supplier_email: r.email,
        priority: "medium" as const,
        triggers: [{ type: "stale_registration", detail: `Registration submitted on ${String(r.created_at).slice(0, 10)} still pending review` }],
      }));

      const candidates = [...triggersBySupplier.entries()].map(([sid, triggers]) => {
        const s = supById.get(sid) as any;
        const top = triggers.find((t) => t.priority === "high") || triggers.find((t) => t.priority === "medium") || triggers[0];
        return {
          supplier_id: sid,
          supplier_name: s?.company || s?.name || "Supplier",
          supplier_email: s?.email,
          priority: top.priority,
          triggers,
        };
      }).filter((c) => c.supplier_email);

      const allCandidates = [...candidates, ...regNudges].slice(0, 40);

      if (allCandidates.length === 0) {
        return new Response(JSON.stringify({ data: { nudges: [] } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ask AI to draft personalised nudge messages
      const { text } = await generateText({
        model,
        system: "You draft short, friendly but firm reminder messages for B2B suppliers in India. For each supplier, write ONE concise email (subject + 3-5 sentence body) addressing the most important trigger. DO NOT mention overdue payments, money owed to the supplier, or payment delays — focus only on the triggers provided (pending invoices awaiting verification, delayed deliveries, low performance scores, pending RFQ quotes, stale registrations). Tone: professional, courteous, specific (cite invoice/PO/RFQ numbers and dates). Sign-off: 'Emboss Marketing Procurement Team'. Return ONLY a JSON array, one item per supplier in the same order: [{\"supplier_id\":\"...\",\"subject\":\"...\",\"body\":\"...\",\"channel\":\"email\",\"call_to_action\":\"...\"}]. No markdown.",
        prompt: `Generate nudge messages for these ${allCandidates.length} suppliers:\n${JSON.stringify(allCandidates, null, 2)}`,
      });

      let drafts: any[] = [];
      try {
        drafts = extractJSON(text) as any[];
        if (!Array.isArray(drafts)) drafts = [];
      } catch {
        drafts = [];
      }
      const draftById = new Map(drafts.map((d: any) => [d.supplier_id, d]));

      const nudges = allCandidates.map((c) => {
        const d = draftById.get(c.supplier_id) || {};
        return {
          ...c,
          subject: d.subject || `Action needed on your account`,
          body: d.body || c.triggers.map((t: any) => t.detail).join("\n"),
          channel: d.channel || "email",
          call_to_action: d.call_to_action || "Please log in to the supplier portal to take action.",
        };
      });

      return new Response(JSON.stringify({ data: { nudges } }), {
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
