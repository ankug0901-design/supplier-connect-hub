export type SyncPage = {
  success: boolean;
  suppliers: number;
  pos_upserted: number;
  invoices_upserted: number;
  payments_upserted: number;
  errors: string[];
  has_more: boolean;
  next_offset: number | null;
};

// Run one bounded batch at a time so full scheduled passes don't flood Zoho.
export async function syncFullPass(
  fetchPage: (offset: number, batchSize: number) => Promise<SyncPage>,
  batchSize = 4,
) {
  const summary = {
    success: true,
    suppliers: 0,
    pos_upserted: 0,
    invoices_upserted: 0,
    payments_upserted: 0,
    errors: [] as string[],
    batches: 0,
    has_more: false,
    next_offset: null as number | null,
  };
  let offset = 0;
  while (true) {
    const page = await fetchPage(offset, batchSize);
    if (!page.success) throw new Error(`Zoho sync batch at offset ${offset} failed`);
    summary.suppliers += page.suppliers;
    summary.pos_upserted += page.pos_upserted;
    summary.invoices_upserted += page.invoices_upserted;
    summary.payments_upserted += page.payments_upserted;
    summary.errors.push(...page.errors);
    summary.batches++;
    if (!page.has_more) return summary;
    if (!Number.isInteger(page.next_offset) || page.next_offset === null || page.next_offset <= offset) {
      throw new Error(`Zoho sync batch at offset ${offset} did not advance`);
    }
    offset = page.next_offset;
  }
}