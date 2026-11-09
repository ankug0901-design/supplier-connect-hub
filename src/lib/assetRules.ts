export const ASSET_TYPES = ['artwork', 'design', 'photo', 'logo', 'template', 'packaging_spec', 'technical_drawing', 'other'] as const;
export const ASSET_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'] as const;
export function assetCodePrefix(date = new Date()) { return `AST-${date.toISOString().slice(0, 10).replace(/-/g, '')}-`; }
export function nextAssetCode(codes: string[], date = new Date()) {
  const prefix = assetCodePrefix(date);
  const max = codes.reduce((n, code) => code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length)) ? Math.max(n, Number(code.slice(prefix.length))) : n, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
export function versionFields(asset: { id: string; version: number; is_latest: boolean }) {
  if (!asset.is_latest) throw new Error('Only the latest version can be revised.');
  return { parent_asset_id: asset.id, version: asset.version + 1, is_latest: true };
}
export function statusFields(status: string, actor: string, reason = '') {
  if (!ASSET_STATUSES.some(s => s === status)) throw new Error('Invalid asset status');
  if (status === 'rejected' && !reason.trim()) throw new Error('A rejection reason is required.');
  return { status, approved_by: status === 'approved' ? actor : null, approved_at: status === 'approved' ? new Date().toISOString() : null, rejection_reason: status === 'rejected' ? reason.trim() : null };
}
export function assetMatches(asset: { name: string; description: string | null; tags: string[] | null; asset_code: string; client_name: string | null }, search: string) {
  return [asset.name, asset.description, asset.asset_code, asset.client_name, ...(asset.tags || [])].join(' ').toLowerCase().includes(search.trim().toLowerCase());
}