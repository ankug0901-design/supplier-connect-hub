import { Award, ClipboardCheck, File, FileSpreadsheet, FileText, Palette, Receipt, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { documentTypeIcon, documentTypeLabel } from '@/lib/documentHub';

const icons = { Award, ClipboardCheck, File, FileSpreadsheet, FileText, Palette, Receipt, Truck };
const tones: Record<string, string> = {
  invoice: 'border-info/30 bg-info/10 text-info', delivery_challan: 'border-primary/30 bg-primary/10 text-primary',
  quality_certificate: 'border-success/30 bg-success/10 text-success', test_report: 'border-warning/30 bg-warning/10 text-foreground',
  artwork: 'border-destructive/30 bg-destructive/10 text-destructive', purchase_order: 'border-info/30 bg-info/10 text-info',
  quotation: 'border-warning/30 bg-warning/10 text-foreground', other: 'border-border bg-muted text-muted-foreground',
};
export function DocumentTypeBadge({ type }: { type: string }) {
  const Icon = icons[documentTypeIcon(type) as keyof typeof icons] || File;
  return <Badge variant="outline" className={`gap-1.5 ${tones[type] || tones.other}`}><Icon className="h-3.5 w-3.5 shrink-0" />{documentTypeLabel(type)}</Badge>;
}