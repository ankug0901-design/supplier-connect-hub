import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/proofApproval.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source.replace(/^import .*supabase.*;$/m, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function setup(raw: unknown = { ok: true }, error: unknown = null) {
  const calls: unknown[] = [];
  const exports: Record<string, any> = {};
  new Function('exports', 'supabase', output)(exports, { rpc: async (...args: unknown[]) => { calls.push(args); return { data: raw, error }; } });
  return { ...exports, calls } as any;
}
test('proof lookup uses proof_manage with the supplied token and unwraps array responses', async () => {
  const response = { ok: true, proof: { id: 'proof-1' } };
  for (const raw of [response, [response]]) {
    const api = setup(raw);
    expect(await api.proofRpc({ action: 'get_proof_by_token', approval_token: 'review-token' })).toEqual(response);
    expect(api.calls).toEqual([['proof_manage', { payload: { action: 'get_proof_by_token', approval_token: 'review-token' } }]]);
  }
});
test('approval permits an empty comment and reviewer name', () => {
  expect(setup().proofResponsePayload('approve_proof', 'token', ' ', '')).toEqual({ action: 'approve_proof', approval_token: 'token', comment: '', client_name: '' });
});
test('requesting changes requires a nonblank comment', () => {
  const api = setup();
  expect(() => api.proofResponsePayload('request_revision', 'token', '   ', '')).toThrow('Please describe the changes needed');
  expect(api.proofResponsePayload('request_revision', 'token', ' Change colour ', ' Reviewer ')).toEqual({ action: 'request_revision', approval_token: 'token', comment: 'Change colour', client_name: 'Reviewer' });
});
test('responses without review tokens are rejected', () => {
  expect(() => setup().proofResponsePayload('approve_proof', '', '', '')).toThrow('Review token required');
});
test('RPC transport and unsuccessful proof responses fail instead of displaying success', async () => {
  await expect(setup(null, { message: 'Unavailable' }).proofRpc({ action: 'list_proofs' })).rejects.toThrow('Unavailable');
  await expect(setup({ ok: false, error: 'Already responded' }).proofRpc({ action: 'approve_proof' })).rejects.toThrow('Already responded');
});
test('review links encode tokens and media previews discard unsafe URLs', () => {
  const api = setup();
  expect(api.proofLink('a&b')).toBe('https://supplierconnect.embossmarketing.in/proof?t=a%26b');
  expect(api.proofMedia([{ url: 'javascript:alert(1)' }, { url: 'https://example.test/proof.png' }])).toEqual([{ url: 'https://example.test/proof.png' }]);
  expect(api.isProofVideo({ url: 'https://example.test/proof', type: 'video/mp4' })).toBe(true);
});

const adminSource = readFileSync(new URL('../src/pages/admin/AdminPoTrackerUpdate.tsx', import.meta.url), 'utf8');
const emailSource = adminSource.slice(adminSource.indexOf('async function sendProofEmail('), adminSource.indexOf('/** Horizontal stage'));
const emailOutput = ts.transpileModule(emailSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function emailSetup(response: any = { ok: true, data: { ok: true }, status: 200 }) {
  const calls: any[] = [];
  const helper = setup();
  const send = new Function('trackingEmailMeta', 'proofMedia', 'isProofVideo', 'escapeHtml', 'proofTypeLabel', 'proofLink', 'wrapEmailHtml', 'n8nPost', 'proofRpc', `${emailOutput}; return sendProofEmail;`)(
    async () => ({ orderNumber: 'EM/SO/26-27/188', clientName: 'Client', trackingToken: 'track-token' }), helper.proofMedia, helper.isProofVideo,
    (value: string) => value.replace(/</g, '&lt;'), helper.proofTypeLabel, helper.proofLink,
    (body: string, meta: any) => { calls.push(['format', meta]); return body; },
    async (path: string, payload: any) => { calls.push(['send', path, payload]); return response; },
    async (payload: any) => { calls.push(['mark', payload]); return { ok: true }; },
  );
  return { send, calls };
}
const proof = { id: 'proof-1', title: 'Artwork', proof_type: 'artwork', approval_token: 'review-token', revision_number: 1, media_urls: [] };
test('proof email uses the authenticated email helper and marks the proof only after a successful send', async () => {
  const api = emailSetup({ ok: true, data: [{ ok: true }], status: 200 });
  await api.send({ po_number: 'PO-1' }, proof, ' client@example.test ');
  expect(api.calls[1][1]).toBe('send-email');
  expect(api.calls[1][2].subject).toBe('Proof Ready for Your Review — EM/SO/26-27/188');
  expect(api.calls[1][2].to).toBe('client@example.test');
  expect(api.calls[0][1].trackingToken).toBeNull();
  expect(api.calls[2]).toEqual(['mark', { action: 'mark_email_sent', proof_id: 'proof-1', email_recipient: 'client@example.test' }]);
});
test('failed proof notification never marks the email as sent', async () => {
  for (const response of [{ ok: false, data: null, status: 503 }, { ok: true, data: [{ ok: false, error: 'Rejected' }], status: 200 }]) {
    const api = emailSetup(response);
    await expect(api.send({ po_number: 'PO-1' }, proof, 'client@example.test')).rejects.toThrow();
    expect(api.calls.filter(call => call[0] === 'mark')).toEqual([]);
  }
});