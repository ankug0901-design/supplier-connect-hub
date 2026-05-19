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

type SupplierRow = { id: string; company?: string | null; zoho_vendor_id?: string | null };

const unique = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter(Boolean) as string[]));

const groupBy = <T extends Record<string, any>>(rows: T[], key: keyof T) =>
  rows.reduce<Record<string, T[]>>((acc, row) => {
    const value = row[key];
    if (value) (acc[String(value)] ||= []).push(row);
    return acc;
  }, {});

const indexById = <T extends { id: string }>(rows: T[]) =>
  rows.reduce<Record<string, T>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});

async function fetchSuppliersByIds(ids: string[]) {
  if (!ids.length) return {} as Record<string, SupplierRow>;
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, company, zoho_vendor_id')
    .in('id', ids);
  if (error) throw error;
  return indexById((data || []) as SupplierRow[]);
}

async function fetchPoItemsByPoIds(poIds: string[]) {
  if (!poIds.length) return {} as Record<string, any[]>;
  const { data, error } = await supabase
    .from('po_items')
    .select('id, po_id, description, quantity, unit_price, total')
    .in('po_id', poIds);
  if (error) throw error;
  return groupBy(data || [], 'po_id');
}

async function fetchPurchaseOrdersByIds(poIds: string[]) {
  if (!poIds.length) return {} as Record<string, any>;
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, zoho_id, po_number, supplier_id')
    .in('id', poIds);
  if (error) throw error;
  return indexById(data || []);
}

async function fetchInvoicesByIds(invoiceIds: string[]) {
  if (!invoiceIds.length) return {} as Record<string, any>;
  const { data, error } = await supabase
    .from('invoices')
    .select('id, zoho_id, invoice_number, supplier_id, po_id')
    .in('id', invoiceIds);
  if (error) throw error;
  return indexById(data || []);
}

const mapDbPurchaseOrder = (p: any, supplier?: SupplierRow, poItems: any[] = []) => ({
  id: p.zoho_id || p.id,
  poNumber: p.po_number,
  date: p.date,
  expectedDelivery: p.expected_delivery,
  deliveryAddress: p.delivery_address,
  amount: Number(p.amount || 0),
  status: p.status,
  supplierName: supplier?.company,
  items: poItems.map((it: any) => ({
    id: it.id,
    item_name: it.description,
    description: it.description,
    quantity: Number(it.quantity || 0),
    rate: Number(it.unit_price || 0),
    unitPrice: Number(it.unit_price || 0),
    total: Number(it.total || 0),
  })),
});

async function fetchSupplierByZohoVendorId(zohoVendorId: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, company, zoho_vendor_id')
    .eq('user_id', authData.user?.id || '')
    .eq('zoho_vendor_id', zohoVendorId.trim())
    .maybeSingle();
  if (error) throw error;
  return data as SupplierRow | null;
}

async function fetchPurchaseOrdersFromDbByVendor(zohoVendorId: string) {
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (!supplier?.id) return [];
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, zoho_id, po_number, date, expected_delivery, delivery_address, amount, status, supplier_id')
    .eq('supplier_id', supplier.id)
    .order('date', { ascending: false });
  if (error) throw error;
  const itemsByPo = await fetchPoItemsByPoIds((data || []).map((p: any) => p.id));
  return (data || []).map((p: any) => mapDbPurchaseOrder(p, supplier, itemsByPo[p.id] || []));
}

export async function fetchPurchaseOrders(zohoVendorId: string) {
  try {
    const data = await zohoProxy('get_pos', zohoVendorId);
    const purchaseOrders = data.purchaseOrders || [];
    if (purchaseOrders.length) return purchaseOrders;
  } catch (err) {
    console.warn('Zoho PO webhook failed; falling back to synced purchase orders.', err);
  }
  return fetchPurchaseOrdersFromDbByVendor(zohoVendorId);
}

