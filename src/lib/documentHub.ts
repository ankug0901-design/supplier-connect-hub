import { supabase } from '@/integrations/supabase/client';

export type OrderDocument = {
  id: string; client_order_id: string; item_id: string | null; document_type: string;
  title: string; description: string | null; file_url: string; file_name: string | null;
  file_size_bytes: number | null; access_token: string; email_sent_at: string | null;
  email_recipient: string | null; uploaded_by: string | null; created_at: string; updated_at: string;
  item_name?: string | null;
};
export type DocumentResult = {
  ok: boolean; error?: string; id?: string; access_token?: string;
  document?: OrderDocument & { client_name?: string; po_id?: string; client_po_number?: string; supplier_name?: string };
  documents?: OrderDocument[];
};
export const DOCUMENT_TYPES = ['invoice', 'delivery_challan', 'quality_certificate', 'test_report', 'artwork', 'purchase_order', 'quotation', 'other'] as const;
export const documentTypeLabel = (value: string) => {
  const labels: Record<string, string> = { invoice: 'Invoice', delivery_challan: 'Delivery Challan', quality_certificate: 'Quality Certificate', test_report: 'Test Report', artwork: 'Artwork', purchase_order: 'Purchase Order', quotation: 'Quotation', other: 'Other' };
  return labels[value] || value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};
export const documentTypeIcon = (value: string) => {
  const icons: Record<string, string> = { invoice: 'Receipt', delivery_challan: 'Truck', quality_certificate: 'Award', test_report: 'ClipboardCheck', artwork: 'Palette', purchase_order: 'FileText', quotation: 'FileSpreadsheet', other: 'File' };
  return icons[value] || 'File';
};
export const documentLink = (token: string) => `https://supplierconnect.embossmarketing.in/documents?t=${encodeURIComponent(token)}`;
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export async function documentRpc(payload: Record<string, unknown>): Promise<DocumentResult> {
  const { data, error } = await (supabase as any).rpc('document_manage', { payload });
  if (error) throw new Error(error.message);
  const result: DocumentResult = Array.isArray(data) ? data[0] : data;
  if (!result || result.ok === false) throw new Error(result?.error || 'Document request failed');
  return result;
}
export const documentFileUrl = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;