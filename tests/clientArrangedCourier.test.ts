import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The stepper rule and the shipment-tracking gate are evaluated straight from the
// page source, so the tests exercise the code the page actually runs.
const source = readFileSync(new URL('../src/pages/TrackOrder.tsx', import.meta.url), 'utf8');

const stepsStart = source.indexOf('const STEPS = [');
const stepsEnd = source.indexOf('];', stepsStart) + 2;
const deriveStart = source.indexOf('const visibleSteps = ');
const deriveEnd = source.indexOf('let currentIdx', deriveStart);

const FULL_KEYS = ['order_received', 'material_sourced', 'in_production', 'dispatched', 'in_transit', 'delivered'];

function stepKeysFor(order: unknown) {
  const run = new Function(
    'order',
    `${source.slice(stepsStart, stepsEnd)}\n${source.slice(deriveStart, deriveEnd)}\nreturn visibleSteps;`
  );
  return (run(order) as Array<{ key: string }>).map((s) => s.key);
}

test('client-arranged courier trims the stepper to four steps', () => {
  expect(stepKeysFor({ client_arranged_courier: true })).toEqual([
    'order_received',
    'material_sourced',
    'in_production',
    'dispatched',
  ]);
});

test('Emboss-arranged courier keeps all six stepper steps', () => {
  for (const order of [{ client_arranged_courier: false }, {}, undefined]) {
    expect(stepKeysFor(order)).toEqual(FULL_KEYS);
  }
});

const TRACKING_GATE = 'trackableDispatches.length > 0 && !order?.client_arranged_courier';

test('shipment tracking section is gated on the client-arranged courier flag', () => {
  expect(source.indexOf(`{${TRACKING_GATE} && (`)).toBeGreaterThan(-1);
  const run = new Function('trackableDispatches', 'order', `return (${TRACKING_GATE});`);
  const dispatches = [{ lr_number: 'LR-1' }];
  expect(run(dispatches, { client_arranged_courier: true })).toBe(false);
  expect(run(dispatches, { client_arranged_courier: false })).toBe(true);
  expect(run([], { client_arranged_courier: false })).toBe(false);
});
