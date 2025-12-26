export interface PurchaseOrder {
  id: string;
  poNumber: string;
  date: string;
  amount: number;
  status: 'pending' | 'invoiced' | 'partial' | 'completed';
  items: POItem[];
  deliveryAddress: string;
  expectedDelivery: string;
}

export interface POItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  poId: string;
  poNumber: string;
  date: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  attachments: string[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  status: 'pending' | 'processing' | 'completed';
  transactionId?: string;
}

export interface DeliveryChallan {
  id: string;
  challanNumber: string;
  poNumber: string;
  date: string;
  items: ChallanItem[];
  vehicleNumber?: string;
  driverName?: string;
  deliveryAddress: string;
}

export interface ChallanItem {
  description: string;
  quantity: number;
  unit: string;
}

export interface AWB {
  id: string;
  awbNumber: string;
  poNumber: string;
  carrier: string;
  status: 'generated' | 'dispatched' | 'in-transit' | 'delivered';
  isDownloadable: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  gstNumber: string;
  address: string;
}
