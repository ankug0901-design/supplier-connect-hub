import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/ProofApproval.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const submit ='), source.indexOf('  const proof = data?.proof;'));
const escape = source.slice(source.indexOf('const escapeNotificationHtml ='), source.indexOf('export default function'));
const output = ts.transpileModule(`${escape}\n${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function submit(mode: string, notify = true, orderNumber: string | undefined = 'ORDER-1', failure = false, rpcFailure = false) {
  const calls: any[] = [];
  const state: any = { proof: { status: 'pending' }, order: { client_name: 'Client' } };
  const result = { ok: true, proof: { status: mode === 'approve_proof' ? 'approved' : 'revision_requested', client_name: 'Reviewer' }, notify_admin: notify, order_number: orderNumber };
  const run = new Function('mode', 'saving', 'data', 'epoch', 'token', 'comment', 'name', 'annotations', 'proofResponsePayload', 'proofRpc', 'fetch', 'setSaving', 'setSubmitError', 'setData', 'setMode', 'setSubmitted', 'console', `${output}; return submit;`)(
    mode, false, state, { current: 1 }, 'token', '<script>change</script>', 'Reviewer', [{ number: 1 }],
    (...args: any[]) => args,
    async () => { calls.push(['rpc']); if (rpcFailure) throw new Error('Failed'); return result; },
    async (url: string, options: any) => { calls.push(['notify', url, JSON.parse(options.body)]); if (failure) throw new Error('Offline'); return { ok: true }; },
    (value: boolean) => calls.push(['saving', value]),
    (value: string) => calls.push(['error', value]),
    (update: any) => calls.push(['saved', update(state).proof.status]),
    () => {}, (value: boolean) => calls.push(['submitted', value]), { error: () => calls.push(['notification-failed']) },
  );
  await run({ preventDefault() {} });
  return calls;
}

test('approval notifies the requested admin after the response has been saved', async () => {
  const calls = await submit('approve_proof');
  const notice = calls.find(call => call[0] === 'notify');
  expect(notice[1]).toBe('https://n8n.srv1141999.hstgr.cloud/webhook/send-email');
  expect(notice[2].to).toBe('embossmarketing@gmail.com');
  expect(notice[2].subject).toBe('Proof Approved — ORDER-1');
  expect(calls.findIndex(call => call[0] === 'saved')).toBeLessThan(calls.indexOf(notice));
});
test('revision notifications escape comments and include the annotation count', async () => {
  const calls = await submit('request_revision');
  const notice = calls.find(call => call[0] === 'notify');
  expect(notice[2].subject).toBe('Proof Revision Requested — ORDER-1');
  expect(notice[2].html).toContain('&lt;script&gt;change&lt;/script&gt;');
  expect(notice[2].html).not.toContain('<script>');
  expect(notice[2].html).toContain('1 markup(s)');
});
test('notifications require permission, order number, and a successful RPC', async () => {
  for (const calls of [await submit('approve_proof', false), await submit('approve_proof', true, ''), await submit('approve_proof', true, 'ORDER-1', false, true)]) {
    expect(calls.filter(call => call[0] === 'notify')).toEqual([]);
  }
});
test('notification failure does not undo the successful response or show a submission error', async () => {
  const calls = await submit('approve_proof', true, 'ORDER-1', true);
  expect(calls).toContainEqual(['submitted', true]);
  expect(calls).toContainEqual(['notification-failed']);
  expect(calls.filter(call => call[0] === 'error' && call[1])).toEqual([]);
  expect(calls.at(-1)).toEqual(['saving', false]);
});