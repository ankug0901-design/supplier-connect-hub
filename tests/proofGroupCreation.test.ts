import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseProofRecipients, proofCreationPayload } from '../src/lib/proofRecipients';

const source = readFileSync(new URL('../src/components/proofs/AdminProofSection.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const create ='), source.indexOf('  const openEmailDialog ='));
const output = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
async function create(recipient: string, failedEmail = '') {
  const calls: any[] = [];
  const run = new Function('saving', 'uploading', 'title', 'media', 'recipient', 'recipientDraft', 'revised', 'orderId', 'itemId', 'proofType', 'description', 'updatedBy', 'parseProofRecipients', 'proofCreationPayload', 'proofRpc', 'sendEmail', 'setSaving', 'setOpen', 'load', 'toast', `${output}; return create;`)(
    false, false, 'Artwork', [{ url: 'https://example.test/proof.png' }], recipient, '', null, 'order-1', 'all', 'artwork', '', 'Admin', parseProofRecipients, proofCreationPayload,
    async (payload: any) => { calls.push(['rpc', payload]); const emails = payload.recipients || [payload.email_recipient]; const proofs = emails.map((email: string, index: number) => ({ id: `proof-${index}`, title: 'Artwork', approval_token: `token-${index}`, email_recipient: email })); return payload.action === 'create_proof' ? { proof: proofs[0] } : { proofs }; },
    async (proof: any, email: string) => { calls.push(['email', proof.approval_token, email]); if (email === failedEmail) throw new Error('Rejected'); },
    () => {}, () => {}, async () => {}, (value: any) => calls.push(['toast', value]),
  );
  await run({ preventDefault() {} });
  return calls;
}
test('single recipient creates one proof and sends its individual token', async () => {
  const calls = await create('one@example.com');
  expect(calls[0][1].action).toBe('create_proof');
  expect(calls.filter(call => call[0] === 'email')).toEqual([['email', 'token-0', 'one@example.com']]);
});
test('each group recipient receives its own proof token even if another email fails', async () => {
  const calls = await create('one@example.com, two@example.com', 'one@example.com');
  expect(calls[0][1].action).toBe('create_proof_group');
  expect(calls.filter(call => call[0] === 'email')).toEqual([['email', 'token-0', 'one@example.com'], ['email', 'token-1', 'two@example.com']]);
  expect(calls.at(-1)[1].title).toBe('Proof saved; email not confirmed');
});