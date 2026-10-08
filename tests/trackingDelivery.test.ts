import { expect, test } from 'bun:test';
import { isOrderDelivered } from '../src/lib/trackingDelivery';

test('an order marked delivered is complete even when road dispatch is still dispatched', () => {
  expect(isOrderDelivered('delivered', ['dispatched'])).toBe(true);
});
test('all delivered shipments complete the order before overall status catches up', () => {
  expect(isOrderDelivered('dispatched', ['delivered', 'delivered'])).toBe(true);
});
test('partial shipment delivery does not complete an undelivered order', () => {
  expect(isOrderDelivered('in_transit', ['delivered', 'in_transit'])).toBe(false);
});
test('no shipments does not imply delivery', () => {
  expect(isOrderDelivered('dispatched', [])).toBe(false);
  expect(isOrderDelivered('delivered', [])).toBe(true);
});