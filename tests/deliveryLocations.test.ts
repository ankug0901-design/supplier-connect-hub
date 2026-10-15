import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const trackSource = readFileSync(new URL('../src/pages/TrackOrder.tsx', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../src/pages/admin/AdminPoTrackerUpdate.tsx', import.meta.url), 'utf8');

test('client tracking shows delivery locations with a total row only when present', () => {
  expect(trackSource).toContain('delivery_locations?: Array<{ location: string; quantity: number }> | null');
  expect(trackSource).toContain('Array.isArray(it.delivery_locations) && it.delivery_locations.length > 0');
  expect(trackSource).toContain('Delivery Locations');
  expect(trackSource).toMatch(/delivery_locations\.reduce\(\(sum, loc\) => sum \+ \(Number\(loc\.quantity\) \|\| 0\), 0\)/);
});

test('admin item form manages delivery locations and saves via set_delivery_locations with the item id', () => {
  expect(adminSource).toContain('delivery_locations?: Array<{ location: string; quantity: number }> | null');
  expect(adminSource).toContain("action: 'set_delivery_locations'");
  expect(adminSource).toMatch(/item_id: item\.id,\s*locations/);
  expect(adminSource).toMatch(/<DeliveryLocationsSection item=\{item\} onDone=\{onDone\} \/>/);
});

test('admin reload query selects delivery_locations so saved locations survive refetch', () => {
  expect(adminSource).toMatch(/items:po_items\([^)]*delivery_locations[^)]*\)/);
});
