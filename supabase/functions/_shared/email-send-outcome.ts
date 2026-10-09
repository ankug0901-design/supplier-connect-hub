// Existing audit tables are a convenience history, never send-gating authority.
export async function recordEmailSendOutcome(
  client: any,
  row: {
    message_id: string;
    template_name: string;
    recipient_email: string;
    status: 'sent' | 'suppressed' | 'failed';
    error_message?: string;
  },
): Promise<void> {
  try {
    const { error } = await client.from('email_send_log').insert(row);
    if (error) console.error('Email audit write failed', { code: error.code, message: error.message });
  } catch {
    console.error('Email audit write failed');
  }
}