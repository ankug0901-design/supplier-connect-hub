import { generateText } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IssueSchema = z.object({
  severity: z.enum(["info", "warning", "blocker"]),
  field: z.string(),
  message: z.string(),
});

const ResultSchema = z.object({
  issues: z.array(IssueSchema),
  summary: z.string(),
});

function extractJSON(raw: string): unknown {
  let s = raw.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/```\s*$/im, "").trim();
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i === -1 || j <= i) throw new Error("No JSON found");
    s = s.slice(i, j + 1);
  }
  return JSON.parse(s);
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

    const body = await req.json();
    const { po, invoice } = body as {
      po: {
        po_number?: string;
        amount?: number;
        date?: string;
        expected_delivery?: string;
        items: Array<{
          item_name: string;
          po_quantity: number;
          invoiced_quantity?: number;
          rate: number;
        }>;
      };
      invoice: {
        invoice_number: string;
        invoice_date: string;
        amount: number;
        items: Array<{ item_name: string; quantity: number; rate: number; actual_delivery_date?: string }>;
      };
    };

    // Deterministic checks
    const issues: Array<z.infer<typeof IssueSchema>> = [];
    const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const poItemMap = new Map(po.items.map((i) => [norm(i.item_name), i]));

    // Invoice amount vs computed
    const computedTotal = invoice.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0);
    if (Math.abs(computedTotal - Number(invoice.amount || 0)) > Math.max(1, computedTotal * 0.02)) {
      issues.push({
        severity: "warning",
        field: "amount",
        message: `Invoice amount ₹${Number(invoice.amount).toFixed(2)} differs from line-item total ₹${computedTotal.toFixed(2)}.`,
      });
    }

    // PO total exceeded
    const poRemainingValue = po.items.reduce(
      (s, i) => s + Math.max((i.po_quantity || 0) - (i.invoiced_quantity || 0), 0) * (i.rate || 0),
      0,
    );
    if (po.amount && computedTotal > Number(po.amount) * 1.02) {
      issues.push({
        severity: "blocker",
        field: "amount",
        message: `Invoice value ₹${computedTotal.toFixed(2)} exceeds PO value ₹${Number(po.amount).toFixed(2)}.`,
      });
    }

    // Per-line checks
    for (const item of invoice.items) {
      const key = norm(item.item_name);
      const poItem = poItemMap.get(key);
      if (!poItem) {
        issues.push({
          severity: "warning",
          field: `item:${item.item_name}`,
          message: `"${item.item_name}" is not on the PO.`,
        });
        continue;
      }
      const remaining = Math.max((poItem.po_quantity || 0) - (poItem.invoiced_quantity || 0), 0);
      if (item.quantity > remaining + 0.001) {
        issues.push({
          severity: "blocker",
          field: `item:${item.item_name}`,
          message: `Quantity ${item.quantity} exceeds remaining ${remaining} for "${item.item_name}".`,
        });
      }
      if (poItem.rate && Math.abs(item.rate - poItem.rate) / poItem.rate > 0.01) {
        const diff = item.rate - poItem.rate;
        issues.push({
          severity: "warning",
          field: `item:${item.item_name}`,
          message: `Rate ₹${item.rate.toFixed(2)} differs from PO rate ₹${poItem.rate.toFixed(2)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}).`,
        });
      }
      // Delivery variance
      if (item.actual_delivery_date && po.expected_delivery) {
        const days = Math.round(
          (new Date(item.actual_delivery_date).getTime() - new Date(po.expected_delivery).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (days > 7) {
          issues.push({
            severity: "warning",
            field: `delivery:${item.item_name}`,
            message: `Delivered ${days} days after expected date for "${item.item_name}".`,
          });
        }
      }
    }

    // Invoice date sanity
    if (invoice.invoice_date && po.date && new Date(invoice.invoice_date) < new Date(po.date)) {
      issues.push({
        severity: "blocker",
        field: "invoice_date",
        message: `Invoice date is before the PO date (${po.date}).`,
      });
    }
    const today = new Date();
    if (invoice.invoice_date && new Date(invoice.invoice_date) > today) {
      issues.push({
        severity: "warning",
        field: "invoice_date",
        message: `Invoice date is in the future.`,
      });
    }

    // Ask AI for a short, friendly summary + any additional subtle issues
    const gateway = createLovableAiGatewayProvider(Deno.env.get("LOVABLE_API_KEY")!);
    const model = gateway("google/gemini-2.5-flash");

    let aiIssues: Array<z.infer<typeof IssueSchema>> = [];
    let summary = issues.length === 0 ? "No discrepancies found. Invoice is ready to submit." : "Some discrepancies need your attention before submission.";

    try {
      const { text } = await generateText({
        model,
        system:
          "You are an invoice review assistant for a B2B procurement portal in India. Given a PO and a draft invoice along with deterministic issues already detected, look for ANY additional subtle problems (HSN gaps, suspicious rounding, vague descriptions, missing GST in amount when expected, etc.). Be concise. Return only JSON: {\"issues\":[{\"severity\":\"info|warning|blocker\",\"field\":\"...\",\"message\":\"...\"}],\"summary\":\"one-line plain English summary for the supplier\"}. Do NOT repeat the already-detected issues.",
        prompt: `PO:\n${JSON.stringify(po, null, 2)}\n\nDraft invoice:\n${JSON.stringify(invoice, null, 2)}\n\nAlready detected issues:\n${JSON.stringify(issues, null, 2)}`,
      });
      const parsed = ResultSchema.partial().parse(extractJSON(text));
      if (parsed.issues) aiIssues = parsed.issues;
      if (parsed.summary) summary = parsed.summary;
    } catch (err) {
      console.warn("AI enrichment failed", err);
    }

    const allIssues = [...issues, ...aiIssues];
    const hasBlocking = allIssues.some((i) => i.severity === "blocker");

    return new Response(
      JSON.stringify({ data: { issues: allIssues, summary, has_blocking: hasBlocking } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("invoice-discrepancy-check error", e);
    const msg = String((e as any)?.message || e);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
