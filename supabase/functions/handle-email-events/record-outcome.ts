// Mirrors are notification-only. Managed delivery remains the suppression authority.
export async function recordEmailOutcome(
  client: any,
  event: { event_id: string; data: { recipient: string } },
  reason: 'bounce' | 'complaint' | 'unsubscribe',
): Promise<void> {
  const status = reason === 'bounce' ? 'bounced' : reason === 'complaint' ? 'complained' : 'suppressed';
  const email = event.data.recipient.toLowerCase();
  const { data: existing, error: lookupError } = await client.from('email_send_log')
    .select('id').eq('message_id', event.event_id).eq('status', status).limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) return;

  const { error: mirrorError } = await client.from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' });
  if (mirrorError) throw mirrorError;

  const { error: logError } = await client.from('email_send_log').insert({
    message_id: event.event_id,
    template_name: 'system',
    recipient_email: email,
    status,
    error_message: reason === 'bounce' ? 'Email bounced' : reason === 'complaint' ? 'Recipient complained' : 'Recipient unsubscribed',
    metadata: null,
  });
  if (logError) throw logError;
}