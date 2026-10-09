import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/admin/AdminPoTrackerUpdate.tsx', import.meta.url), 'utf8');

async function runQuery(component: 'ItemUpdateHistory' | 'POCard', props: Record<string, unknown>) {
  const start = source.indexOf(`function ${component}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  const componentSource = source.slice(start, end < 0 ? source.indexOf('\nexport default', start) : end);
  const calls: unknown[][] = [];
  const states: unknown[] = [];
  const query: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'or', 'order']) {
    query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
  }
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], count: 3, error: null }));
  const querySource = componentSource.slice(0, componentSource.indexOf('\n  return (')) + '\n}';
  const output = ts.transpileModule(querySource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const render = new Function('useState', 'useEffect', 'supabase', 'useToast', `${output}; return ${component};`);
  const componentFn = render(
    (initial: unknown) => [initial, (value: unknown) => states.push(value)],
    (effect: () => unknown) => { effect(); },
    { from: query.from }, () => ({ toast: () => {} }),
  );
  componentFn(props);
  // Execute the actual query effects without rendering or asserting markup.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { calls, states };
}

test('item history includes only its PO and matching or unassigned items, newest first', async () => {
  const { calls } = await runQuery('ItemUpdateHistory', { po_id: 'po-123', item_id: 'item-456' });
  expect(calls).toEqual([
    ['from', 'po_production_updates'],
    ['select', 'id, stage, status, note, media_urls, updated_by, created_at'],
    ['eq', 'po_id', 'po-123'],
    ['or', 'item_id.eq.item-456,item_id.is.null'],
    ['order', 'created_at', { ascending: false }],
  ]);
});

test('PO activity count is exact and includes every update belonging to that PO', async () => {
  const { calls, states } = await runQuery('POCard', { po: { id: 'po-123', items: [], supplier: null, client_order: null }, expanded: false });
  expect(calls).toEqual([
    ['from', 'po_production_updates'],
    ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'po_id', 'po-123'],
  ]);
  expect(states).toContain(3);
});