import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/documentHub.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source.replace(/^import .*supabase.*;$/m, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function setup(raw: unknown = { ok: true }, error: unknown = null) {
  const calls: unknown[] = [];
  const exports: Record<string, any> = {};
  new Function('exports', 'supabase', output)(exports, { rpc: async (...args: unknown[]) => { calls.push(args); return { data: raw, error }; } });
  return { ...exports, calls } as any;
}
test('document token lookup uses document_manage and unwraps array responses', async () => {
  const response = { ok: true, document: { id: 'doc-1' } };
  for (const raw of [response, [response]]) {
    const api = setup(raw);
    expect(await api.documentRpc({ action: 'get_document_by_token', access_token: 'document-token' })).toEqual(response);
    expect(api.calls).toEqual([['document_manage', { payload: { action: 'get_document_by_token', access_token: 'document-token' } }]]);
  }
});
test('document errors are surfaced rather than displaying success', async () => {
  await expect(setup(null, { message: 'Unavailable' }).documentRpc({ action: 'list_documents' })).rejects.toThrow('Unavailable');
  await expect(setup({ ok: false, error: 'Not found' }).documentRpc({ action: 'get_document_by_token' })).rejects.toThrow('Not found');
});
test('document links encode tokens and file links exclude unsafe protocols', () => {
  const api = setup();
  expect(api.documentLink('a&b')).toBe('https://supplierconnect.embossmarketing.in/documents?t=a%26b');
  expect(api.documentFileUrl('javascript:alert(1)')).toBeUndefined();
  expect(api.documentFileUrl('https://example.test/file.pdf')).toBe('https://example.test/file.pdf');
});
test('file sizes use bytes, kilobytes and megabytes at the supplied boundaries', () => {
  const api = setup();
  expect(api.formatFileSize(null)).toBe('');
  expect(api.formatFileSize(1023)).toBe('1023 B');
  expect(api.formatFileSize(1024)).toBe('1.0 KB');
  expect(api.formatFileSize(1048576)).toBe('1.0 MB');
});

const adminSource = readFileSync(new URL('../src/pages/admin/AdminPoTrackerUpdate.tsx', import.meta.url), 'utf8');
const emailSource = adminSource.slice(adminSource.indexOf('async function sendDocumentEmail('), adminSource.indexOf('function StageBar('));
const emailOutput = ts.transpileModule(emailSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function emailSetup(response: any = { ok: true, data: [{ ok: true }], status: 200 }) {
  const calls: any[] = [];
  const send = new Function('trackingEmailMeta', 'escapeHtml', 'documentTypeLabel', 'documentLink', 'wrapEmailHtml', 'n8nPost', `${emailOutput}; return sendDocumentEmail;`)(
    async () => ({ orderNumber: 'EM/SO/26-27/188', clientName: 'Client' }), (s: string) => s.replace(/</g, '&lt;'), setup().documentTypeLabel, setup().documentLink,
    (body: string, meta: any) => { calls.push(['format', meta]); return body; },
    async (path: string, payload: any) => { calls.push(['send', path, payload]); return response; },
  );
  return { send, calls };
}
const doc = { id: 'doc-1', title: 'Invoice <1>', document_type: 'invoice', access_token: 'a&b', description: null };
test('document emails use authenticated sending and branded formatting with the document link', async () => {
  const api = emailSetup();
  await api.send({ po_number: 'PO-1' }, doc, ' client@example.test ');
  expect(api.calls[0][1].trackingToken).toBeNull();
  expect(api.calls[1][1]).toBe('send-email');
  expect(api.calls[1][2].to).toBe('client@example.test');
  expect(api.calls[1][2].subject).toBe('Document Shared — Invoice <1>');
  expect(api.calls[1][2].html).toContain('Invoice &lt;1>');
  expect(api.calls[1][2].html).toContain('/documents?t=a%26b');
});
test('failed document notifications reject for a recoverable retry', async () => {
  for (const response of [{ ok: false, status: 503 }, { ok: true, data: [{ ok: false, error: 'Rejected' }], status: 200 }]) {
    await expect(emailSetup(response).send({ po_number: 'PO-1' }, doc, 'client@example.test')).rejects.toThrow();
  }
});
test('document emails forward cc and edited subject and escape the optional message', async () => {
  const api = emailSetup();
  await api.send({ po_number: 'PO-1' }, doc, 'client@example.test', ' copy@example.test, team@example.test ', 'Updated invoice', 'Please review <details>\nThank you');
  const payload = api.calls[1][2];
  expect(payload.cc).toBe('copy@example.test, team@example.test');
  expect(payload.subject).toBe('Updated invoice');
  expect(payload.html).toContain('Please review &lt;details><br>Thank you');
});

const sectionSource = readFileSync(new URL('../src/components/documents/AdminDocumentSection.tsx', import.meta.url), 'utf8');
const notifySource = sectionSource.slice(sectionSource.indexOf('  const notify ='), sectionSource.indexOf('  const remove ='));
const notifyOutput = ts.transpileModule(notifySource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
test('opening document email only prepares confirmation fields without sending', () => {
  const openSource = sectionSource.slice(sectionSource.indexOf('  const openEmail ='), sectionSource.indexOf('  const notify ='));
  const output = ts.transpileModule(openSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const values: Record<string, unknown> = {};
  const openEmail = new Function('recipient', 'clientEmail', 'setEmailTo', 'setEmailCc', 'setEmailSubject', 'setEmailBody', 'setEmailDocument', 'sendEmail', `${output}; return openEmail;`)(
    ' recipient@example.test ', 'fallback@example.test',
    (v: unknown) => { values.to = v; }, (v: unknown) => { values.cc = v; },
    (v: unknown) => { values.subject = v; }, (v: unknown) => { values.message = v; },
    (v: unknown) => { values.document = v; }, () => { throw new Error('Must not send before confirmation'); },
  );
  openEmail(doc);
  expect(values).toEqual({ to: 'recipient@example.test', cc: '', subject: 'Document Shared — Invoice <1>', message: '', document: doc });
});
test('document email timestamps are written only after successful sending', async () => {
  for (const fail of [false, true]) {
    const calls: any[] = [];
    const notify = new Function('emailDocument', 'busy', 'emailTo', 'emailCc', 'emailSubject', 'emailBody', 'setBusy', 'sendEmail', 'documentRpc', 'toast', 'load', 'setEmailDocument', `${notifyOutput}; return notify;`)(
      doc, null, 'client@example.test', ' copy@example.test ', 'Custom subject', 'Custom message', () => {}, async (...args: any[]) => { calls.push(['send', ...args]); if (fail) throw new Error('Rejected'); },
      async (payload: any) => { calls.push(payload); }, () => {}, async () => { calls.push('reload'); }, () => { calls.push('close'); },
    );
    await notify();
    const sendCall = ['send', doc, 'client@example.test', 'copy@example.test', 'Custom subject', 'Custom message'];
    expect(calls).toEqual(fail ? [sendCall] : [sendCall, { action: 'mark_email_sent', id: 'doc-1', email_recipient: 'client@example.test' }, 'close', 'reload']);
  }
});