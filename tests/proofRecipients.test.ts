import { expect, test } from 'bun:test';
import { parseProofRecipients, proofCreationPayload } from '../src/lib/proofRecipients';
import { certificateFields } from '../src/lib/proofCertificate';

test('one recipient preserves create_proof and email_recipient', () => {
  expect(proofCreationPayload({ title: 'Artwork' }, parseProofRecipients(' client@example.com '))).toEqual({ title: 'Artwork', action: 'create_proof', email_recipient: 'client@example.com' });
});
test('multiple recipients use group creation with the existing RPC email-string array', () => {
  expect(proofCreationPayload({ title: 'Artwork' }, parseProofRecipients('first@example.com, second@example.com, first@example.com'))).toEqual({ title: 'Artwork', action: 'create_proof_group', recipients: ['first@example.com', 'second@example.com'] });
});
test('empty and malformed recipients cannot be saved', () => {
  expect(() => parseProofRecipients(' , ')).toThrow();
  expect(() => parseProofRecipients('valid@example.com, invalid')).toThrow();
});
test('certificate contains supplied order, entered name and optional item and PO reference', () => {
  const fields = certificateFields({ orderNumber: 'ORDER-123', clientName: 'Approver', itemName: 'Box', clientPoRef: 'CLIENT-456', approvedOn: '2026-10-10T13:26:00Z' });
  expect(fields.slice(0, 4)).toEqual([['Order Number', 'ORDER-123'], ['Client Name', 'Approver'], ['Item', 'Box'], ['Client PO Reference', 'CLIENT-456']]);
  expect(fields[4][1]).toContain('2026');
  expect(certificateFields({ orderNumber: 'ORDER-123', clientName: '', approvedOn: '2026-10-10T13:26:00Z' }).map(([label]) => label)).toEqual(['Order Number', 'Client Name', 'Approved On']);
});