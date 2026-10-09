import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const EMAIL_PAGE_SIZE = 25;
export const EMAIL_STATUSES = ['sent', 'delivered', 'bounced', 'failed', 'dlq', 'pending', 'suppressed', 'complained'] as const;
export type EmailFilters = { recipient: string; template: string; status: string; from: string; to: string };
export const EMPTY_EMAIL_FILTERS: EmailFilters = { recipient: '', template: '', status: 'all', from: '', to: '' };

const literalPattern = (value: string) => `%${value.trim().replace(/[\\%_]/g, '\\$&')}%`;

export function emailOutcomesQuery(client: Pick<SupabaseClient<Database>, 'from'>, filters: EmailFilters, options: { page?: number; countOnly?: boolean; statuses?: string[] } = {}) {
  let query = client.from('email_send_log').select('id, message_id, template_name, recipient_email, status, error_message, created_at', { count: 'exact', head: options.countOnly ?? false });
  if (filters.recipient.trim()) query = query.ilike('recipient_email', literalPattern(filters.recipient));
  if (filters.template.trim()) query = query.ilike('template_name', literalPattern(filters.template));
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00.000Z`);
  if (filters.to) {
    const nextDay = new Date(`${filters.to}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query = query.lt('created_at', nextDay.toISOString());
  }
  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (options.statuses) query = query.in('status', options.statuses);
  if (!options.countOnly) {
    const start = (options.page ?? 0) * EMAIL_PAGE_SIZE;
    query = query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + EMAIL_PAGE_SIZE - 1);
  }
  return query;
}

export const emailStatusLabel = (status: string) => ({ sent: 'Sent (accepted)', dlq: 'Failed (legacy)', complained: 'Complaint' }[status] ?? status.charAt(0).toUpperCase() + status.slice(1));

export function emailTimestamp(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' });
}