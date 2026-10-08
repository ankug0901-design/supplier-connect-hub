export function stageSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function moveStage<T>(stages: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= stages.length || target < 0 || target >= stages.length) return stages;
  const reordered = [...stages];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}