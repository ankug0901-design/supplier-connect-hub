import { generateObject } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const InvoiceSchema = z.object({
  invoice_number: z.string().nullish(),
  invoice_date: z.string().nullish(),
  po_number: z.string().nullish(),
  supplier_name: z.string().nullish(),
  gst_number: z.string().nullish(),
  subtotal: z.number().nullish(),
  tax_amount: z.number().nullish(),
  total_amount: z.number().nullish(),
  currency: z.string().nullish(),
  line_items: z
    .array(
      z.object({
        item_name: z.string().nullish(),
        quantity: z.number().nullish(),
        rate: z.number().nullish(),
        amount: z.number().nullish(),
      }),
    )
    .nullish()
    .default([]),
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
