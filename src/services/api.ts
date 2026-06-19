import { supabase } from '@/integrations/supabase/client';

const N8N_BASE = 'https://n8n.srv1141999.hstgr.cloud/webhook';
const SYNC_THROTTLE_MS = 60_000;

// Routes through the authenticated n8n-proxy edge function which injects the
// N8N access code server-side. Never put the access code in the client bundle.
async function n8nProxy(path: 'zoho-supplier-data' | 'supplier-bill-upload', payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('n8n-proxy', {
    body: { path, payload },
  });
  if (error) throw error;
  return data;
}

async function zohoProxy(operation: string, vendorId: string) {
  return n8nProxy('zoho-supplier-data', { operation, vendor_id: vendorId });
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
    .select('id, po_id, description, item_name, zoho_line_item_id, quantity, unit_price, total, confirmed_delivery_date, hsn, tax_percentage, tax_name')
    .in('po_id', poIds);
  if (error) throw error;
  return groupBy(data || [], 'po_id');
}

export async function confirmPoDeliveryDates(
  poId: string,
  items: { id: string; confirmed_delivery_date: string | null }[],
): Promise<{ confirmed: boolean; remaining: number }> {
  const { data, error } = await supabase.rpc('confirm_po_delivery_dates', {
    _po_id: poId,
    _items: items as any,
  });
  if (error) throw error;
  return data as any;
}

export async function requestPoException(poId: string, reason: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('po-exception-request', {
    body: { po_id: poId, reason },
  });
  if (error) throw new Error(error.message || 'Failed to submit exception request');
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.request_id as string;
}

export async function reviewPoException(
  requestId: string,
  decision: 'approved' | 'rejected',
  adminNotes?: string,
): Promise<{ po_id: string; status: string }> {
  const { data, error } = await supabase.rpc('review_po_exception', {
    _request_id: requestId,
    _decision: decision,
    _admin_notes: adminNotes || null,
  });
  if (error) throw error;
  return data as any;
}

export async function fetchPoExceptionRequests(filter: { status?: string; poId?: string } = {}) {
  let q = supabase
    .from('po_exception_requests')
    .select('id, po_id, supplier_id, reason, status, admin_notes, reviewed_by, reviewed_at, created_at')
    .order('created_at', { ascending: false });
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.poId) q = q.eq('po_id', filter.poId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
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

// Derive a PO's effective status based on invoices and payments so the portal
// reflects reality even when Zoho hasn't flipped the PO status yet.
// Original Zoho statuses like 'closed', 'cancelled', 'rejected' are preserved.
const PRESERVE_PO_STATUSES = new Set(['closed', 'cancelled', 'rejected', 'void']);
const derivePoStatus = (
  originalStatus: string | null | undefined,
  poAmount: number,
  invoicedAmount: number,
  paidAmount: number,
): string => {
  const raw = (originalStatus || 'pending').toLowerCase();
  if (PRESERVE_PO_STATUSES.has(raw)) return raw;
  if (poAmount > 0 && paidAmount >= poAmount - 0.5) return 'completed';
  if (paidAmount > 0) return 'partial';
  if (poAmount > 0 && invoicedAmount >= poAmount - 0.5) return 'invoiced';
  if (invoicedAmount > 0) return 'partial';
  return raw;
};

type PoAggregate = { invoiced: number; paid: number };
async function fetchPoAggregates(poIds: string[]): Promise<Record<string, PoAggregate>> {
  if (!poIds.length) return {};
  const { data: invs } = await supabase
    .from('invoices')
    .select('id, po_id, amount, balance, status')
    .in('po_id', poIds);
  const invoiceIds = (invs || []).map((i: any) => i.id);
  const { data: pays } = invoiceIds.length
    ? await supabase
        .from('payments')
        .select('invoice_id, amount, status')
        .in('invoice_id', invoiceIds)
    : { data: [] as any[] };
  const paidByInvoice: Record<string, number> = {};
  (pays || []).forEach((p: any) => {
    paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] || 0) + Number(p.amount || 0);
  });
  const agg: Record<string, PoAggregate> = {};
  (invs || []).forEach((i: any) => {
    const a = (agg[i.po_id] ||= { invoiced: 0, paid: 0 });
    a.invoiced += Number(i.amount || 0);
    const invPaid = paidByInvoice[i.id] || 0;
    const status = (i.status || '').toLowerCase();
    const treatedAsPaid = status === 'paid' || status === 'closed';
    a.paid += treatedAsPaid ? Number(i.amount || 0) : invPaid;
  });
  return agg;
}

