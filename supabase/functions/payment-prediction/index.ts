import { generateText } from "npm:ai";
import { createClient } from "npm:@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function daysBetween(a: string | Date, b: string | Date) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: string | Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x.toISOString().slice(0, 10);
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((s.length - 1) * p));
  return s[i];
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

    // Resolve target supplier (self by default; admin can pass supplier_id)
    const { data: me } = await admin
      .from("suppliers")
      .select("id, role, company")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!me) {
      return new Response(JSON.stringify({ error: "Supplier profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    let supplierId: string = me.id;
    if (body?.supplier_id && (me.role === "admin" || me.role === "super_user")) {
      supplierId = body.supplier_id;
    }

    const { data: invoices } = await admin
      .from("invoices")
      .select("id, invoice_number, date, due_date, payment_date, amount, status, balance")
      .eq("supplier_id", supplierId)
      .order("date", { ascending: false })
      .limit(300);

    const all = invoices || [];
    const paid = all.filter((i) => i.payment_date && i.date);
    const daysToPay = paid.map((i) => daysBetween(i.date as string, i.payment_date as string)).filter((d) => d >= 0 && d < 365);

    const avgDays = daysToPay.length ? Math.round(daysToPay.reduce((s, v) => s + v, 0) / daysToPay.length) : 30;
    const p50 = Math.round(percentile(daysToPay, 0.5));
    const p90 = Math.round(percentile(daysToPay, 0.9));

    const today = new Date().toISOString().slice(0, 10);
    const pending = all.filter((i) => i.status !== "paid" && (Number(i.balance ?? i.amount) > 0));

    const predictions = pending.map((inv) => {
      const base = (inv.due_date as string) || (inv.date as string);
      const expected = (inv.due_date as string) ? addDays(base, Math.max(0, avgDays - 30)) : addDays(base, avgDays);
      const earliest = (inv.due_date as string) ? base : addDays(inv.date as string, Math.max(0, p50));
      const latest = addDays(inv.date as string, Math.max(avgDays, p90 || avgDays));
      const overdue = (inv.due_date as string) && (inv.due_date as string) < today;
      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        amount: Number(inv.amount),
        balance: Number(inv.balance ?? inv.amount),
        invoice_date: inv.date,
        due_date: inv.due_date,
        predicted_payment_date: expected,
        earliest_date: earliest,
        latest_date: latest,
        days_until_predicted: daysBetween(today, expected),
        overdue: !!overdue,
      };
    }).sort((a, b) => (a.predicted_payment_date || "").localeCompare(b.predicted_payment_date || ""));

    const totalPending = pending.reduce((s, i) => s + Number(i.balance ?? i.amount ?? 0), 0);

    const stats = {
      historical_invoices_analyzed: paid.length,
      avg_days_to_pay: avgDays,
      median_days_to_pay: p50,
      p90_days_to_pay: p90,
      pending_invoice_count: pending.length,
      total_pending_amount_inr: Math.round(totalPending),
    };


    // AI narrative (short)
    let narrative = "";
    if (pending.length > 0) {
      try {
        const gateway = createLovableAiGatewayProvider(Deno.env.get("LOVABLE_API_KEY")!);
        const model = gateway("google/gemini-2.5-flash-lite");
        const { text } = await generateText({
          model,
          system: "You are a friendly cash-flow advisor for a B2B supplier. Write a SHORT (2-3 sentences) plain-English summary of when this supplier can expect payments, based on their historical payment patterns. Be specific with numbers. No markdown.",
          prompt: `Stats: ${JSON.stringify(stats)}. Next upcoming predicted payments:\n${JSON.stringify(predictions.slice(0, 5), null, 2)}`,
        });
        narrative = text.trim();
      } catch (err) {
        console.warn("AI narrative failed", err);
        narrative = `Based on ${paid.length} paid invoices, payments typically arrive in ~${avgDays} days.`;
      }
    } else {
      narrative = "No pending invoices — nothing to predict right now.";
    }

    return new Response(
      JSON.stringify({ data: { stats, predictions, narrative } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("payment-prediction error", e);
    const msg = String((e as any)?.message || e);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
