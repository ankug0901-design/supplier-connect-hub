import { generateObject } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NOTE: OpenAI strict structured-output mode requires every property to appear
// in the schema's `required` array (nullable is fine, missing is not). We use
// `.nullable()` throughout so keys stay required but the model can emit null.
const InvoiceSchema = z.object({
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  po_number: z.string().nullable(),
  supplier_name: z.string().nullable(),
  gst_number: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax_amount: z.number().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  line_items: z
    .array(
      z.object({
        item_name: z.string().nullable(),
        quantity: z.number().nullable(),
        rate: z.number().nullable(),
        amount: z.number().nullable(),
      }),
    )
    .nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaType = file.type || "application/octet-stream";
    const bytes = new Uint8Array(await file.arrayBuffer());

    const gateway = createLovableAiGatewayProvider(Deno.env.get("LOVABLE_API_KEY")!);
    const model = gateway("google/gemini-2.5-flash");

    const { object } = await generateObject({
      model,
      schema: InvoiceSchema,
      system:
        "You extract structured invoice data from supplier invoices for an Indian B2B portal. Return null for fields that are not present. Normalize dates to YYYY-MM-DD. Amounts must be numbers without currency symbols or commas.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the invoice header fields and line items from this document." },
            mediaType.startsWith("image/")
              ? { type: "image", image: bytes, mediaType }
              : { type: "file", data: bytes, mediaType },
          ],
        },
      ],
    });

    return new Response(JSON.stringify({ data: object }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invoice-ocr error", e);
    const msg = String((e as any)?.message || e);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
