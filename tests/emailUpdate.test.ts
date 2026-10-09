import { expect, test } from 'bun:test';
import { recordEmailOutcome } from '../supabase/functions/handle-email-events/record-outcome';
import { recordEmailSendOutcome } from '../supabase/functions/_shared/email-send-outcome';

function fixture(failTable?: string) {
  const logs: any[] = [];
  const mirrors: any[] = [];
  const client = { from(table: string) {
    let action = 'select'; let payload: any;
    const filters: Array<(r: any) => boolean> = [];
    const query: any = {
      select() { return query; },
      eq(key: string, value: string) { filters.push(r => r[key] === value); return query; },
      limit() { return query; },
      upsert(row: any) { action = 'upsert'; payload = row; return query; },
      insert(row: any) { action = 'insert'; payload = row; return query; },
      then(resolve: any) {
        if (table === failTable) return Promise.resolve({ error: { code: 'ERROR', message: 'write failed' } }).then(resolve);
        if (action === 'select') return Promise.resolve({ data: logs.filter(r => filters.every(f => f(r))), error: null }).then(resolve);
        if (action === 'upsert') mirrors.push(payload);
        else logs.push(payload);
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return query;
  } };
  return { client, logs, mirrors };
}

for (const [reason, status] of [['bounce', 'bounced'], ['complaint', 'complained'], ['unsubscribe', 'suppressed']] as const) {
  test(`mirrors ${reason} with the existing data contract and deduplicates redelivery`, async () => {
    const f = fixture();
    const event = { event_id: 'event-1', data: { recipient: 'Supplier@Example.test' } };
    await recordEmailOutcome(f.client, event, reason);
    await recordEmailOutcome(f.client, event, reason);
    expect(f.mirrors).toEqual([{ email: 'supplier@example.test', reason, metadata: null }]);
    expect(f.logs).toHaveLength(1);
    expect(f.logs[0].status).toBe(status);
    expect(f.logs[0].message_id).toBe('event-1');
  });
}

for (const table of ['email_send_log', 'suppressed_emails']) {
  test(`outcome errors from ${table} cause webhook retry`, async () => {
    const f = fixture(table);
    await expect(recordEmailOutcome(f.client, { event_id: 'event-1', data: { recipient: 'supplier@example.test' } }, 'bounce')).rejects.toMatchObject({ code: 'ERROR' });
  });
}

test('audit failure never changes a send outcome', async () => {
  const f = fixture('email_send_log');
  await expect(recordEmailSendOutcome(f.client, { message_id: 'send-1', template_name: 'invite', recipient_email: 'supplier@example.test', status: 'sent' })).resolves.toBeUndefined();
});