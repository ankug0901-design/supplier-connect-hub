import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts';
import { recordEmailSendOutcome } from '../_shared/email-send-outcome.ts';
import { paymentIsMade, supplierPaymentEmailKey } from '../_shared/supplier-email-policy.ts';

export async function notifySupplierPayment(admin: any, paymentId: string, send = sendTemplateEmail) {
  const { data: payment, error } = await admin.from('payments')
    .select('id, invoice_id, amount, date, status, transaction_id, payment_number, payment_mode, supplier_notified_at')
    .eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!payment) return { sent: false, reason: 'payment_not_found' };
  if (payment.supplier_notified_at || !paymentIsMade(payment)) return { sent: false, reason: 'not_eligible' };
  const { data: invoice, error: invoiceError } = await admin.from('invoices')
    .select('invoice_number, supplier_id').eq('id', payment.invoice_id).single();
  if (invoiceError) throw invoiceError;
  const { data: supplier, error: supplierError } = await admin.from('suppliers')
    .select('name, company, email').eq('id', invoice.supplier_id).single();
  if (supplierError) throw supplierError;
  if (!supplier.email) return { sent: false, reason: 'supplier_email_missing' };
  const messageId = supplierPaymentEmailKey(invoice.supplier_id, payment.transaction_id || payment.id);
  try {
    const outcome = await send('supplier-payment', supplier.email, {
      idempotencyKey: messageId,
      templateData: {
        supplierName: supplier.name || supplier.company || 'Supplier',
        paymentNumber: payment.payment_number || payment.transaction_id || payment.id,
        invoiceNumber: invoice.invoice_number,
        amount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(payment.amount)),
        paymentDate: payment.date, paymentMode: payment.payment_mode || '', reference: payment.transaction_id || '',
      },
    });
    await recordEmailSendOutcome(admin, { message_id: messageId, template_name: 'supplier-payment', recipient_email: supplier.email, status: outcome.sent ? 'sent' : 'suppressed' });
    const { error: markerError } = await admin.from('payments')
      .update({ supplier_notified_at: new Date().toISOString() }).eq('id', payment.id);
    if (markerError) throw markerError;
    return outcome;
  } catch (error) {
    await recordEmailSendOutcome(admin, { message_id: messageId, template_name: 'supplier-payment', recipient_email: supplier.email, status: 'failed', error_message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return respond({ error: 'Server configuration missing' }, 500);
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return respond({ error: 'Unauthorized' }, 401);
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const parsed = z.object({ payment_id: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return respond({ error: 'A valid payment ID is required' }, 400);
  try {
    return respond(await notifySupplierPayment(createClient(url, serviceKey), parsed.data.payment_id));
  } catch (error) {
    console.error('Supplier payment notification failed', error instanceof Error ? error.message : String(error));
    return respond({ error: 'Payment notification could not be sent' }, 500);
  }
});
