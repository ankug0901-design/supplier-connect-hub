import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/TrackOrder.tsx', import.meta.url), 'utf8');
const callback = source.slice(source.indexOf('  const load = useCallback('), source.indexOf('  useEffect(() => {', source.indexOf('  const load = useCallback(')));
const output = ts.transpileModule(callback, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function lookup(token: string, raw: unknown, rpcError: unknown = null, proofResult: unknown = { ok: true, proofs: [] }, proofError = false) {
  const calls: unknown[] = [];
  const state = { data: null as unknown, error: false, loading: true };
  const load = new Function('useCallback', 'supabase', 'token', 'setData', 'setError', 'setLoading', 'proofRpc', `${output}; return load;`)(
    (fn: unknown) => fn,
    { rpc: async (...args: unknown[]) => { calls.push(args); return { data: raw, error: rpcError }; } },
    token,
    (value: unknown) => { state.data = value; },
    (value: boolean) => { state.error = value; },
    (value: boolean) => { state.loading = value; },
    async (payload: unknown) => { calls.push(['proof_manage', { payload }]); if (proofError) throw new Error('Unavailable'); return proofResult; },
  );
  await load(true);
  return { calls, state };
}

test('public tracking calls the token-scoped RPC and accepts object or array responses', async () => {
  const order = { ok: true, order: { order_number: 'EM/SO/26-27/188' } };
  for (const raw of [order, [order]]) {
    const result = await lookup('tracking-token-188', raw);
    expect(result.calls).toEqual([['po_tracker_manage', { payload: { action: 'track_by_token', tracking_token: 'tracking-token-188' } }]]);
    expect(result.state).toEqual({ data: { ...order, digital_proofs: [] }, error: false, loading: false });
  }
});

test('failed or missing orders remain in the error state and stop loading', async () => {
  for (const [raw, error] of [[null, { message: 'Unavailable' }], [{ ok: false }, null], [{ ok: true }, null]]) {
    const result = await lookup('invalid-token', raw, error);
    expect(result.state).toEqual({ data: null, error: true, loading: false });
  }
});

test('a missing tracking token does not call the RPC', async () => {
  const result = await lookup('', null);
  expect(result.calls).toEqual([]);
  expect(result.state).toEqual({ data: null, error: true, loading: false });
});

test('tracking proofs use the tracking token, not an order ID as authorization', async () => {
  const proofs = [{ id: 'proof-188', status: 'pending' }];
  const result = await lookup('tracking-token-188', { ok: true, order: { id: 'order-188' } }, null, { ok: true, proofs });
  expect(result.calls[1]).toEqual(['proof_manage', { payload: { action: 'list_proofs_by_tracking_token', tracking_token: 'tracking-token-188' } }]);
  expect((result.state.data as any).digital_proofs).toEqual(proofs);
});

test('proof lookup failure preserves successful order tracking', async () => {
  const result = await lookup('tracking-token-188', { ok: true, order: { id: 'order-188' } }, null, null, true);
  expect(result.state).toEqual({ data: { ok: true, order: { id: 'order-188' }, digital_proofs: [] }, error: false, loading: false });
});