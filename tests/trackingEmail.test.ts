import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { prettyStage } from '../src/lib/stageTemplates';

const source = readFileSync(new URL('../src/pages/admin/AdminPoTrackerUpdate.tsx', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function escapeHtml('), source.indexOf('function wrapEmailHtml('));
const output = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function setup(response: unknown, throws = false) {
  const calls: unknown[][] = [];
  const query: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'not', 'order', 'limit']) {
    query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
  }
  query.maybeSingle = async () => { if (throws) throw new Error('Media unavailable'); return response; };
  const make = new Function('supabase', 'prettyStage', 'mediaList', 'isVideoItem', `${output}; return { latestItemThumbnail, trackingEmailMeta, emailStageLabel };`);
  const mediaHelpers = source.slice(source.indexOf('const isVideoItem'), source.indexOf('type MediaItem')) + source.slice(source.indexOf('function mediaList('), source.indexOf('function escapeHtml('));
  const mediaOutput = ts.transpileModule(mediaHelpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const media = new Function(`${mediaOutput}; return { mediaList, isVideoItem };`)();
  return { ...make({ from: query.from }, prettyStage, media.mediaList, media.isVideoItem), calls };
}

test('thumbnail lookup is scoped to the PO and item and selects the latest media update', async () => {
  const helpers = setup({ data: { media_urls: [{ url: 'https://example.test/product.jpg', type: 'image' }] }, error: null });
  expect(await helpers.latestItemThumbnail('po-1', 'item-2')).toBe('https://example.test/product.jpg');
  expect(helpers.calls).toEqual([
    ['from', 'po_production_updates'], ['select', 'media_urls'], ['eq', 'po_id', 'po-1'], ['eq', 'item_id', 'item-2'],
    ['not', 'media_urls', 'is', null], ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['limit', 1],
  ]);
});

test('thumbnail lookup failures return no image instead of rejecting the email flow', async () => {
  expect(await setup(null, true).latestItemThumbnail('po-1', 'item-2')).toBeUndefined();
  expect(await setup({ error: { message: 'Denied' }, data: null }).latestItemThumbnail('po-1', 'item-2')).toBeUndefined();
});

test('videos and unsafe URLs are skipped while legacy image strings remain supported', async () => {
  const helpers = setup({ data: { media_urls: [
    { url: 'https://example.test/movie.mp4', type: '' },
    { url: 'https://example.test/movie', type: 'video/mp4' },
    { url: 'javascript:alert(1)', type: 'image' },
    'https://example.test/image.jpg',
  ] }, error: null });
  expect(await helpers.latestItemThumbnail('po-1', 'item-2')).toBe('https://example.test/image.jpg');
});

test('current order status and order date refresh after dispatch without changing the tracking token', async () => {
  const helpers = setup({ data: { overall_status: 'dispatched', order_date: '2026-10-01' }, error: null });
  expect(await helpers.trackingEmailMeta({ po_number: 'PO-1', client_order: { id: 'order-1', order_number: 'ORD-1', client_name: 'Client', order_date: '2026-09-30', overall_status: 'in_production', tracking_token: 'token-1' } })).toEqual({
    orderNumber: 'ORD-1', clientName: 'Client', orderDate: '2026-10-01', overallStatus: 'dispatched', trackingToken: 'token-1',
  });
  expect(helpers.calls).toEqual([['from', 'client_orders'], ['select', 'order_date, overall_status'], ['eq', 'id', 'order-1']]);
});

test('order summary refresh failure keeps existing order data and allows sending', async () => {
  const helpers = setup(null, true);
  const meta = await helpers.trackingEmailMeta({ po_number: 'PO-1', client_order: { id: 'order-1', order_date: '2026-10-01', overall_status: 'in_production', tracking_token: 'token-1' } });
  expect(meta.orderDate).toBe('2026-10-01');
  expect(meta.overallStatus).toBe('in_production');
  expect(meta.trackingToken).toBe('token-1');
});