/// <reference path="../env.d.ts" />
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_payments",
  title: "List payments",
  description:
    "List payments the signed-in supplier has received against their invoices, with amount, mode, date, and reference.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("payments")
      .select("payment_number, date, amount, status, payment_mode, transaction_id, invoice_id")
      .order("date", { ascending: false })
      .limit(limit ?? 50);
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { count: data?.length ?? 0, payments: data ?? [] },
    };
  },
});
