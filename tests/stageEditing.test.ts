import { describe, expect, test } from 'bun:test';
import { moveStage, stageSlug } from '../src/lib/stageEditing';

describe('custom production stages', () => {
  test('stores Powder Coating as powder_coating', () => {
    expect(stageSlug('Powder Coating')).toBe('powder_coating');
  });
  test('removes special characters from lowercase snake_case slugs', () => {
    expect(stageSlug('  Print!   Finish?  ')).toBe('print_finish');
  });
  test('moves a stage up without modifying the original list', () => {
    const stages = ['printing', 'packing', 'qc_check'];
    expect(moveStage(stages, 2, -1)).toEqual(['printing', 'qc_check', 'packing']);
    expect(stages).toEqual(['printing', 'packing', 'qc_check']);
  });
  test('moves a stage down and leaves boundary moves unchanged', () => {
    expect(moveStage(['printing', 'packing'], 0, 1)).toEqual(['packing', 'printing']);
    expect(moveStage(['printing', 'packing'], 1, 1)).toEqual(['printing', 'packing']);
    expect(moveStage(['printing', 'packing'], 0, -1)).toEqual(['printing', 'packing']);
  });
});