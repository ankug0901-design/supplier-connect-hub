import { Link } from 'react-router-dom';
import { Upload, Truck, Download, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const actions = [
  {
    title: 'Upload Invoice',
    description: 'Submit invoice against PO',
    icon: Upload,
    href: '/invoices/upload',
    color: 'bg-primary/10 text-primary hover:bg-primary/20',
  },
  {
    title: 'Generate Challan',
    description: 'Create delivery challans',
    icon: Truck,
    href: '/delivery-challan',
    color: 'bg-accent/10 text-accent hover:bg-accent/20',
  },
  {
    title: 'Download AWB',
    description: 'Get shipment tracking',
    icon: Download,
    href: '/awb',
    color: 'bg-success/10 text-success hover:bg-success/20',
  },
  {
    title: 'View Orders',
    description: 'Check all purchase orders',
    icon: FileText,
    href: '/purchase-orders',
    color: 'bg-info/10 text-info hover:bg-info/20',
  },
];

export function QuickActions() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h3 className="mb-4 font-semibold text-card-foreground">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action, index) => (
          <Link
            key={action.title}
            to={action.href}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all duration-200',
              action.color
            )}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="rounded-lg bg-background/50 p-2 transition-transform group-hover:scale-110">
              <action.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{action.title}</p>
              <p className="text-xs opacity-70">{action.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
