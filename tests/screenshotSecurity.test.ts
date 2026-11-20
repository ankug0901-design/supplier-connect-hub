import { expect, test } from 'bun:test';
import { canManageRfq, canSyncZoho, validDispatchKey } from '../supabase/functions/_shared/access-policy';

test('RFQ mutation requires verified management or private automation access', () => {
  expect(canManageRfq(false, false, false)).toBe(false);
  expect(canManageRfq(false, true, false)).toBe(true);
  expect(canManageRfq(false, false, true)).toBe(true);
  expect(canManageRfq(true, false, false)).toBe(true);
});
test('suppliers sync only their own record, not other suppliers or bulk', () => {
  expect(canSyncZoho(false, false, 'own', 'own')).toBe(true);
  expect(canSyncZoho(false, false, 'other', 'own')).toBe(false);
  expect(canSyncZoho(false, false, null, 'own')).toBe(false);
});
test('anonymous bulk sync denied while admin and service schedules allowed', () => {
  expect(canSyncZoho(false, false, null, null)).toBe(false);
  expect(canSyncZoho(false, true, null, null)).toBe(true);
  expect(canSyncZoho(true, false, null, null)).toBe(true);
});
test('dispatch requires the configured private key and fails closed when absent', () => {
  expect(validDispatchKey('old-public-key', undefined)).toBe(false);
  expect(validDispatchKey(null, 'test-private-key')).toBe(false);
  expect(validDispatchKey('old-public-key', 'test-private-key')).toBe(false);
  expect(validDispatchKey('test-private-key', 'test-private-key')).toBe(true);
});