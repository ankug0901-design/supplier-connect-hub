import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { assetCodePrefix, nextAssetCode, versionFields } from './assetRules';
export type Asset = Database['public']['Tables']['assets']['Row'];
export type AssetComment = Database['public']['Tables']['asset_comments']['Row'];
export type AssetAudit = Database['public']['Tables']['asset_audit_log']['Row'];
export type AssetInput = Pick<Asset, 'name' | 'description' | 'asset_type' | 'category' | 'sub_category' | 'client_name' | 'tags' | 'linked_po_id' | 'linked_rfq_id' | 'status'>;
export type Actor = { id: string; name: string };
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : (error as { message?: string })?.message || 'Something went wrong. Please try again.'; }
export const assetLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const assetDate = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const assetSize = (size: number | null) => size == null ? '—' : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
export function assetPath(url: string) {
  const marker = '/dam-assets/';
  const start = url.indexOf(marker);
  return start < 0 ? null : decodeURIComponent(url.slice(start + marker.length).split('?')[0]);
}
export async function assetFileUrl(asset: Asset) {
  const path = assetPath(asset.file_url);
  if (!path) { if (!/^https?:\/\//.test(asset.file_url)) throw new Error('Invalid file URL'); return asset.file_url; }
  const { data, error } = await supabase.storage.from('dam-assets').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function downloadAsset(asset: Asset) {
  const url = await assetFileUrl(asset);
  const response = await fetch(url);
  if (!response.ok) throw new Error('The download could not be retrieved.');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = objectUrl; a.download = asset.file_name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}
export async function writeAssetAudit(assetId: string, action: string, actor: Actor, changes: { field_changed?: string; old_value?: string | null; new_value?: string | null; notes?: string } = {}) {
  const { error } = await supabase.from('asset_audit_log').insert({ asset_id: assetId, action, performed_by: actor.id, performed_by_name: actor.name, ...changes });
  if (error) throw new Error(`Saved, but the activity log failed: ${error.message}`);
}
// Page in batches so daily suffixes and version trees never depend on the API row cap.
export async function allAssets() {
  const rows: Asset[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false }).order('id').range(from, from + 499);
    if (error) throw error;
    rows.push(...data); if (data.length < 500) return rows;
  }
}
export async function createAsset(file: File, input: AssetInput, actor: Actor, previous?: Asset) {
  const fields = previous ? versionFields(previous) : { version: 1, is_latest: true, parent_asset_id: null };
  const path = `${actor.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: uploadError } = await supabase.storage.from('dam-assets').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (uploadError) throw uploadError;
  const { data: publicData } = supabase.storage.from('dam-assets').getPublicUrl(path);
  let created: Asset | null = null;
  try {
    const date = new Date();
    const codes: string[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from('assets').select('asset_code').like('asset_code', `${assetCodePrefix(date)}%`).order('asset_code').range(from, from + 499);
      if (error) throw error;
      codes.push(...data.map(a => a.asset_code)); if (data.length < 500) break;
    }
    const { data, error } = await supabase.from('assets').insert({ ...input, ...fields, asset_code: nextAssetCode(codes, date), file_url: publicData.publicUrl, file_name: file.name, mime_type: file.type || 'application/octet-stream', file_size_bytes: file.size, uploaded_by: actor.id, uploaded_by_name: actor.name }).select().single();
    if (error) throw error;
    created = data;
  } catch (error) {
    const { error: cleanupError } = await supabase.storage.from('dam-assets').remove([path]);
    throw new Error(`${errorMessage(error)}${cleanupError ? ' The uploaded file could not be removed; contact an administrator to clean up the unused file.' : ''}`);
  }
  if (previous) {
    const { data, error } = await supabase.from('assets').update({ is_latest: false }).eq('id', previous.id).eq('is_latest', true).select('id');
    if (error || !data?.length) {
      const { error: rollbackError } = await supabase.from('assets').delete().eq('id', created.id);
      if (!rollbackError) await supabase.storage.from('dam-assets').remove([path]);
      throw new Error(rollbackError ? 'New version saved, but retiring the previous version failed. Refresh and reconcile the version history before retrying.' : 'The previous version changed or could not be retired. Refresh before retrying.');
    }
  }
  await writeAssetAudit(created.id, previous ? 'version_uploaded' : 'created', actor, { notes: previous ? `New version of ${previous.asset_code} (v${previous.version})` : file.name });
  return created;
}