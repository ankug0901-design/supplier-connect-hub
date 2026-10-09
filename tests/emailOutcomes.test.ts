import { expect, test } from 'bun:test';
import { emailOutcomesQuery, EMPTY_EMAIL_FILTERS } from '../src/lib/emailOutcomes';

function run(filters = EMPTY_EMAIL_FILTERS, options: Parameters<typeof emailOutcomesQuery>[2] = {}) {
  const calls: unknown[][] = [];
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'ilike', 'gte', 'lt', 'eq', 'in', 'order', 'range']) {
    query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
  }
  const client = { from: (table: string) => { calls.push(['from', table]); return query; } } as unknown as Parameters<typeof emailOutcomesQuery>[0];
  emailOutcomesQuery(client, filters, options);
  return calls;
}

test('email history uses exact counts and stable newest-first pagination', () => {
  const calls = run(EMPTY_EMAIL_FILTERS, { page: 1 });
  expect(calls[0]).toEqual(['from', 'email_send_log']);
  expect(calls[1]).toEqual(['select', 'id, message_id, template_name, recipient_email, status, error_message, created_at', { count: 'exact', head: false }]);
  expect(calls.slice(-3)).toEqual([['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 25, 49]]);
});

test('recipient and template filters are literal partial matches', () => {
  const calls = run({ ...EMPTY_EMAIL_FILTERS, recipient: ' a_b% ', template: 'invite' });
  expect(calls).toContainEqual(['ilike', 'recipient_email', '%a\\_b\\%%']);
  expect(calls).toContainEqual(['ilike', 'template_name', '%invite%']);
});

test('date range includes the whole final UTC day', () => {
  const calls = run({ ...EMPTY_EMAIL_FILTERS, from: '2026-10-01', to: '2026-10-09' });
  expect(calls).toContainEqual(['gte', 'created_at', '2026-10-01T00:00:00.000Z']);
  expect(calls).toContainEqual(['lt', 'created_at', '2026-10-10T00:00:00.000Z']);
});

test('delivered counts never include accepted sends and counts share active filters', () => {
  const calls = run({ ...EMPTY_EMAIL_FILTERS, status: 'bounced' }, { countOnly: true, statuses: ['delivered'] });
  expect(calls).toContainEqual(['eq', 'status', 'bounced']);
  expect(calls).toContainEqual(['in', 'status', ['delivered']]);
  expect(calls.some(([method]) => method === 'range')).toBe(false);
});

test('failures include legacy dead-letter outcomes', () => {
  expect(run(EMPTY_EMAIL_FILTERS, { countOnly: true, statuses: ['failed', 'dlq'] })).toContainEqual(['in', 'status', ['failed', 'dlq']]);
});