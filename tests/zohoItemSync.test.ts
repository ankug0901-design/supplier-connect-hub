import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/zoho-sync/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('          // Preserve item UUIDs');
const end = source.indexOf('\n\n        }', start);
const block = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const execute = new Function('supabase', 'itemRows', `return (async () => {${block}})();`);
const row = (po: string, line: string | null, name: string | null = 'Item') => ({
  po_id: po, zoho_line_item_id: line, item_name: name, description: 'Updated',
  quantity: 5, unit_price: 10, total: 50, hsn: null, tax_percentage: null, tax_name: null,
});

function fixture(items: any[], history: Record<string, number | null> = {}, historyError = false, lookupError = false) {
  const writes: string[] = [];
  let serial = 0;
  const client = { from(table: string) {
    let action = 'select';
    let payload: any;
    let head = false;
    let single = false;
    const filters: Array<(r: any) => boolean> = [];
    const query: any = {
      select(_fields: string, options?: any) { head = options?.head; return query; },
      eq(key: string, value: any) { filters.push(r => r[key] === value); return query; },
      is(key: string, value: any) { filters.push(r => r[key] === value); return query; },
      in(key: string, values: any[]) { filters.push(r => values.includes(r[key])); return query; },
      maybeSingle() { single = true; return query; },
      upsert(rows: any[], options: any) { expect(options.onConflict).toBe('id'); action = 'upsert'; payload = rows; return query; },
      update(values: any) { action = 'update'; payload = values; return query; },
      insert(values: any) { action = 'insert'; payload = values; return query; },
      delete() { action = 'delete'; return query; },
      then(resolve: any) {
        if (table === 'po_production_updates') {
          expect(head).toBe(true);
          const id = Object.keys(history).find(item_id => filters.every(f => f({ item_id })));
          return Promise.resolve({ count: id ? history[id] : 0, error: historyError ? new Error('history unavailable') : null }).then(resolve);
        }
        const matched = items.filter(r => filters.every(f => f(r)));
        if (action === 'select') return Promise.resolve({ data: single ? matched[0] ?? null : matched, error: lookupError ? new Error('lookup failed') : null }).then(resolve);
        writes.push(action);
        if (action === 'upsert' || action === 'insert') {
          for (const value of Array.isArray(payload) ? payload : [payload]) {
            const existing = items.find(r => r.id === value.id);
            if (existing) Object.assign(existing, value);
            else items.push({ id: `new-${++serial}`, ...value });
          }
        } else if (action === 'update') matched.forEach(r => Object.assign(r, payload));
        else matched.forEach(r => items.splice(items.indexOf(r), 1));
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return query;
  }};
  return { client, writes };
}

test('repeated Zoho sync preserves UUID, custom stages and delivery confirmation while updating commercial data', async () => {
  const items = [{ ...row('po-1', 'line-1'), id: 'original', quantity: 1, production_stages: ['custom'], completed_stages: ['custom'], current_stage: 'custom', confirmed_delivery_date: '2026-10-20' }];
  const { client } = fixture(items);
  await execute(client, [row('po-1', 'line-1')]);
  await execute(client, [row('po-1', 'line-1')]);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: 'original', quantity: 5, production_stages: ['custom'], completed_stages: ['custom'], current_stage: 'custom', confirmed_delivery_date: '2026-10-20' });
});

test('new identified lines insert once, and missing line IDs match by PO plus name including null', async () => {
  const items: any[] = [{ ...row('po-1', null, null), id: 'unnamed', current_stage: 'custom' }];
  const { client } = fixture(items);
  const rows = [row('po-1', 'line-1'), row('po-1', null, null), row('po-2', null, 'New')];
  await execute(client, rows);
  await execute(client, rows);
  expect(items).toHaveLength(3);
  expect(items.find(r => r.id === 'unnamed')).toMatchObject({ quantity: 5, current_stage: 'custom' });
  expect(items.filter(r => r.po_id === 'po-2')).toHaveLength(1);
});

test('stale deletion is PO scoped and retains lines with production history or unknown counts', async () => {
  const items = [
    { ...row('po-1', 'old-1'), id: 'tracked' },
    { ...row('po-1', 'old-2'), id: 'untracked' },
    { ...row('po-1', 'old-3'), id: 'unknown' },
    { ...row('po-2', 'old-2'), id: 'other-po' },
  ];
  const { client } = fixture(items, { tracked: 3, untracked: 0, unknown: null });
  await execute(client, [row('po-1', 'current')]);
  expect(items.map(r => r.id)).toContain('tracked');
  expect(items.map(r => r.id)).toContain('unknown');
  expect(items.map(r => r.id)).toContain('other-po');
  expect(items.map(r => r.id)).not.toContain('untracked');
});

test('empty responses never delete existing items', async () => {
  const items = [{ ...row('po-1', 'line-1'), id: 'original' }];
  const { client, writes } = fixture(items);
  await execute(client, []);
  expect(writes).toEqual([]);
  expect(items[0].id).toBe('original');
});

test('history query failure never permits deletion', async () => {
  const items = [{ ...row('po-1', 'old'), id: 'original' }];
  const { client, writes } = fixture(items, {}, true);
  await expect(execute(client, [row('po-1', 'new')])).rejects.toThrow('history unavailable');
  expect(writes).not.toContain('delete');
});

test('failed item lookups never cause speculative inserts', async () => {
  const { client, writes } = fixture([], {}, false, true);
  await expect(execute(client, [row('po-1', null)])).rejects.toThrow('lookup failed');
  expect(writes).toEqual([]);
});