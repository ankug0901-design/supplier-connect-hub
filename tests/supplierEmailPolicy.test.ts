import { describe, test, expect } from 'bun:test';
import { DELIVERY_CONFIRMATION_CC, poReleaseEmailKey, shouldNotifyPoRelease, paymentIsMade, supplierPaymentEmailKey } from '../supabase/functions/_shared/supplier-email-policy';

describe('supplier email rules', () => {
  test('delivery date notice includes the requested Cc', () => {
    expect(DELIVERY_CONFIRMATION_CC).toBe('hkumar@embossmarketing.in');
  });
  test('one delivery date notice per PO, even on later syncs', () => {
    expect(shouldNotifyPoRelease({ status: 'open' })).toBe(true);
    expect(shouldNotifyPoRelease({ status: 'open', delivery_notification_sent_at: '2026-10-01T00:00:00Z' })).toBe(false);
    expect(shouldNotifyPoRelease({ status: 'approved', delivery_first_notified_at: '2026-10-01T00:00:00Z' })).toBe(false);
    expect(poReleaseEmailKey('po-123')).toBe('po-release-po-123');
    expect(poReleaseEmailKey('po-123')).not.toBe(poReleaseEmailKey('po-456'));
  });
  test('only released POs trigger supplier notices', () => {
    expect(shouldNotifyPoRelease({ status: 'approved' })).toBe(true);
    expect(shouldNotifyPoRelease({ status: 'draft' })).toBe(false);
    expect(shouldNotifyPoRelease({ status: 'pending_approval' })).toBe(false);
    expect(shouldNotifyPoRelease({ status: 'cancelled' })).toBe(false);
  });
  test('only made payments trigger supplier notices', () => {
    expect(paymentIsMade({ status: 'completed', amount: 1000 })).toBe(true);
    expect(paymentIsMade({ status: 'pending', amount: 1000 })).toBe(false);
    expect(paymentIsMade({ status: 'failed', amount: 1000 })).toBe(false);
    expect(paymentIsMade({ status: 'completed', amount: 0 })).toBe(false);
  });
  test('payment retries and invoice splits use one supplier transaction identity', () => {
    expect(supplierPaymentEmailKey('supplier-1', 'txn-1')).toBe('supplier-payment-supplier-1-txn-1');
    expect(supplierPaymentEmailKey('supplier-1', 'txn-1')).not.toBe(supplierPaymentEmailKey('supplier-1', 'txn-2'));
    expect(supplierPaymentEmailKey('supplier-1', 'txn-1')).not.toBe(supplierPaymentEmailKey('supplier-2', 'txn-1'));
  });
});
