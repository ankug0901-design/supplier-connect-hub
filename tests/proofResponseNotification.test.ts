import { expect, test } from 'bun:test';
import { handleProofResponse } from '../supabase/functions/n8n-proxy/proof-response';

const mark = { number: 1, x_percent: 25, y_percent: 75, media_index: 0, comment: '<script>Area</script>' };
const payload = { action: 'request_revision', approval_token: 'token', comment: 'Fix <color>', client_name: 'Reviewer', annotations: [mark] };
function setup({ notify = true, failedSend = false, rpcFailure = false, video = false } = {}) {
  const calls: any[] = [];
  let responded = false;
  const rpc = async (input: Record<string, unknown>) => {
    calls.push(['rpc', input]);
    if (input.action === 'get_proof_by_token') return { data: { ok: true, proof: { title: 'Artwork <Title>', status: 'pending', media_urls: [{ url: 'https://example.test/proof.png', type: video ? 'video' : 'image' }] }, order: { order_number: 'SO-123', client_name: 'Client' } }, error: null };
    if (rpcFailure || responded) return { data: { ok: false, error: 'Already responded' }, error: null };
    responded = true;
    return { data: { ok: true, proof: { title: 'Artwork <Title>', status: input.action === 'approve_proof' ? 'approved' : 'revision_requested', client_comment: String(input.comment), client_name: String(input.client_name), client_annotations: input.annotations as any }, order_number: 'SO-123', notify_admin: notify }, error: null };
  };
  const send = async (email: any) => { calls.push(['email', email]); if (failedSend) throw new Error('Unavailable'); };
  return { calls, run: (input = payload as Record<string, unknown>) => handleProofResponse(input, rpc, send) };
}
test('response notifications use fixed operations recipient and authoritative proof and order details', async () => {
  const api = setup();
  expect((await api.run({ ...payload, to: 'attacker@example.test', notify_admin: false })).ok).toBe(true);
  const email = api.calls.find(call => call[0] === 'email')[1];
  expect(email.to).toBe('operations@embossmarketing.in');
  expect(email.subject).toBe('Proof Changes Requested — Artwork <Title> (SO-123)');
  expect(email.html).toContain('Client / Reviewer');
  expect(email.html).toContain('Fix &lt;color&gt;');
  expect(email.html).toContain('&lt;script&gt;Area&lt;/script&gt;');
  expect(email.html).not.toContain('<script>');
});
test('approvals with optional empty comment and name also notify operations', async () => {
  const api = setup();
  await api.run({ action: 'approve_proof', approval_token: 'token', comment: '', client_name: '' });
  expect(api.calls.find(call => call[0] === 'email')[1].subject).toBe('Proof Approved — Artwork <Title> (SO-123)');
});
test('only an authoritative notify_admin true response sends email', async () => {
  const api = setup({ notify: false });
  await api.run({ ...payload, notify_admin: true });
  expect(api.calls.filter(call => call[0] === 'email')).toHaveLength(0);
});
test('notification failure does not fail a saved response', async () => {
  expect((await setup({ failedSend: true }).run()).ok).toBe(true);
});
test('failed or replayed responses never trigger another email', async () => {
  const api = setup();
  await api.run();
  expect((await api.run()).ok).toBe(false);
  expect(api.calls.filter(call => call[0] === 'email')).toHaveLength(1);
  const failed = setup({ rpcFailure: true });
  expect((await failed.run()).ok).toBe(false);
  expect(failed.calls.filter(call => call[0] === 'email')).toHaveLength(0);
});
test('invalid tokens, actions, revision comments and more than ten markers are rejected before RPC', async () => {
  const api = setup();
  for (const input of [{ ...payload, approval_token: '' }, { ...payload, action: 'delete_proof' }, { ...payload, comment: ' ' }, { ...payload, annotations: Array(11).fill(mark) }]) expect((await api.run(input)).ok).toBe(false);
  expect(api.calls).toHaveLength(0);
});
test('out of range, duplicate, and video annotations cannot be persisted through the response path', async () => {
  const api = setup();
  expect((await api.run({ ...payload, annotations: [{ ...mark, x_percent: 101 }] })).ok).toBe(false);
  expect((await api.run({ ...payload, annotations: [mark, mark] })).ok).toBe(false);
  expect((await setup({ video: true }).run()).ok).toBe(false);
  expect(api.calls).toHaveLength(0);
});