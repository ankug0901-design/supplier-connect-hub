import { supabase } from '@/integrations/supabase/client';
import { nextTicketNumber } from './ticketRules';

export interface TicketAttachment { path: string; name: string; size: number; type: string }
export interface Ticket {
  id: string; ticket_number: string; subject: string; description: string | null; ticket_type: string; priority: string; status: string;
  linked_po_id: string | null; linked_rfq_id: string | null; linked_client_order_id: string | null; linked_asset_id: string | null;
  linked_invoice_id: string | null; linked_supplier_id: string | null; created_by: string | null; created_by_name: string;
  created_by_role: string | null; assigned_to: string | null; assigned_to_name: string | null; supplier_id: string | null;
  supplier_name: string | null; resolution_notes: string | null; resolved_at: string | null; resolved_by: string | null;
  due_date: string | null; escalated: boolean | null; tags: string[] | null; attachments: TicketAttachment[] | null;
  created_at: string; updated_at: string;
}
export interface TicketComment {
  id: string; ticket_id: string; comment_text: string; commenter_id: string | null; commenter_name: string; commenter_role: string | null;
  is_internal: boolean | null; attachments: TicketAttachment[] | null; status_change_from: string | null; status_change_to: string | null; created_at: string;
}
export interface TicketAudit { id: string; action: string; field_changed: string | null; old_value: string | null; new_value: string | null; performed_by_name: string | null; created_at: string }
export interface TicketActor { id: string; name: string; role: 'admin' | 'supplier' }
export type TicketInput = Partial<Omit<Ticket, 'id' | 'ticket_number' | 'created_at' | 'updated_at'>> & { subject: string };

const db = supabase as any;
const BUCKET = 'dam-assets';

export function errorMessage(e: unknown) { return e instanceof Error ? e.message : (e as { message?: string })?.message || 'Something went wrong. Please try again.'; }
export const ticketDate = (v?: string | null) => v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export async function uploadTicketFiles(files: File[]): Promise<TicketAttachment[]> {
  const out: TicketAttachment[] = [];
  for (const f of files) {
    const clean = f.name.replace(/[^\w.\-]+/g, '_');
    const path = `tickets/${crypto.randomUUID()}/${clean}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
    if (error) throw new Error(`Upload failed for ${f.name}: ${error.message}`);
    out.push({ path, name: f.name, size: f.size, type: f.type });
  }
  return out;
}
export async function openTicketFile(a: TicketAttachment) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 3600);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener');
}

export async function writeTicketAudit(ticketId: string, action: string, actor: TicketActor, c: { field_changed?: string; old_value?: string | null; new_value?: string | null } = {}) {
  // Only admins may write audit rows; supplier actions are recorded via comments instead.
  if (actor.role !== 'admin') return;
  const { error } = await db.from('ticket_audit_log').insert({ ticket_id: ticketId, action, performed_by: actor.id, performed_by_name: actor.name, ...c });
  if (error) throw error;
}

export async function createTicket(input: TicketInput, actor: TicketActor): Promise<Ticket> {
  const now = new Date();
  const prefix = nextTicketNumber(now, []).slice(0, 13);
  const { data: recent, error: qErr } = await db.from('tickets').select('ticket_number').like('ticket_number', `${prefix}%`).order('ticket_number', { ascending: false }).limit(1);
  if (qErr) throw qErr;
  const known = (recent || []).map((r: any) => r.ticket_number);
  for (let attempt = 0; attempt < 25; attempt++) {
    const ticket_number = nextTicketNumber(now, known, attempt);
    const { data, error } = await db.from('tickets').insert({ ...input, ticket_number, created_by: actor.id, created_by_name: actor.name, created_by_role: actor.role }).select('*').single();
    if (!error) {
      try { await writeTicketAudit(data.id, 'created', actor, { new_value: ticket_number }); } catch { /* audit is best-effort after the ticket exists */ }
      return data;
    }
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not allocate a ticket number. Please try again.');
}

export async function updateTicketField(ticket: Ticket, patch: Partial<Ticket>, field: string, oldV: string | null, newV: string | null, actor: TicketActor) {
  const { data, error } = await db.from('tickets').update(patch).eq('id', ticket.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('You do not have permission to update this ticket.');
  await writeTicketAudit(ticket.id, `${field}_changed`, actor, { field_changed: field, old_value: oldV, new_value: newV });
}

export async function addComment(ticketId: string, actor: TicketActor, text: string, attachments: TicketAttachment[], internal: boolean, statusChange?: { from: string; to: string }) {
  const { error } = await db.from('ticket_comments').insert({
    ticket_id: ticketId, comment_text: text, commenter_id: actor.id, commenter_name: actor.name, commenter_role: actor.role,
    is_internal: actor.role === 'admin' ? internal : false, attachments,
    status_change_from: statusChange?.from ?? null, status_change_to: statusChange?.to ?? null,
  });
  if (error) throw error;
  if (!statusChange) await writeTicketAudit(ticketId, internal ? 'internal_note_added' : 'comment_added', actor);
  await db.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
}

export async function loadTickets(): Promise<(Ticket & { last_activity: string })[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('tickets').select('*, ticket_comments(created_at)').order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows.map(({ ticket_comments, ...t }) => ({ ...t, last_activity: [t.updated_at, ...(ticket_comments || []).map((c: any) => c.created_at)].sort().pop() }));
}

export interface Option { value: string; label: string; sub?: string; supplierId?: string | null }
export async function loadAdmins(): Promise<Option[]> {
  const { data, error } = await db.from('suppliers').select('user_id, name, email').in('role', ['admin', 'super_user']).order('name');
  if (error) throw error;
  return (data || []).map((a: any) => ({ value: a.user_id, label: a.name || a.email, sub: a.email }));
}
export async function loadSuppliers(): Promise<Option[]> {
  const { data, error } = await db.from('suppliers').select('id, company, name, role').order('company');
  if (error) throw error;
  return (data || []).filter((s: any) => !['admin', 'super_user'].includes(s.role)).map((s: any) => ({ value: s.id, label: s.company || s.name, sub: s.name }));
}
