import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { rfq_id } = await req.json();
    if (!rfq_id || typeof rfq_id !== 'string') {
      return new Response(JSON.stringify({ error: 'rfq_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Verify caller is admin
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: me } = await supabase.from('suppliers').select('role').eq('user_id', user.id).maybeSingle();
    if (me?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: rows, error } = await supabase
      .from('rfq_portal_requests')
      .select('*')
      .eq('rfq_id', rfq_id);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'RFQ not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Enrich with company names
    const emails = Array.from(new Set(rows.map((r: any) => String(r.supplier_email || '').toLowerCase()).filter(Boolean)));
    const { data: sups } = await supabase.from('suppliers').select('email,company').in('email', emails);
    const companyByEmail: Record<string, string> = {};
    (sups || []).forEach((s: any) => {
      const k = String(s.email || '').toLowerCase();
      if (k && s.company) companyByEmail[k] = s.company;
    });

    const first = rows[0];
    const submitted = rows
      .filter((r: any) => ['quote_submitted', 'accepted', 'rejected'].includes(r.status))
      .map((r: any) => {
        const up = Number(r.quoted_unit_price) || 0;
        const gst = Number(r.quoted_gst_percent) || 0;
        const perUnit = Number(r.total_price) || (up + (up * gst / 100));
        const qty = Number(String(r.quantity || '').replace(/[^\d.]/g, '')) || null;
        return {
          supplier: companyByEmail[String(r.supplier_email || '').toLowerCase()] || r.supplier_email,
          unit_price: up,
          gst_percent: gst,
          per_unit_incl_gst: perUnit,
          setup_charges: Number(r.setup_charges) || 0,
          lead_time_days: Number(r.lead_time_days) || null,
          payment_terms: r.payment_terms || null,
          validity_days: Number(r.validity_days) || null,
          quantity: qty,
          estimated_total: qty ? (perUnit * qty + (Number(r.setup_charges) || 0)) : null,
          notes: r.supplier_notes || null,
          status: r.status,
          rank: r.price_rank || null,
        };
      })
      .sort((a: any, b: any) => (a.rank ?? 999) - (b.rank ?? 999) || a.per_unit_incl_gst - b.per_unit_incl_gst);

    const context = {
      rfq_id,
      product_name: first.product_name,
      product_category: first.product_category,
      client_name: first.client_name,
      quantity: first.quantity,
      material: first.material,
      dimensions: first.dimensions,
      print_process: first.print_process,
      finish: first.finish,
      colours: first.colours,
      required_by_date: first.required_by_date,
      special_instructions: first.special_instructions,
      quotes: submitted,
    };

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

    const systemPrompt = `You are a senior procurement analyst at Emboss Marketing preparing a polished, client-ready quote comparison summary.
Produce a professional Markdown document the client can read directly. Use this exact structure:

# Quote Comparison Summary — <Product Name>
**Client:** <client>  |  **RFQ:** <rfq_id>  |  **Required by:** <date>  |  **Quantity:** <qty>

## Brief Recap
2-3 lines summarising the product spec (material, dimensions, finish, print process, colours) in plain business English.

## Quotes Received
A Markdown table with columns: Rank | Supplier | Unit Price (incl. GST) | Setup | Lead Time | Payment Terms | Validity | Est. Total
Format INR amounts with ₹ and thousands separators (e.g., ₹1,23,450). Use "—" where data missing.

## Recommendation
1 paragraph naming the recommended supplier and WHY (price, lead time, terms balance). Be honest if a non-L1 has better value.

## Key Observations
- 3-5 crisp bullets: price spread, lead-time gaps, payment-term variations, outliers, risks worth flagging.

## Next Steps
- 2-3 bullet actions for the client.

Tone: professional, neutral, no hype. Never invent data. If no quotes were submitted, say so clearly.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate the client summary from this RFQ data:\n\n${JSON.stringify(context, null, 2)}` },
        ],
      }),
    });

    if (aiRes.status === 429) return new Response(JSON.stringify({ error: 'Rate limit hit, please retry shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (aiRes.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted. Please top up in workspace settings.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error('AI error', aiRes.status, t);
      return new Response(JSON.stringify({ error: 'AI generation failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const ai = await aiRes.json();
    const markdown = ai.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ markdown, quotes_count: submitted.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
