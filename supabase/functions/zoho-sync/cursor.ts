export function nextCursorOffset(offset: number, processed: number, batchSize: number): number {
  return processed === batchSize ? offset + processed : 0;
}