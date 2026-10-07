import { syncFullPass, type SyncPage } from "./full-pass.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("full pass covers all 25 suppliers sequentially, not only the first four", async () => {
  const offsets: number[] = [];
  let active = 0;
  const result = await syncFullPass(async (offset, batchSize) => {
    active++;
    assert(active === 1, "Batches must not overlap");
    assert(batchSize === 4, "Keep the existing four-supplier batch limit");
    offsets.push(offset);
    await Promise.resolve();
    const suppliers = Math.min(batchSize, 25 - offset);
    active--;
    return {
      success: true, suppliers, pos_upserted: suppliers * 2,
      invoices_upserted: suppliers * 3, payments_upserted: suppliers,
      errors: [], has_more: offset + suppliers < 25,
      next_offset: offset + suppliers < 25 ? offset + suppliers : null,
    };
  });
  assert(JSON.stringify(offsets) === "[0,4,8,12,16,20,24]", "Every supplier page must run");
  assert(result.suppliers === 25 && result.pos_upserted === 50 && result.invoices_upserted === 75, "Aggregate all pages");
  assert(result.batches === 7 && !result.has_more, "Return only after the final page");
});

Deno.test("full pass handles empty and exact-size final pages", async () => {
  let calls = 0;
  const result = await syncFullPass(async (offset): Promise<SyncPage> => {
    calls++;
    return {
      success: true, suppliers: offset === 0 ? 4 : 0,
      pos_upserted: 0, invoices_upserted: 0, payments_upserted: 0,
      errors: [], has_more: offset === 0, next_offset: offset === 0 ? 4 : null,
    };
  });
  assert(calls === 2 && result.suppliers === 4, "Stop on the empty final page");
});

Deno.test("full pass rejects non-advancing pagination instead of looping forever", async () => {
  let rejected = false;
  try {
    await syncFullPass(async () => ({
      success: true, suppliers: 4, pos_upserted: 0, invoices_upserted: 0,
      payments_upserted: 0, errors: [], has_more: true, next_offset: 0,
    }));
  } catch {
    rejected = true;
  }
  assert(rejected, "Invalid pagination must fail");
});