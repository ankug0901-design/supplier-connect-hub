import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/admin/AdminPoTrackerUpdate.tsx', import.meta.url), 'utf8');

// Exercise the real components and handlers without signing in or writing a live PO.
// Design controls remain identifiable leaves; conditional rendering and hook state
// are executed, rather than asserting source text or taking markup snapshots.
function dispatchHarness() {
  const start = source.indexOf('function ItemUpdateForm(');
  const end = source.indexOf('function ItemUpdateHistory(', start);
  const componentCode = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const parsed = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = parsed.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement)) return [];
    const bindings = statement.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings) ? bindings.elements.map((element) => element.name.text) : [];
  });
  const controls = Object.fromEntries(imports.map((name) => [name, name]));
  const states = new Map<string, unknown[]>();
  let activeComponent = '';
  let hookIndex = 0;
  const rpcCalls: Record<string, unknown>[] = [];
  const dependencies = {
    ...controls,
    React,
    useState: (initial: unknown) => {
      const slot = hookIndex++;
      const state = states.get(activeComponent) ?? [];
      states.set(activeComponent, state);
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], (value: unknown) => {
        state[slot] = typeof value === 'function' ? value(state[slot]) : value;
      }];
    },
    useRef: () => ({ current: null }),
    useToast: () => ({ toast: () => {} }),
    stagesFor: () => ['printing', 'packing'],
    prettyStage: (stage: string) => stage,
    StageBar: 'StageBar',
    EditStagesDialog: 'EditStagesDialog',
    CUSTOM_STAGE: '__custom__',
    MAX_FILES: 10,
    poTrackerRpc: async (payload: Record<string, unknown>) => { rpcCalls.push(payload); return { ok: true }; },
  };
  const make = new Function(...Object.keys(dependencies), `${componentCode}; return { ItemUpdateForm, AdminDispatchForm };`);
  const components = make(...Object.values(dependencies));
  const props = {
    po: { id: 'po-regression', client_order: { id: 'order-regression' } },
    item: { id: 'item-regression', item_name: 'Counter display', quantity: 12, current_stage: 'printing' },
    updatedBy: 'Test admin', onDone: async () => {},
  };
  function renderComponent(name: string, componentProps: unknown) {
    activeComponent = name;
    hookIndex = 0;
    return components[name](componentProps);
  }
  function visibleNodes(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(visibleNodes);
    if (!React.isValidElement<any>(node)) return [];
    if (node.type === components.AdminDispatchForm) {
      return visibleNodes(renderComponent('AdminDispatchForm', node.props));
    }
    return [node, ...visibleNodes(node.props.children)];
  }
  return {
    render: () => visibleNodes(renderComponent('ItemUpdateForm', props)),
    rpcCalls,
  };
}

test('single-location dispatch exposes editable dispatch fields immediately after posting the selected flow', async () => {
  const harness = dispatchHarness();
  let nodes = harness.render();
  expect(nodes.filter((node) => node.type === 'Input')).toHaveLength(0);

  // Select Dispatched, then Single Location Dispatch through the real handlers.
  nodes.find((node) => node.type === 'Select' && node.props.value === 'printing')?.props.onValueChange('dispatched');
  nodes = harness.render();
  const dispatchChoice = nodes.find((node) => node.type === 'RadioGroup');
  expect(dispatchChoice).toBeDefined();
  dispatchChoice?.props.onValueChange('single');
  nodes = harness.render();
  const postUpdate = nodes.find((node) => node.type === 'Button' && React.Children.toArray(node.props.children).includes('Post update'));
  expect(postUpdate).toBeDefined();
  expect(postUpdate?.props.disabled).toBe(false);
  await postUpdate?.props.onClick();

  expect(harness.rpcCalls).toHaveLength(1);
  expect(harness.rpcCalls[0]).toMatchObject({ action: 'update_production', po_id: 'po-regression', item_id: 'item-regression', stage: 'dispatched' });

  // No intermediate "Submit Dispatch Details" click: these are already rendered.
  nodes = harness.render();
  let fields = nodes.filter((node) => node.type === 'Input');
  expect(fields).toHaveLength(8);
  for (const field of fields) expect(field.props.disabled).not.toBe(true);
  fields[0]?.props.onChange({ target: { value: 'HR-26-AB-1234' } });
  fields[2]?.props.onChange({ target: { value: 'Example Transport' } });
  fields[3]?.props.onChange({ target: { value: 'LR-1001' } });
  fields = harness.render().filter((node) => node.type === 'Input');
  expect(fields[0]?.props.value).toBe('HR-26-AB-1234');
  expect(fields[2]?.props.value).toBe('Example Transport');
  expect(fields[3]?.props.value).toBe('LR-1001');
});