export async function fetchPurchaseOrdersFromDb() {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, zoho_id, po_number, date, expected_delivery, delivery_address, amount, status, supplier_id')
    .order('date', { ascending: false });
  if (error) throw error;
  const [suppliersById, itemsByPo] = await Promise.all([
    fetchSuppliersByIds(unique((data || []).map((p: any) => p.supplier_id))),
    fetchPoItemsByPoIds((data || []).map((p: any) => p.id)),
  ]);
  return (data || []).map((p: any) => mapDbPurchaseOrder(p, suppliersById[p.supplier_id], itemsByPo[p.id] || []));
}

async function fetchInvoicesFromDbByVendor(zohoVendorId: string) {
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (!supplier?.id) return [];
  const { data, error } = await supabase
    .from('invoices')
    .select('id, zoho_id, invoice_number, date, due_date, payment_date, amount, balance, has_attachment, attachment_name, status, po_id, supplier_id')
    .eq('supplier_id', supplier.id)
    .order('date', { ascending: false });
  if (error) throw error;
  const purchaseOrdersById = await fetchPurchaseOrdersByIds(unique((data || []).map((i: any) => i.po_id)));
  return (data || []).map((i: any) => mapDbInvoice(i, supplier, purchaseOrdersById[i.po_id]));
}

const mapDbInvoice = (i: any, supplier?: SupplierRow, purchaseOrder?: any) => ({
  id: i.zoho_id || i.id,
  invoiceNumber: i.invoice_number,
  poId: purchaseOrder?.po_number || i.po_id,
  poNumber: purchaseOrder?.po_number || '',
  date: i.date,
  dueDate: i.due_date,
  paymentDate: i.payment_date,
  amount: Number(i.amount || 0),
  balance: i.status === 'paid' ? 0 : Number(i.balance ?? i.amount ?? 0),
  status: i.status,
  supplierName: supplier?.company,
  supplierZohoVendorId: supplier?.zoho_vendor_id,
  hasAttachment: Boolean(i.has_attachment),
  attachmentName: i.attachment_name,
});

export async function fetchInvoicesFromDb() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, zoho_id, invoice_number, date, due_date, payment_date, amount, balance, has_attachment, attachment_name, status, po_id, supplier_id')
    .order('date', { ascending: false });
  if (error) throw error;
  const [suppliersById, purchaseOrdersById] = await Promise.all([
    fetchSuppliersByIds(unique((data || []).map((i: any) => i.supplier_id))),
    fetchPurchaseOrdersByIds(unique((data || []).map((i: any) => i.po_id))),
  ]);
  return (data || []).map((i: any) => mapDbInvoice(i, suppliersById[i.supplier_id], purchaseOrdersById[i.po_id]));
}

export async function fetchPaymentsFromDb() {
  const { data, error } = await supabase
    .from('payments')
    .select('id, payment_number, payment_mode, account, transaction_id, amount, date, status, invoice_id')
    .order('date', { ascending: false });
  if (error) throw error;
  return mapDbPayments(data || []);
}

const mapDbPayment = (p: any, invoice?: any, supplier?: SupplierRow, purchaseOrder?: any) => ({
  id: p.id,
  paymentNumber: p.payment_number || p.transaction_id || p.id?.slice(0, 8),
  poNumber: purchaseOrder?.po_number || '-',
  invoiceNumber: invoice?.invoice_number || '-',
  date: p.date,
  amount: Number(p.amount || 0),
  paymentMode: p.payment_mode || '-',
  account: p.account || '-',
  status: p.status,
  transactionId: p.transaction_id,
  supplierName: supplier?.company,
});

async function mapDbPayments(payments: any[], knownInvoices?: any[]) {
  const invoicesById = knownInvoices
    ? indexById(knownInvoices)
    : await fetchInvoicesByIds(unique(payments.map((p: any) => p.invoice_id)));
  const invoices = Object.values(invoicesById);
  const [suppliersById, purchaseOrdersById] = await Promise.all([
    fetchSuppliersByIds(unique(invoices.map((i: any) => i.supplier_id))),
    fetchPurchaseOrdersByIds(unique(invoices.map((i: any) => i.po_id))),
  ]);
  return payments.map((p: any) => {
    const invoice = invoicesById[p.invoice_id];
    return mapDbPayment(p, invoice, suppliersById[invoice?.supplier_id], purchaseOrdersById[invoice?.po_id]);
  });
}

