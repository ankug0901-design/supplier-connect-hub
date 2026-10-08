import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Exercise the actual merge calculation without mounting the upload page.
const source = readFileSync(new URL('../src/pages/InvoiceUpload.tsx', import.meta.url), 'utf8');
const start = source.indexOf('const poQty = Number(row.po_quantity || 0);');
const end = source.indexOf('};', start);
if (start < 0 || end < 0) throw new Error('Invoice OCR merge calculation not found');
const merge = new Function('row', 'ocr', source.slice(start, end + 2));

describe('invoice OCR merge', () => {
  test('preserves the PO rate even when OCR provides another rate', () => {
    expect(merge({ po_quantity: 60000, quantity: 60000, rate: 3 }, { quantity: 300, rate: 600 }).rate).toBe(3);
  });

  test('rejects case quantities when OCR rate differs by more than 20%', () => {
    const result = merge({ po_quantity: 60000, invoiced_quantity: 10000, quantity: 0, rate: 3 }, { quantity: 300, rate: 600 });
    expect(result.quantity).toBe(50000);
    expect(result.selected).toBe(true);
  });

  test('accepts OCR quantity at exactly 20% rate difference', () => {
    expect(merge({ po_quantity: 60000, quantity: 60000, rate: 100 }, { quantity: 300, rate: 120 }).quantity).toBe(300);
  });

  test('caps the existing quantity at remaining PO quantity on mismatch', () => {
    expect(merge({ po_quantity: 60000, invoiced_quantity: 10000, quantity: 60000, rate: 3 }, { quantity: 300, rate: 600 }).quantity).toBe(50000);
  });

  test('keeps OCR rate and quantity for ad-hoc rows', () => {
    const result = merge({ po_quantity: 0, quantity: 1, rate: 3 }, { quantity: 300, rate: 600 });
    expect(result.rate).toBe(600);
    expect(result.quantity).toBe(300);
  });
});