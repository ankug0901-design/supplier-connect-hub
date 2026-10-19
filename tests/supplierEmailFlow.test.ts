import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { paymentIsMade, supplierPaymentEmailKey, shouldNotifyPoRelease, poReleaseEmailKey, DELIVERY_CONFIRMATION_CC } from '../supabase/functions/_shared/supplier-email-policy';

const transpile = (code: string) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(rows: Record<string, any[]>) {
  return { from(table: string) {
    let action = 'select'; let values: any; let single = false;
    const filters: ((row: any) => boolean)[] = [];
    const q: any = {
      select() { return q; }, eq(k: string, v: any) { filters.push(r => r[k] === v); return q; },
      is(k: string, v: any) { filters.push(r => (r[k] ?? null) === v); return q; },
      in(k: string, v: any[]) { filters.push(r => v.includes(r[k])); return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      update(v: any) { values = v; action = 'update'; return q; },
      then(resolve: any) { const found = (rows[table] || []).filter(r => filters.every(f => f(r))); if (action === 'update') found.forEach(r => Object.assign(r, values)); return Promise.resolve({ data: single ? found[0] : found, error: null }).then(resolve); },
    }; return q;
  } };
}
const paymentSource = readFileSync(new URL('../supabase/functions/supplier-payment-notification/index.ts', import.meta.url), 'utf8');
const paymentBlock = paymentSource.slice(paymentSource.indexOf('export async function notifySupplierPayment'), paymentSource.indexOf('\nDeno.serve')).replace('export async', 'async');
const paymentRun = new Function('paymentIsMade', 'supplierPaymentEmailKey', 'recordEmailSendOutcome', `${transpile(paymentBlock)};return notifySupplierPayment;`)(paymentIsMade, supplierPaymentEmailKey, async () => {});

test('a completed payment sends to its supplier once and later sync skips it', async () => {
  const client = fixture({ payments: [{ id: 'pay-1', invoice_id: 'inv-1', status: 'completed', amount: 1000, transaction_id: 'txn-1' }], invoices: [{ id: 'inv-1', supplier_id: 'sup-1', invoice_number: 'INV-1' }], suppliers: [{ id: 'sup-1', email: 'supplier@example.test' }] });
  const calls: any[] = [];
  const send = async (...args: any[]) => { calls.push(args); return { sent: true }; };
  await paymentRun(client, 'pay-1', send); await paymentRun(client, 'pay-1', send);
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toBe('supplier@example.test');
  expect(calls[0][2].idempotencyKey).toBe('supplier-payment-sup-1-txn-1');
});
test('a failed payment email remains retryable without changing the payment status', async () => {
  const payments = [{ id: 'pay-1', invoice_id: 'inv-1', status: 'completed', amount: 1000 }];
  const client = fixture({ payments, invoices: [{ id: 'inv-1', supplier_id: 'sup-1' }], suppliers: [{ id: 'sup-1', email: 'supplier@example.test' }] });
  await expect(paymentRun(client, 'pay-1', async () => { throw new Error('unavailable'); })).rejects.toThrow('unavailable');
  expect(payments[0].status).toBe('completed'); expect((payments[0] as any).supplier_notified_at).toBeUndefined();
});

test('release notice includes Cc, then skips the same PO on the next invocation', async () => {
  const source = readFileSync(new URL('../supabase/functions/po-delivery-reminder/index.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('  const admin = createClient'), source.lastIndexOf('\n});'));
  const run = new Function('createClient', 'shouldNotifyPoRelease', 'poReleaseEmailKey', 'DELIVERY_CONFIRMATION_CC', 'sendTemplateEmail', 'retryRateLimitedEmail', 'recordEmailSendOutcome', 'SITE_URL', 'req', 'SUPABASE_URL', 'SERVICE_KEY', 'z', 'corsHeaders', `return (async()=>{${transpile(block)}})();`);
  const client = fixture({ purchase_orders: [{ id: 'po-1', status: 'open', supplier_id: 'sup-1', po_number: 'PO-1' }], po_items: [{ id: 'item-1', po_id: 'po-1', item_name: 'Packaging', quantity: 20 }], suppliers: [{ id: 'sup-1', email: 'supplier@example.test' }] });
  const calls: any[] = [];
  const args = [() => client, shouldNotifyPoRelease, poReleaseEmailKey, DELIVERY_CONFIRMATION_CC, async (...v: any[]) => { calls.push(v); return { sent: true }; }, async (fn: any) => fn(), async () => {}, 'https://supplierconnect.embossmarketing.in', { method: 'GET' }, '', '', { object: () => ({ safeParse: () => ({ success: true, data: {} }) }), string: () => ({ uuid: () => ({ optional: () => ({}) }) }) }, {}];
  await run(...args); await run(...args);
  expect(calls).toHaveLength(1);
  expect(calls[0][2].cc).toContain('hkumar@embossmarketing.in');
  expect(calls[0][2].idempotencyKey).toBe('po-release-po-1');
});