async function fetchPaymentsFromDbByVendor(zohoVendorId: string) {
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (!supplier?.id) return [];
  const { data: invoices, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, zoho_id, invoice_number, supplier_id, po_id')
    .eq('supplier_id', supplier.id);
  if (invoiceError) throw invoiceError;
  const invoiceIds = (invoices || []).map((i: any) => i.id);
  if (!invoiceIds.length) return [];
  const { data, error } = await supabase
    .from('payments')
    .select('id, payment_number, payment_mode, account, transaction_id, amount, date, status, invoice_id')
    .in('invoice_id', invoiceIds)
    .order('date', { ascending: false });
  if (error) throw error;
  return mapDbPayments(data || [], invoices || []);
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
  try {
    const data = await zohoProxy('get_bills', zohoVendorId);
    const invoices = data.invoices || [];
    if (invoices.length) return invoices;
  } catch (err) {
    console.warn('Zoho bills webhook failed; falling back to synced invoices.', err);
  }
  return fetchInvoicesFromDbByVendor(zohoVendorId);
}

export interface BillAttachment {
  base64: string;
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
  return {
    base64: data.file_base64,
    filename: data.filename || `${billNumber || billId}.pdf`,
    mimeType: data.mimeType || 'application/pdf',
  };
}

export async function fetchPayments(zohoVendorId: string) {
  let raw: any[] = [];
  try {
    const data = await zohoProxy('get_payments', zohoVendorId);
    raw = data.payments || [];
  } catch (err) {
    console.warn('Zoho payments webhook failed; falling back to synced payments.', err);
  }
  if (!raw.length) return fetchPaymentsFromDbByVendor(zohoVendorId);
  return raw.map((p: any) => ({
    id: p.payment_id || p.id,
    paymentNumber: p.payment_number || p.paymentNumber || p.reference_number || p.referenceNumber || p.payment_id || p.id,
    invoiceNumber:
      p.invoice_number ||
      p.invoiceNumber ||
      p.bill_number ||
      p.billNumber ||
      (Array.isArray(p.bills) && p.bills.length
        ? p.bills.map((b: any) => b.bill_number || b.billNumber).filter(Boolean).join(', ')
        : '-'),
    poNumber: p.po_number || p.poNumber || (Array.isArray(p.bills) && (p.bills[0]?.po_number || p.bills[0]?.poNumber)) || '-',
    date: p.date || p.payment_date || p.paymentDate,
    amount: Number(p.amount || p.payment_amount || p.paymentAmount || 0),
    paymentMode: p.payment_mode || p.paymentMode || p.mode || '-',
    account: p.account || p.paid_through_account_name || p.paidThroughAccountName || p.account_name || p.accountName || p.paid_through || p.paidThrough || '-',
    status: p.status || 'completed',
    transactionId: p.reference_number || p.referenceNumber || p.transaction_id || p.transactionId || p.payment_number || p.paymentNumber || '',
  }));
}

export async function fetchInvoicedQuantitiesForPo(
  supplierId: string,
  poNumber: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_invoiced_quantities_for_po', {
    _supplier_id: supplierId,
    _po_number: poNumber,
  });
  if (error) {
    console.warn('Failed to fetch invoiced quantities', error);
    return {};
  }
  return ((data as any[]) || []).reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.item_name || '').trim().toLowerCase();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + Number(row.total_quantity || 0);
    return acc;
  }, {});
}

export async function submitInvoice(payload: {
  po_number: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string;
  contact_email: string;
  supplier_id?: string;
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

  // Persist invoiced quantities locally so future invoices can enforce PO Qty limits.
  if (payload.supplier_id && payload.line_items.length) {
    const items = payload.line_items
      .filter((li) => li.item_name && Number(li.quantity) > 0)
      .map((li) => ({
        item_name: li.item_name,
        quantity: Number(li.quantity) || 0,
        rate: Number(li.rate) || 0,
      }));
    if (items.length) {
      const { error } = await supabase.rpc('record_invoice_line_items', {
        _supplier_id: payload.supplier_id,
        _po_number: payload.po_number,
        _invoice_number: payload.invoice_number,
        _items: items,
      });
      if (error) console.warn('Failed to record invoice line items', error);
    }
  }

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
