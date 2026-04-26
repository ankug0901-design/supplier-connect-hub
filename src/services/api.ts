import { supabase } from '@/integrations/supabase/client';

const N8N_BASE = 'https://n8n.srv1141999.hstgr.cloud/webhook';
const ACCESS_CODE = 'Embmkt@2026';

async function zohoProxy(operation: string, vendorId: string) {
  const res = await fetch(`${N8N_BASE}/zoho-supplier-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_code: ACCESS_CODE, operation, vendor_id: vendorId }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchPurchaseOrders(zohoVendorId: string) {
  const data = await zohoProxy('get_pos', zohoVendorId);
  return data.purchaseOrders || [];
}

export async function downloadPurchaseOrder(zohoVendorId: string, poId: string, poNumber?: string) {
  const res = await fetch(`${N8N_BASE}/zoho-supplier-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_code: ACCESS_CODE,
      operation: 'download_po',
      vendor_id: zohoVendorId,
      po_id: poId,
      po_number: poNumber,
    }),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const data = await res.json();
  if (!data.success || !data.pdf_base64) {
    throw new Error(data.error || 'Could not fetch PDF');
  }

  const byteCharacters = Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0));

  const blob = new Blob([byteCharacters], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  a.download = data.filename || `PO_${poNumber || poId}.pdf`;

  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export async function fetchInvoices(zohoVendorId: string) {
  const data = await zohoProxy('get_bills', zohoVendorId);
  return data.invoices || [];
}

export interface BillAttachment {
  url: string;
  filename: string;
  mimeType: string;
}

export async function downloadBillAttachment(
  zohoVendorId: string,
  billId: string,
  billNumber?: string
): Promise<BillAttachment> {
  const res = await fetch(`${N8N_BASE}/zoho-supplier-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_code: ACCESS_CODE,
      operation: 'download_bill_attachment',
      vendor_id: zohoVendorId,
      bill_id: billId,
      bill_number: billNumber,
    }),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const data = await res.json();
  if (!data.success || !data.file_base64) {
    throw new Error(data.error || 'Could not fetch attachment');
  }
  const byteCharacters = Uint8Array.from(atob(data.file_base64), c => c.charCodeAt(0));
  const mimeType = data.mimeType || 'application/pdf';
  const blob = new Blob([byteCharacters], { type: mimeType });
  const url = URL.createObjectURL(blob);
  return {
    url,
    filename: data.filename || `${billNumber || billId}.pdf`,
    mimeType,
  };
}

export async function fetchPayments(zohoVendorId: string) {
  const data = await zohoProxy('get_payments', zohoVendorId);
  return data.payments || [];
}

export async function submitInvoice(payload: {
  po_number: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string;
  contact_email: string;
  line_items: Array<{ item_name: string; quantity: number; rate: number }>;
  pdf_file?: File;
  notes?: string;
}) {
  let pdf_base64 = '';
  if (payload.pdf_file) {
    pdf_base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(payload.pdf_file!);
    });
  }
  const res = await fetch(`${N8N_BASE}/supplier-bill-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_code: ACCESS_CODE,
      po_number: payload.po_number,
      bill_number: payload.invoice_number,
      bill_date: payload.invoice_date,
      supplier_name: payload.supplier_name,
      contact_email: payload.contact_email,
      line_items: JSON.stringify(payload.line_items),
      pdf_base64,
      notes: payload.notes || '',
    }),
  });
  const text = await res.text();
  if (!res.ok || text.startsWith('❌')) throw new Error(text);
  return text;
}

export async function generateChallans(excelFile: File) {
  const formData = new FormData();
  formData.append('file', excelFile);
  const res = await fetch(`${N8N_BASE}/generate-challans`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Challan generation failed');
  return res.json();
}

export async function saveChallansToSupabase(
  challans: Array<{ dc_number: string; deliver_to: string; total: string }>,
  supplierId: string,
  poId: string,
  logisticsScope: 'client' | 'supplier'
) {
  const rows = challans.map((c) => ({
    supplier_id: supplierId,
    po_id: poId,
    challan_number: c.dc_number,
    dc_number: c.dc_number,
    date: new Date().toISOString().split('T')[0],
    delivery_address: c.deliver_to || '',
    logistics_scope: logisticsScope,
    manifest_status: 'pending',
  }));
  const { error } = await supabase.from('delivery_challans').insert(rows);
  if (error) throw error;
}

export async function manifestShipment(payload: {
  challan_number: string;
  consignee_name: string;
  consignee_address: string;
  consignee_city: string;
  consignee_state: string;
  consignee_phone: string;
  destination_pin: string;
  weight_g: number;
  num_pieces: number;
  invoice_value: number;
}) {
  const res = await fetch(`${N8N_BASE}/delhivery-b2b-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation_mode: 'single_order',
      check_manifestation: true,
      check_labels: true,
      check_pickup: true,
      origin_pin: '122001',
      destination_pin: payload.destination_pin,
      consignee_name: payload.consignee_name,
      consignee_address: payload.consignee_address,
      consignee_city: payload.consignee_city,
      consignee_state: payload.consignee_state,
      consignee_phone: payload.consignee_phone,
      weight_g: payload.weight_g,
      num_pieces: payload.num_pieces,
      invoice_num: payload.challan_number,
      order_id: payload.challan_number,
      description: 'Marketing Materials',
      payment_mode: 'prepaid',
      invoice_value: payload.invoice_value,
      need_pickup: 'Y',
    }),
  });
  const data = await res.json();
  if (!data.success && !data.lrn) throw new Error(data.error || 'Manifest failed');
  return data;
}

export async function fetchChallans(supplierId: string) {
  const { data, error } = await supabase
    .from('delivery_challans')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAWBs(supplierId: string) {
  const { data, error } = await supabase
    .from('awb')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveAWBToSupabase(payload: {
  supplier_id: string;
  po_id: string;
  awb_number: string;
  lr_number: string;
  label_url?: string;
  challan_number: string;
}) {
  const { error } = await supabase.from('awb').insert({
    supplier_id: payload.supplier_id,
    po_id: payload.po_id,
    awb_number: payload.awb_number,
    lr_number: payload.lr_number,
    label_url: payload.label_url || null,
    carrier: 'Delhivery',
    status: 'dispatched',
    is_downloadable: !!payload.label_url,
  });
  if (error) throw error;
  await supabase
    .from('delivery_challans')
    .update({ manifest_status: 'manifested' })
    .eq('challan_number', payload.challan_number);
}
