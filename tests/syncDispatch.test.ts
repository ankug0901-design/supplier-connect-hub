import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/sync-dispatch/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('  try {\n    const poIds');
const end = source.lastIndexOf('\n});');
const block = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const execute = new Function('supabase', 'records', 'json', `return (async () => {${block}})();`);

type Row = { id?: string; po_id: string; lr_number: string; awb_number?: string; client_order_id?: string; delivery_status?: string };

function fixture(rows: Row[], failedOrder?: string) {
  const recalculated: string[] = [];
  const events: string[] = [];
  const client = {
    from() {
      let action = 'select';
      let payload: any;
      const filters: Array<(row: any) => boolean> = [];
      const query: any = {
        select() { return query; },
        in(key: string, values: string[]) { filters.push(row => values.includes(row[key])); return query; },
        eq(key: string, value: string) { filters.push(row => row[key] === value); return query; },
        not(key: string) { filters.push(row => row[key] != null); return query; },
        update(value: any) { action = 'update'; payload = value; return query; },
        upsert(value: Row[], options: any) {
          expect(options).toEqual({ onConflict: 'po_id,lr_number', ignoreDuplicates: false });
          action = 'upsert'; payload = value; return query;
        },
        then(resolve: any) {
          const matched = rows.filter(row => filters.every(filter => filter(row)));
          if (action === 'update') matched.forEach(row => Object.assign(row, payload));
          if (action === 'upsert') {
            events.push('upsert');
            for (const record of payload) {
              const existing = rows.find(row => row.po_id === record.po_id && row.lr_number === record.lr_number);
              if (existing) Object.assign(existing, record);
              else rows.push({ id: `new-${rows.length}`, ...record });
            }
          }
          return Promise.resolve({ data: matched, error: null }).then(resolve);
        },
      };
      return query;
    },
    async rpc(name: string, args: { p_order_id: string }) {
      expect(name).toBe('_po_recalc_status');
      expect(events).toContain('upsert');
      recalculated.push(args.p_order_id);
      return { error: args.p_order_id === failedOrder ? { message: 'recalc unavailable' } : null };
    },
  };
  return { client, recalculated };
}

test('same PO/AWB with a changed LR updates the existing shipment without duplicating or touching another PO', async () => {
  const rows: Row[] = [
    { id: 'original', po_id: 'po-1', lr_number: 'old-lr', awb_number: 'AWB-1' },
    { id: 'other', po_id: 'po-2', lr_number: 'other-lr', awb_number: 'AWB-1' },
  ];
  const { client } = fixture(rows);
  const result = await execute(client, [{ po_id: 'po-1', lr_number: 'new-lr', awb_number: 'AWB-1', delivery_status: 'delivered' }], (data: any) => data);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ id: 'original', lr_number: 'new-lr', delivery_status: 'delivered' });
  expect(rows[1].lr_number).toBe('other-lr');
  expect(result).toMatchObject({ success: true, inserted: 0, updated: 1 });
});

test('recalculates unique incoming and stored affected orders after upsert; failure preserves successful sync', async () => {
  const rows: Row[] = [
    { po_id: 'po-1', lr_number: 'lr-2', client_order_id: 'stored-order' },
    { po_id: 'other-po', lr_number: 'lr-3', client_order_id: 'unaffected-order' },
  ];
  const { client, recalculated } = fixture(rows, 'incoming-order');
  const result = await execute(client, [
    { po_id: 'po-1', lr_number: 'lr-1', client_order_id: 'incoming-order' },
    { po_id: 'po-1', lr_number: 'lr-2' },
    { po_id: 'po-1', lr_number: 'lr-4', client_order_id: 'incoming-order' },
  ], (data: any) => data);
  expect(recalculated).toEqual(['incoming-order', 'stored-order']);
  expect(result).toMatchObject({ success: true, inserted: 2, updated: 1, recalculated: 2 });
  expect(result.errors).toEqual(['recalc incoming-order: recalc unavailable']);
});