const mapDbPurchaseOrder = (p: any, supplier?: SupplierRow, poItems: any[] = [], agg?: PoAggregate) => {
  const amount = Number(p.amount || 0);
  const invoiced = agg?.invoiced || 0;
  const paid = agg?.paid || 0;
  const mappedItems = poItems.map((it: any) => ({
    id: it.id,
    line_item_id: it.zoho_line_item_id || undefined,
    item_name: it.item_name || it.description,
    description: it.description,
    quantity: Number(it.quantity || 0),
    rate: Number(it.unit_price || 0),
    unitPrice: Number(it.unit_price || 0),
    total: Number(it.total || 0),
    confirmedDeliveryDate: it.confirmed_delivery_date || null,
  }));
  const rawStatus = (p.status || 'pending').toLowerCase();
  const blockingStatuses = new Set(['closed', 'cancelled', 'rejected', 'completed', 'void', 'invoiced']);
  // Only "open" POs with no invoices yet need delivery confirmation
  const needsDeliveryConfirmation =
    !blockingStatuses.has(rawStatus) &&
    invoiced <= 0 &&
    !p.delivery_dates_confirmed_at &&
    mappedItems.length > 0;
  const releaseAt: string | null =
    p.delivery_first_notified_at || (p.date ? new Date(p.date + 'T00:00:00Z').toISOString() : null);
  const daysSinceRelease = releaseAt
    ? Math.floor((Date.now() - new Date(releaseAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const exceptionApprovedAt = p.exception_approved_at || null;
  const exceptionRequestedAt = p.exception_requested_at || null;
  const exceptionRejectedAt = p.exception_rejected_at || null;
  const exceptionPending = !!exceptionRequestedAt && !exceptionApprovedAt && !exceptionRejectedAt;
  const needsExceptionRequest =
    needsDeliveryConfirmation && daysSinceRelease >= 3 && !exceptionApprovedAt && !exceptionPending;
  // Download / invoice upload are unlocked when dates confirmed OR exception approved
  const unlockedForActions = !!p.delivery_dates_confirmed_at || !!exceptionApprovedAt;
  return {
    id: p.zoho_id || p.id,
    dbId: p.id,
    supplier_id: p.supplier_id,
    supplierId: p.supplier_id,
    po_number: p.po_number,
    poNumber: p.po_number,
    date: p.date,
    expectedDelivery: p.expected_delivery,
    deliveryAddress: p.delivery_address,
    amount,
    status: derivePoStatus(p.status, amount, invoiced, paid),
    rawStatus,
    invoicedAmount: invoiced,
    paidAmount: paid,
    supplierName: supplier?.company,
    supplierZohoVendorId: supplier?.zoho_vendor_id,
    deliveryDatesConfirmedAt: p.delivery_dates_confirmed_at || null,
    needsDeliveryConfirmation,
    releaseAt,
    daysSinceRelease,
    exceptionRequestedAt,
    exceptionApprovedAt,
    exceptionRejectedAt,
    exceptionPending,
    needsExceptionRequest,
    unlockedForActions,
    items: mappedItems,
  };
};

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

// On-demand sync so portal reads happen after the newest Zoho/n8n data has
// been persisted locally. Calls are deduped/throttled to avoid sync storms.
const lastSyncAt: Record<string, number> = {};
const syncInFlight: Record<string, Promise<void> | undefined> = {};

async function runSync(key: string, body: Record<string, unknown>, force = false) {
  const now = Date.now();
  if (!force && lastSyncAt[key] && now - lastSyncAt[key] < SYNC_THROTTLE_MS) return;
  if (syncInFlight[key]) return syncInFlight[key];
  lastSyncAt[key] = now;
  syncInFlight[key] = supabase.functions
    .invoke('zoho-sync', { body })
    .then(({ data, error }) => {
      if (error || data?.success === false) {
        console.warn('Zoho sync failed', error || data?.error || data);
      }
    })
    .catch((err) => console.warn('Zoho sync failed', err))
    .finally(() => {
      syncInFlight[key] = undefined;
    });
  return syncInFlight[key];
}

function triggerSupplierSync(supplierId: string, force = false) {
  return runSync(`supplier:${supplierId}`, { supplier_id: supplierId }, force);
}

async function fetchPurchaseOrdersFromDbByVendor(zohoVendorId: string) {
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (!supplier?.id) return [];
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, zoho_id, po_number, date, expected_delivery, delivery_address, amount, status, supplier_id, delivery_dates_confirmed_at, delivery_first_notified_at, exception_requested_at, exception_approved_at, exception_rejected_at')
    .eq('supplier_id', supplier.id)
    .order('date', { ascending: false });
  if (error) throw error;
  const poIds = (data || []).map((p: any) => p.id);
  const [itemsByPo, aggByPo] = await Promise.all([
    fetchPoItemsByPoIds(poIds),
    fetchPoAggregates(poIds),
  ]);
  return (data || []).map((p: any) =>
    mapDbPurchaseOrder(p, supplier, itemsByPo[p.id] || [], aggByPo[p.id]),
  );
}

export async function fetchPurchaseOrders(zohoVendorId: string) {
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (supplier?.id) void triggerSupplierSync(supplier.id, false);
  const rows = await fetchPurchaseOrdersFromDbByVendor(zohoVendorId);
  if (rows.length) return rows;
  try {
    const data = await zohoProxy('get_pos', zohoVendorId);
    return data.purchaseOrders || [];
  } catch (err) {
    console.warn('Zoho PO webhook fallback failed', err);
    return [];
  }
}

// Directly fetch live POs from Zoho (via n8n) for enrichment with fields we
// don't persist locally (HSN, tax breakdown, sub_total, tax_total).
export async function fetchLivePurchaseOrdersFromZoho(zohoVendorId: string) {
  try {
    const data = await zohoProxy('get_pos', zohoVendorId);
    return data?.purchaseOrders || [];
  } catch (err) {
    console.warn('Live Zoho PO fetch failed', err);
    return [];
  }
}

let lastGlobalSyncAt = 0;
function triggerGlobalSync(force = false) {
  const now = Date.now();
  if (!force && now - lastGlobalSyncAt < 120_000) return Promise.resolve();
  lastGlobalSyncAt = now;
  return runSync('global', {}, force);
}

export async function fetchPurchaseOrdersFromDb(forceSync = false) {
  if (forceSync) triggerGlobalSync(true);
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, zoho_id, po_number, date, expected_delivery, delivery_address, amount, status, supplier_id, delivery_dates_confirmed_at, delivery_first_notified_at, exception_requested_at, exception_approved_at, exception_rejected_at')
    .order('date', { ascending: false });
  if (error) throw error;
  const poIds = (data || []).map((p: any) => p.id);
  const [suppliersById, itemsByPo, aggByPo] = await Promise.all([
    fetchSuppliersByIds(unique((data || []).map((p: any) => p.supplier_id))),
    fetchPoItemsByPoIds(poIds),
    fetchPoAggregates(poIds),
  ]);
  return (data || []).map((p: any) =>
    mapDbPurchaseOrder(p, suppliersById[p.supplier_id], itemsByPo[p.id] || [], aggByPo[p.id]),
  );
}

export async function syncAndFetchPurchaseOrdersFromDb() {
  await triggerGlobalSync(true);
  return fetchPurchaseOrdersFromDb(false);
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

const PAID_STATUSES = new Set(['paid', 'closed']);
const TERMINAL_STATUSES = new Set(['paid', 'closed', 'void', 'partially_paid', 'partial']);

const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

const deriveInvoiceStatusAndDays = (rawStatus: string, dueDate?: string | null, paymentDate?: string | null) => {
  const status = (rawStatus || 'pending').toLowerCase();
  if (PAID_STATUSES.has(status)) {
    if (paymentDate) {
      const days = daysBetween(new Date(), new Date(paymentDate));
      return { status, daysInfo: days <= 0 ? 'Paid today' : `Paid ${days} day${days === 1 ? '' : 's'} ago` };
    }
    return { status, daysInfo: 'Paid' };
  }
  if (!dueDate) return { status, daysInfo: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = daysBetween(due, today);
  let daysInfo = '';
  let derived = status;
  if (diff < 0) {
    daysInfo = `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`;
    if (!TERMINAL_STATUSES.has(status)) derived = 'overdue';
  } else if (diff === 0) {
    daysInfo = 'Due today';
    if (!TERMINAL_STATUSES.has(status)) derived = 'due_soon';
  } else if (diff <= 7) {
    daysInfo = `Due in ${diff} day${diff === 1 ? '' : 's'}`;
    if (!TERMINAL_STATUSES.has(status)) derived = 'due_soon';
  } else {
    daysInfo = `Due in ${diff} days`;
  }
  return { status: derived, daysInfo };
};

const mapDbInvoice = (i: any, supplier?: SupplierRow, purchaseOrder?: any) => {
  const { status, daysInfo } = deriveInvoiceStatusAndDays(i.status, i.due_date, i.payment_date);
  return {
    id: i.zoho_id || i.id,
    invoiceNumber: i.invoice_number,
    poId: purchaseOrder?.po_number || i.po_id,
    poNumber: purchaseOrder?.po_number || '',
    date: i.date,
    dueDate: i.due_date,
    paymentDate: i.payment_date,
    amount: Number(i.amount || 0),
    balance: PAID_STATUSES.has(status) ? 0 : Number(i.balance ?? i.amount ?? 0),
    status,
    daysInfo,
    supplierName: supplier?.company,
    supplierZohoVendorId: supplier?.zoho_vendor_id,
    hasAttachment: Boolean(i.has_attachment),
    attachmentName: i.attachment_name,
  };
};

export async function fetchInvoicesFromDb() {
  await triggerGlobalSync(true);
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
  await triggerGlobalSync(true);
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

function sanitizeBase64(input: string): string {
  // Strip data-URL prefix, whitespace/newlines, and any non-base64 chars; fix padding.
  let s = String(input).trim();
  const comma = s.indexOf(',');
  if (s.startsWith('data:') && comma !== -1) s = s.slice(comma + 1);
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  s = s.replace(/[^A-Za-z0-9+/=]/g, '');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  return s;
}

export async function downloadPurchaseOrder(zohoVendorId: string, poId: string, poNumber?: string) {
  const data = await n8nProxy('zoho-supplier-data', {
    operation: 'download_po',
    vendor_id: zohoVendorId,
    po_id: poId,
    po_number: poNumber,
  });
  const rawBase64 = data?.pdf_base64 || data?.pdfBase64 || data?.file_base64 || data?.fileBase64 || data?.base64;
  if (!rawBase64) {
    throw new Error(data?.error || 'Could not fetch PDF for this purchase order.');
  }

  let bytes: Uint8Array;
  try {
    const clean = sanitizeBase64(rawBase64);
    const bin = atob(clean);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) {
    console.error('PO PDF base64 decode failed', e);
    throw new Error('The purchase order PDF returned by the server is malformed.');
  }

  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: data?.mimeType || 'application/pdf' });
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
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (supplier?.id) void triggerSupplierSync(supplier.id, false);
  const rows = await fetchInvoicesFromDbByVendor(zohoVendorId);
  if (rows.length) return rows;
  try {
    const data = await zohoProxy('get_bills', zohoVendorId);
    return data.invoices || [];
  } catch (err) {
    console.warn('Zoho bills webhook fallback failed', err);
    return [];
  }
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
  const data = await n8nProxy('zoho-supplier-data', {
    operation: 'download_bill_attachment',
    vendor_id: zohoVendorId,
    bill_id: billId,
    bill_number: billNumber,
  });
  if (!data?.success || !data?.file_base64) {
    throw new Error(data?.error || 'Could not fetch attachment');
  }
  return {
    base64: data.file_base64,
    filename: data.filename || `${billNumber || billId}.pdf`,
    mimeType: data.mimeType || 'application/pdf',
  };
}

export async function fetchPayments(zohoVendorId: string) {
  const supplier = await fetchSupplierByZohoVendorId(zohoVendorId);
  if (supplier?.id) void triggerSupplierSync(supplier.id, false);
  const rows = await fetchPaymentsFromDbByVendor(zohoVendorId);
  if (rows.length) return rows;
  try {
    const data = await zohoProxy('get_payments', zohoVendorId);
    const raw = data.payments || [];
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
  } catch (err) {
    console.warn('Zoho payments webhook fallback failed', err);
    return [];
  }
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
  line_items: Array<{ line_item_id?: string; item_name: string; quantity: number; rate: number; actual_delivery_date?: string }>;
  pdf_file?: File;
  pod_files?: Array<{ filename: string; mimeType: string; base64: string }>;
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
  const data = await n8nProxy('supplier-bill-upload', {
    po_number: payload.po_number,
    bill_number: payload.invoice_number,
    bill_date: payload.invoice_date,
    supplier_name: payload.supplier_name,
    contact_email: payload.contact_email,
    line_items: JSON.stringify(payload.line_items),
    pdf_base64,
    pod_files: Array.isArray(payload.pod_files) ? payload.pod_files : [],
    notes: payload.notes || '',
  });
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  if (text.startsWith('❌')) throw new Error(text);

  // Persist invoiced quantities locally so future invoices can enforce PO Qty limits.
  if (payload.supplier_id && payload.line_items.length) {
    const items = payload.line_items
      .filter((li) => li.item_name && Number(li.quantity) > 0)
      .map((li) => ({
        item_name: li.item_name,
        quantity: Number(li.quantity) || 0,
        rate: Number(li.rate) || 0,
        actual_delivery_date: li.actual_delivery_date || null,
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

  // Optimistically insert the invoice locally so it shows on the portal immediately,
  // without waiting for the next Zoho sync. The next sync will upsert by
  // (supplier_id, invoice_number) and backfill zoho_id, balance, due_date, etc.
  if (payload.supplier_id) {
    try {
      const { data: poRow } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('supplier_id', payload.supplier_id)
        .eq('po_number', payload.po_number)
        .maybeSingle();
      if (poRow?.id) {
        const amount = payload.line_items.reduce(
          (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.rate) || 0),
          0,
        );
        const { error: invErr } = await supabase
          .from('invoices')
          .upsert(
            {
              supplier_id: payload.supplier_id,
              po_id: poRow.id,
              invoice_number: payload.invoice_number,
              date: payload.invoice_date,
              amount,
              balance: amount,
              status: 'pending',
              has_attachment: Boolean(payload.pdf_file),
              attachment_name: payload.pdf_file?.name || null,
            },
            { onConflict: 'supplier_id,invoice_number', ignoreDuplicates: true },
          );
        if (invErr) console.warn('Failed to optimistically insert invoice', invErr);
      }
    } catch (e) {
      console.warn('Optimistic invoice insert skipped', e);
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
