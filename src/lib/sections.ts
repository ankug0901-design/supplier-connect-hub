// Centralized supplier section catalog used for navigation + admin access control
export type SupplierSectionKey =
  | 'dashboard'
  | 'rfq-requests'
  | 'purchase-orders'
  | 'invoices'
  | 'payments'
  | 'delivery-challan'
  | 'shipments';

export interface SupplierSectionDef {
  key: SupplierSectionKey;
  name: string;
  href: string;
}

export const SUPPLIER_SECTIONS: SupplierSectionDef[] = [
  { key: 'dashboard', name: 'Dashboard', href: '/dashboard' },
  { key: 'rfq-requests', name: 'RFQ Requests', href: '/rfq-requests' },
  { key: 'purchase-orders', name: 'Purchase Orders', href: '/purchase-orders' },
  { key: 'invoices', name: 'Invoices', href: '/invoices' },
  { key: 'payments', name: 'Payments', href: '/payments' },
  { key: 'delivery-challan', name: 'Delivery Challan', href: '/delivery-challan' },
  { key: 'shipments', name: 'Shipments', href: '/shipments' },
];
