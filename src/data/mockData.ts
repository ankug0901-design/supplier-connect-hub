import { PurchaseOrder, Invoice, Payment, AWB, Supplier } from '@/types/supplier';

export const mockSupplier: Supplier = {
  id: '1',
  name: 'Rajesh Kumar',
  email: 'rajesh@supplierco.com',
  phone: '+91 98765 43210',
  company: 'Premium Supplies Pvt Ltd',
  gstNumber: '27AABCU9603R1ZM',
  address: '123 Industrial Area, Sector 5, Mumbai, Maharashtra 400001',
};

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: '1',
    poNumber: 'PO-2024-001',
    date: '2024-01-15',
    amount: 125000,
    status: 'pending',
    expectedDelivery: '2024-02-15',
    deliveryAddress: 'Emboss Marketing, Plot 45, MIDC Industrial Area, Pune 411001',
    items: [
      { id: '1', description: 'Premium Steel Sheets (2mm)', quantity: 100, unitPrice: 500, total: 50000 },
      { id: '2', description: 'Aluminum Rods (10mm)', quantity: 200, unitPrice: 250, total: 50000 },
      { id: '3', description: 'Copper Wire (1.5mm)', quantity: 50, unitPrice: 500, total: 25000 },
    ],
  },
  {
    id: '2',
    poNumber: 'PO-2024-002',
    date: '2024-01-20',
    amount: 87500,
    status: 'invoiced',
    expectedDelivery: '2024-02-20',
    deliveryAddress: 'Emboss Marketing, Plot 45, MIDC Industrial Area, Pune 411001',
    items: [
      { id: '1', description: 'Industrial Bolts M8', quantity: 500, unitPrice: 75, total: 37500 },
      { id: '2', description: 'Hex Nuts M8', quantity: 500, unitPrice: 50, total: 25000 },
      { id: '3', description: 'Washers M8', quantity: 500, unitPrice: 50, total: 25000 },
    ],
  },
  {
    id: '3',
    poNumber: 'PO-2024-003',
    date: '2024-01-25',
    amount: 215000,
    status: 'partial',
    expectedDelivery: '2024-02-25',
    deliveryAddress: 'Emboss Marketing, Warehouse 12, Bhiwandi 421302',
    items: [
      { id: '1', description: 'Stainless Steel Pipes (25mm)', quantity: 150, unitPrice: 800, total: 120000 },
      { id: '2', description: 'SS Fittings Assorted', quantity: 100, unitPrice: 450, total: 45000 },
      { id: '3', description: 'Industrial Valves', quantity: 25, unitPrice: 2000, total: 50000 },
    ],
  },
  {
    id: '4',
    poNumber: 'PO-2024-004',
    date: '2024-02-01',
    amount: 56000,
    status: 'completed',
    expectedDelivery: '2024-03-01',
    deliveryAddress: 'Emboss Marketing, Plot 45, MIDC Industrial Area, Pune 411001',
    items: [
      { id: '1', description: 'Electrical Connectors', quantity: 200, unitPrice: 80, total: 16000 },
      { id: '2', description: 'Cable Ties (Large)', quantity: 1000, unitPrice: 20, total: 20000 },
      { id: '3', description: 'Junction Boxes', quantity: 50, unitPrice: 400, total: 20000 },
    ],
  },
];

export const mockInvoices: Invoice[] = [
  {
    id: '1',
    invoiceNumber: 'INV-2024-001',
    poId: '2',
    poNumber: 'PO-2024-002',
    date: '2024-01-22',
    amount: 87500,
    status: 'approved',
    attachments: ['invoice_001.pdf', 'receipt_001.pdf'],
  },
  {
    id: '2',
    invoiceNumber: 'INV-2024-002',
    poId: '3',
    poNumber: 'PO-2024-003',
    date: '2024-01-28',
    amount: 120000,
    status: 'pending',
    attachments: ['invoice_002.pdf'],
  },
  {
    id: '3',
    invoiceNumber: 'INV-2024-003',
    poId: '4',
    poNumber: 'PO-2024-004',
    date: '2024-02-05',
    amount: 56000,
    status: 'paid',
    attachments: ['invoice_003.pdf', 'material_receipt.pdf'],
  },
];

export const mockPayments: Payment[] = [
  {
    id: '1',
    invoiceId: '3',
    invoiceNumber: 'INV-2024-003',
    amount: 56000,
    date: '2024-02-10',
    status: 'completed',
    transactionId: 'TXN2024021056000',
  },
  {
    id: '2',
    invoiceId: '1',
    invoiceNumber: 'INV-2024-001',
    amount: 87500,
    date: '2024-02-15',
    status: 'processing',
  },
];

export const mockAWBs: AWB[] = [
  {
    id: '1',
    awbNumber: 'AWB-EM-2024-0001',
    poNumber: 'PO-2024-002',
    carrier: 'BlueDart',
    status: 'delivered',
    isDownloadable: true,
    createdAt: '2024-01-23',
  },
  {
    id: '2',
    awbNumber: 'AWB-EM-2024-0002',
    poNumber: 'PO-2024-003',
    carrier: 'DTDC',
    status: 'in-transit',
    isDownloadable: true,
    createdAt: '2024-01-29',
  },
  {
    id: '3',
    awbNumber: 'AWB-EM-2024-0003',
    poNumber: 'PO-2024-004',
    carrier: 'Delhivery',
    status: 'dispatched',
    isDownloadable: false,
    createdAt: '2024-02-06',
  },
];
