import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ticketLabel } from '@/lib/ticketRules';

const PRIORITY: Record<string, string> = {
  low: 'border-slate-200 bg-slate-100 text-slate-600',
  medium: 'border-blue-200 bg-blue-50 text-blue-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  urgent: 'border-red-300 bg-red-50 text-red-700 anim-pulse-glow',
};
const STATUS: Record<string, string> = {
  open: 'border-red-200 bg-red-50 text-red-700',
  reopened: 'border-red-200 bg-red-50 text-red-700',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  awaiting_supplier: 'border-amber-200 bg-amber-50 text-amber-800',
  awaiting_client: 'border-purple-200 bg-purple-50 text-purple-700',
  awaiting_internal: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  closed: 'border-slate-200 bg-slate-100 text-slate-600',
};

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  return <Badge variant="outline" className={cn('whitespace-nowrap rounded-full text-[11px] font-semibold', PRIORITY[priority], className)}>{ticketLabel(priority)}</Badge>;
}
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge variant="outline" className={cn('whitespace-nowrap rounded-full text-[11px] font-semibold', STATUS[status], className)}>{ticketLabel(status)}</Badge>;
}
export function TypeBadge({ type }: { type: string }) {
  return <Badge variant="secondary" className="whitespace-nowrap rounded-full text-[11px]">{ticketLabel(type)}</Badge>;
}
export function priorityPillClass(p: string, active: boolean) { return cn('rounded-full border px-3 py-1 text-xs font-medium transition', active ? PRIORITY[p] + ' ring-2 ring-primary/30' : 'bg-card text-muted-foreground hover:bg-muted'); }
export function statusPillClass(s: string, active: boolean) { return cn('rounded-full border px-3 py-1 text-xs font-medium transition', active ? STATUS[s] + ' ring-2 ring-primary/30' : 'bg-card text-muted-foreground hover:bg-muted'); }
