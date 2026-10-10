import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/proofApproval.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source.replace(/^import .*supabase.*;$/m, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function setup(raw: unknown = { ok: true }, error: unknown = null) {
  const calls: unknown[] = [];
  const exports: Record<string, any> = {};
  new Function('exports', 'supabase', output)(exports, {
    rpc: async (...args: unknown[]) => { calls.push(args); return { data: raw, error }; },
    functions: { invoke: async (...args: unknown[]) => { calls.push(args); return { data: raw, error }; } },
  });
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
  expect(setup().proofResponsePayload('approve_proof', 'token', ' ', '')).toEqual({ action: 'approve_proof', approval_token: 'token', comment: '', client_name: '', annotations: [] });
});
test('requesting changes requires a nonblank comment', () => {
  const api = setup();
  expect(() => api.proofResponsePayload('request_revision', 'token', '   ', '')).toThrow('Please describe the changes needed');
  expect(api.proofResponsePayload('request_revision', 'token', ' Change colour ', ' Reviewer ')).toEqual({ action: 'request_revision', approval_token: 'token', comment: 'Change colour', client_name: 'Reviewer', annotations: [] });
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
test('proof response writes use the token validated notification path', async () => {
  const api = setup();
  await api.proofRpc({ action: 'approve_proof', approval_token: 'review-token' });
  expect(api.calls).toEqual([['n8n-proxy', { body: { path: 'proof-response', payload: { action: 'approve_proof', approval_token: 'review-token' } } }]]);
});
test('annotations stop at ten across all images and preserve percentage coordinates and media index', () => {
  const api = setup();
  let annotations: any[] = [];
  for (let i = 0; i < 10; i++) annotations = api.addProofAnnotation(annotations, i % 2, 25, 75);
  expect(annotations).toHaveLength(10);
  expect(api.addProofAnnotation(annotations, 2, 50, 50)).toEqual(annotations);
  expect(annotations[1]).toEqual({ number: 2, media_index: 1, x_percent: 25, y_percent: 75, comment: '' });
  const reduced = annotations.filter(a => a.number !== 2);
  expect(api.addProofAnnotation(reduced, 0, 10, 20).at(-1).number).toBe(2);
  expect(() => api.proofResponsePayload('request_revision', 'token', 'Change', '', [...annotations, annotations[0]])).toThrow('A maximum of 10 markers is allowed');
  expect(api.proofResponsePayload('request_revision', 'token', 'Change', '', annotations).annotations).toEqual(annotations);
});
test('download filename uses media name or decoded URL path without query parameters', () => {
  const api = setup();
  expect(api.proofFilename({ url: 'https://example.test/path/Sample%20Proof.png?t=1' })).toBe('Sample Proof.png');
  expect(api.proofFilename({ url: 'https://example.test/', filename: 'Artwork.png' })).toBe('Artwork.png');
  expect(api.proofFilename({ url: 'https://example.test/' })).toBe('proof-file');
});
test('download uses blob attachment and cleans up, with new tab fallback for failed fetches', async () => {
  const calls: any[] = [];
  let fail = false;
  const exports: Record<string, any> = {};
  const anchor = { href: '', download: '', click: () => calls.push(['click', anchor.href, anchor.download]), remove: () => calls.push(['remove']) };
  new Function('exports', 'supabase', 'fetch', 'URL', 'document', 'window', output)(exports, {},
    async () => { if (fail) throw new Error('CORS'); return { ok: true, blob: async () => 'blob' }; },
    { createObjectURL: () => 'blob:test', revokeObjectURL: (url: string) => calls.push(['revoke', url]) },
    { createElement: () => anchor, body: { appendChild: () => calls.push(['append']) } },
    { open: (...args: any[]) => calls.push(['open', ...args]) });
  await exports.downloadFile('https://example.test/proof.png', 'Artwork.png');
  expect(calls).toEqual([['append'], ['click', 'blob:test', 'Artwork.png'], ['remove'], ['revoke', 'blob:test']]);
  calls.length = 0; fail = true;
  await exports.downloadFile('https://example.test/proof.png', 'Artwork.png');
  expect(calls).toEqual([['open', 'https://example.test/proof.png', '_blank']]);
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
  expect(api.calls[1][2].subject).toBe('Proof for Review — Artwork');
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

test('proof email forwards cc and custom subject and escapes the note before the review link', async () => {
  const api = emailSetup();
  await api.send({ po_number: 'PO-1' }, proof, 'client@example.test', ' copy@example.test, other@example.test ', ' Custom review ', ' <script>note</script>\nSecond line ');
  const payload = api.calls[1][2];
  expect(payload.cc).toBe('copy@example.test, other@example.test');
  expect(payload.subject).toBe('Custom review');
  expect(payload.html).toContain('&lt;script>note&lt;/script><br>Second line');
  expect(payload.html).not.toContain('<script>');
  expect(payload.html.indexOf('&lt;script>')).toBeLessThan(payload.html.indexOf('Review Proof'));
});

const sectionSource = readFileSync(new URL('../src/components/proofs/AdminProofSection.tsx', import.meta.url), 'utf8');
const handlers = sectionSource.slice(sectionSource.indexOf('  const openEmailDialog ='), sectionSource.indexOf('  const remove ='));
const handlersOutput = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function dialogSetup(fail = false) {
  const state: any = { emailProof: null, emailTo: '', emailCc: '', emailSubject: '', emailBody: '', busy: null };
  const calls: any[] = [];
  const setters = ['emailProof', 'emailTo', 'emailCc', 'emailSubject', 'emailBody', 'busy'];
  const factory = new Function('state', 'sendEmail', 'toast', 'load', 'clientEmail', ...setters.map(key => `set${key[0].toUpperCase()}${key.slice(1)}`), `with(state) { ${handlersOutput}; return { openEmailDialog, sendProofEmail }; }`);
  const api = factory(state, async (...args: any[]) => { calls.push(['send', ...args]); if (fail) throw new Error('Rejected'); }, (value: any) => calls.push(['toast', value]), async () => calls.push(['load']), 'fallback@example.test', ...setters.map(key => (value: any) => { state[key] = value; }));
  return { api, state, calls };
}
test('opening proof confirmation does not send and resets the editable fields', () => {
  const { api, state, calls } = dialogSetup();
  state.emailCc = 'old@example.test'; state.emailBody = 'Old note';
  api.openEmailDialog({ ...proof, email_recipient: 'saved@example.test' });
  expect(state.emailTo).toBe('saved@example.test');
  expect(state.emailCc).toBe(''); expect(state.emailBody).toBe('');
  expect(state.emailSubject).toBe('Proof for Review — Artwork');
  expect(state.emailProof.id).toBe('proof-1');
  expect(calls).toEqual([]);
  api.openEmailDialog(proof);
  expect(state.emailTo).toBe('fallback@example.test');
});
test('confirmation sends edited fields then closes and reloads', async () => {
  const { api, state, calls } = dialogSetup();
  api.openEmailDialog(proof);
  Object.assign(state, { emailTo: ' edited@example.test ', emailCc: ' copy@example.test ', emailSubject: 'Edited subject', emailBody: 'Edited note' });
  await api.sendProofEmail();
  expect(calls[0]).toEqual(['send', proof, 'edited@example.test', 'copy@example.test', 'Edited subject', 'Edited note']);
  expect(state.emailProof).toBeNull(); expect(state.busy).toBeNull();
  expect(calls.at(-1)).toEqual(['load']);
});
test('blank recipients and busy sends do not send, and failures keep the dialog open', async () => {
  const { api, state, calls } = dialogSetup(true);
  api.openEmailDialog(proof); state.emailTo = ' ';
  await api.sendProofEmail();
  expect(calls.filter(call => call[0] === 'send')).toEqual([]);
  state.emailTo = 'client@example.test'; state.busy = 'proof-1';
  await api.sendProofEmail();
  expect(calls.filter(call => call[0] === 'send')).toEqual([]);
  state.busy = null;
  await api.sendProofEmail();
  expect(state.emailProof).toEqual(proof); expect(state.busy).toBeNull();
  expect(calls.filter(call => call[0] === 'load')).toEqual([]);
});