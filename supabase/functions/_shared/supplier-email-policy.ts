// Stable event identities keep overlapping triggers and sync retries on one send.
export const DELIVERY_CONFIRMATION_CC = 'hkumar@embossmarketing.in';
export function poReleaseEmailKey(poId: string): string {
  return `po-release-${poId}`;
}
export function shouldNotifyPoRelease(po: { status?: string | null; delivery_notification_sent_at?: string | null; delivery_first_notified_at?: string | null }): boolean {
  return ['approved', 'open'].includes(String(po.status || '').toLowerCase()) &&
    !po.delivery_notification_sent_at && !po.delivery_first_notified_at;
}
export function paymentIsMade(payment: { status?: string | null; amount?: number | null }): boolean {
  return ['completed', 'paid', 'success', 'succeeded'].includes(String(payment.status || '').toLowerCase()) && Number(payment.amount) > 0;
}
export function supplierPaymentEmailKey(supplierId: string, transactionId: string): string {
  return `supplier-payment-${supplierId}-${transactionId}`;
}