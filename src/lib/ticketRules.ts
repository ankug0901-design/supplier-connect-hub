export const TICKET_STATUSES = ['open', 'in_progress', 'awaiting_supplier', 'awaiting_client', 'awaiting_internal', 'resolved', 'closed', 'reopened'] as const;
export const FILTER_STATUSES = TICKET_STATUSES.filter(s => s !== 'reopened');
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TICKET_TYPES = ['issue', 'query', 'complaint', 'change_request', 'delivery_issue', 'quality_issue', 'artwork_revision', 'invoice_dispute', 'other'] as const;
export const SUPPLIER_TICKET_TYPES = ['query', 'complaint', 'delivery_issue', 'quality_issue', 'invoice_dispute'] as const;

export const ticketLabel = (v?: string | null) => (v || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Builds TKT-YYYYMMDD-NNNN from the highest known number for that day. */
export function nextTicketNumber(date: Date, existing: (string | null | undefined)[], bump = 0) {
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const prefix = `TKT-${day}-`;
  const max = existing.reduce((m, n) => {
    if (!n?.startsWith(prefix)) return m;
    const v = parseInt(n.slice(prefix.length), 10);
    return Number.isFinite(v) && v > m ? v : m;
  }, 0);
  return `${prefix}${String(max + 1 + bump).padStart(4, '0')}`;
}

export interface TicketFilterInput {
  search: string; statuses: string[]; priorities: string[]; type: string; supplierId: string; from?: string; to?: string;
}
export interface FilterableTicket {
  subject: string; ticket_number: string; description: string | null; supplier_name: string | null;
  status: string; priority: string; ticket_type: string; supplier_id: string | null; created_at: string;
}
export function ticketMatches(t: FilterableTicket, f: TicketFilterInput) {
  const q = f.search.trim().toLowerCase();
  if (q && ![t.subject, t.ticket_number, t.description, t.supplier_name].some(v => v?.toLowerCase().includes(q))) return false;
  if (f.statuses.length && !f.statuses.includes(t.status)) return false;
  if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
  if (f.type !== 'all' && t.ticket_type !== f.type) return false;
  if (f.supplierId !== 'all' && t.supplier_id !== f.supplierId) return false;
  const day = t.created_at.slice(0, 10);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

export const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

/** Average hours from creation to resolution, or null when nothing is resolved. */
export function avgResolutionHours(rows: { created_at: string; resolved_at: string | null }[]) {
  const d = rows.filter(r => r.resolved_at).map(r => (new Date(r.resolved_at!).getTime() - new Date(r.created_at).getTime()) / 36e5).filter(h => h >= 0);
  return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
}
export function formatDuration(hours: number | null) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
/** Fields to write when status changes: resolution stamps are set on resolve and cleared on reopen. */
export function statusPatch(status: string, actorName: string, now = new Date()) {
  if (status === 'resolved' || status === 'closed') return { status, resolved_at: now.toISOString(), resolved_by: actorName };
  return { status, resolved_at: null, resolved_by: null };
}
