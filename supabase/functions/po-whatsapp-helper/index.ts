import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-n8n-key',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const n8nKey = req.headers.get('x-n8n-key')
  if (n8nKey !== Deno.env.get('N8N_ACCESS_CODE')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.json()
  const { action } = body

  try {
    if (action === 'get_supplier_by_phone') {
      const { phone } = body
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, email, phone, whatsapp_number')
        .or(`phone.eq.${phone},whatsapp_number.eq.${phone}`)
        .limit(1)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, rows: data }), { headers: corsHeaders })
    }

    if (action === 'get_supplier_by_name') {
      const { name } = body
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, email, phone, whatsapp_number')
        .eq('name', name)
        .limit(1)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, rows: data }), { headers: corsHeaders })
    }

    if (action === 'get_open_po_by_supplier') {
      const { supplier_id } = body
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, supplier_id, amount, date, expected_delivery, client_order_id, whatsapp_sent_at')
        .eq('supplier_id', supplier_id)
        .eq('status', 'open')
        .not('whatsapp_sent_at', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, rows: data }), { headers: corsHeaders })
    }

    if (action === 'mark_whatsapp_sent') {
      const { po_id } = body
      const { error } = await supabase
        .from('purchase_orders')
        .update({ whatsapp_sent_at: new Date().toISOString() })
        .eq('id', po_id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    if (action === 'update_delivery_date') {
      const { po_id, delivery_date } = body
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          expected_delivery: delivery_date,
          delivery_confirmed_via_wa: true,
          delivery_confirmed_at: new Date().toISOString()
        })
        .eq('id', po_id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
