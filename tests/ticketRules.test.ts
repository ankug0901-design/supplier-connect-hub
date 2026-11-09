import { describe, expect, test } from 'bun:test';
import { SUPPLIER_TICKET_TYPES, avgResolutionHours, nextTicketNumber, statusPatch, ticketMatches } from '../src/lib/ticketRules';

const day = new Date(2026, 10, 9);

test('ticket number is TKT-YYYYMMDD-NNNN, starting at 0001', () => {
  expect(nextTicketNumber(day, [])).toBe('TKT-20261109-0001');
});
test('ticket number increments the highest number for the same day only', () => {
  expect(nextTicketNumber(day, ['TKT-20261109-0007', 'TKT-20261108-0099'])).toBe('TKT-20261109-0008');
});
test('collision retries bump the sequence', () => {
  expect(nextTicketNumber(day, ['TKT-20261109-0007'], 2)).toBe('TKT-20261109-0010');
});
test('suppliers may only raise the five allowed ticket types', () => {
  expect([...SUPPLIER_TICKET_TYPES]).toEqual(['query', 'complaint', 'delivery_issue', 'quality_issue', 'invoice_dispute']);
});
test('search covers subject, number, description and supplier name', () => {
  const t = { subject: 'Late box', ticket_number: 'TKT-20261109-0001', description: 'pallet damaged', supplier_name: 'Acme Print', status: 'open', priority: 'high', ticket_type: 'issue', supplier_id: 's1', created_at: '2026-11-09T10:00:00Z' };
  const f = { search: '', statuses: [], priorities: [], type: 'all', supplierId: 'all' };
  for (const q of ['late', '0001', 'pallet', 'acme']) expect(ticketMatches(t, { ...f, search: q })).toBe(true);
  expect(ticketMatches(t, { ...f, search: 'zzz' })).toBe(false);
  expect(ticketMatches(t, { ...f, statuses: ['resolved'] })).toBe(false);
  expect(ticketMatches(t, { ...f, from: '2026-11-10' })).toBe(false);
});
test('resolving stamps resolved_at; reopening clears it', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  expect(statusPatch('resolved', 'Ankur', now)).toEqual({ status: 'resolved', resolved_at: now.toISOString(), resolved_by: 'Ankur' });
  expect(statusPatch('reopened', 'Ankur', now)).toEqual({ status: 'reopened', resolved_at: null, resolved_by: null });
});
test('average resolution time is in hours over resolved tickets only', () => {
  expect(avgResolutionHours([{ created_at: '2026-11-09T00:00:00Z', resolved_at: '2026-11-09T04:00:00Z' }, { created_at: '2026-11-09T00:00:00Z', resolved_at: null }])).toBe(4);
  expect(avgResolutionHours([])).toBeNull();
});

import { canCommentOnTicket as canC } from '../src/lib/ticketRules';
describe('supplier comment permission', () => {
  const t = { created_by: 'u1', supplier_id: 's1', linked_supplier_id: null };
  test('owner can comment', () => expect(canC('supplier', t, 'u1', 'x')).toBe(true));
  test('linked supplier can comment', () => expect(canC('supplier', t, 'u9', 's1')).toBe(true));
  test('unrelated supplier cannot', () => expect(canC('supplier', t, 'u9', 's9')).toBe(false));
  test('admin always can', () => expect(canC('admin', t, null, null)).toBe(true));
});
