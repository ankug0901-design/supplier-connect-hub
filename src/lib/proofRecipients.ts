export function parseProofRecipients(value: string): string[] {
  const emails = [...new Set(value.split(',').map(email => email.trim()).filter(Boolean))];
  if (!emails.length) throw new Error('Enter at least one email recipient');
  if (emails.some(email => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))) throw new Error('Enter valid email addresses');
  return emails;
}

export function proofCreationPayload(fields: Record<string, unknown>, emails: string[]): Record<string, unknown> {
  if (!emails.length) throw new Error('Enter at least one email recipient');
  // The deployed RPC iterates recipients with jsonb_array_elements_text.
  return emails.length === 1
    ? { ...fields, action: 'create_proof', email_recipient: emails[0] }
    : { ...fields, action: 'create_proof_group', recipients: emails };
}