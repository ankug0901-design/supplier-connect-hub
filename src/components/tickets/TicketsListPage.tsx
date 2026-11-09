import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock, Eye, Hourglass, Plus, RefreshCw, Search, Ticket as TicketIcon, Timer } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FILTER_STATUSES, PRIORITY_RANK, SUPPLIER_TICKET_TYPES, TICKET_PRIORITIES, TICKET_TYPES, avgResolutionHours, formatDuration, ticketLabel, ticketMatches } from '@/lib/ticketRules';
import { Option, Ticket, errorMessage, loadSuppliers, loadTickets, ticketDate } from '@/lib/tickets';
import { PriorityBadge, StatusBadge, TypeBadge, priorityPillClass, statusPillClass } from './TicketBadges';
import { CreateTicketSheet } from './CreateTicketSheet';

type Row = Ticket & { last_activity: string };
type SortKey = 'ticket_number' | 'subject' | 'ticket_type' | 'priority' | 'status' | 'supplier_name' | 'linked' | 'assigned_to_name' | 'created_at' | 'last_activity';
const PAGE = 20;

export function TicketsListPage({ mode }: { mode: 'admin' | 'supplier' }) {
  const { isReadOnly } = useAuth();
  const navigate = useNavigate();
  const base = mode === 'admin' ? '/admin/tickets' : '/supplier/tickets';
  const [rows, setRows] = useState<Row[]>([]);
  const [poNumbers, setPoNumbers] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [type, setType] = useState('all');
  const [supplierId, setSupplierId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last_activity', dir: -1 });
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await loadTickets();
      setRows(data);
      const ids = [...new Set(data.map(t => t.linked_po_id).filter(Boolean))] as string[];
      const map: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data: pos } = await supabase.from('purchase_orders').select('id, po_number').in('id', ids.slice(i, i + 200));
        (pos || []).forEach(p => { map[p.id] = p.po_number; });
      }
      setPoNumbers(map);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); if (mode === 'admin') loadSuppliers().then(setSuppliers).catch(() => {}); }, [load, mode]);
  useEffect(() => { setPage(0); }, [search, statuses, priorities, type, supplierId, from, to]);

  const linked = (t: Row) => t.linked_po_id ? poNumbers[t.linked_po_id] || 'PO' : t.linked_rfq_id || '';
  const filtered = useMemo(() => {
    const list = rows.filter(t => ticketMatches(t, { search, statuses, priorities, type, supplierId, from, to }));
    const val = (t: Row) => sort.key === 'priority' ? PRIORITY_RANK[t.priority] ?? 0 : sort.key === 'linked' ? linked(t) : (t[sort.key] ?? '') as string;
    return list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, search, statuses, priorities, type, supplierId, from, to, sort, poNumbers]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  const weekAgo = Date.now() - 7 * 864e5;
  const count = (s: string) => rows.filter(t => t.status === s).length;
  const open = rows.filter(t => t.status === 'open' || t.status === 'reopened').length;
  const kpis = [
    { title: 'Open', value: open, icon: AlertCircle, alert: open > 10 },
    { title: 'In Progress', value: count('in_progress'), icon: Clock },
    { title: 'Awaiting Supplier', value: count('awaiting_supplier'), icon: Hourglass },
    { title: 'Resolved This Week', value: rows.filter(t => t.resolved_at && new Date(t.resolved_at).getTime() >= weekAgo).length, icon: CheckCircle2 },
    { title: 'Avg Resolution Time', value: formatDuration(avgResolutionHours(rows)), icon: Timer },
  ];
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const head = (key: SortKey, label: string) => (
    <TableHead><button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button></TableHead>
  );
  const anyFilter = search || statuses.length || priorities.length || type !== 'all' || supplierId !== 'all' || from || to;
  const clear = () => { setSearch(''); setStatuses([]); setPriorities([]); setType('all'); setSupplierId('all'); setFrom(''); setTo(''); };
  const types = mode === 'admin' ? TICKET_TYPES : SUPPLIER_TICKET_TYPES;

  return (
    <DashboardLayout title={mode === 'admin' ? 'Support Tickets' : 'My Tickets'} subtitle={mode === 'admin' ? 'Track and resolve issues across suppliers and orders' : 'Raise and follow up on your queries with Emboss'}
      actions={<Button disabled={isReadOnly} onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />Create Ticket</Button>}>
      <div className="space-y-6">
        <div className="flex items-center justify-between md:hidden"><h1 className="text-lg font-semibold">{mode === 'admin' ? 'Support Tickets' : 'My Tickets'}</h1><Button size="sm" disabled={isReadOnly} onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />New</Button></div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k, i) => (
            <div key={k.title} className={i === 0 ? (k.alert ? 'bg-gradient-to-br from-red-600 to-red-500 p-5 text-white' : 'bg-gradient-primary p-5 text-primary-foreground') : 'bg-card p-5'}>
              <div className="flex items-center justify-between gap-2"><span className={`text-xs font-medium ${i ? 'text-muted-foreground' : ''}`}>{k.title}</span><k.icon className={`h-5 w-5 ${i ? 'text-primary' : ''}`} /></div>
              <p className="mt-3 text-3xl font-semibold">{loading ? '—' : k.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search tickets" className="pl-9" placeholder="Search subject, ticket #, description, supplier…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            {mode === 'admin' && <>
              <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Filter type" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{types.map(t => <SelectItem key={t} value={t}>{ticketLabel(t)}</SelectItem>)}</SelectContent></Select>
              <Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger aria-label="Filter supplier" className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Suppliers</SelectItem>{suppliers.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
              <div className="flex items-center gap-1.5 text-sm"><Input aria-label="Created from" type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} /><span className="text-muted-foreground">to</span><Input aria-label="Created to" type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} /></div>
            </>}
            <Button variant="ghost" size="icon" aria-label="Refresh tickets" disabled={loading} onClick={load}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs font-medium text-muted-foreground">Status</span>{FILTER_STATUSES.map(s => <button key={s} type="button" aria-pressed={statuses.includes(s)} className={statusPillClass(s, statuses.includes(s))} onClick={() => toggle(statuses, setStatuses, s)}>{ticketLabel(s)}</button>)}</div>
          {mode === 'admin' && <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs font-medium text-muted-foreground">Priority</span>{TICKET_PRIORITIES.map(p => <button key={p} type="button" aria-pressed={priorities.includes(p)} className={priorityPillClass(p, priorities.includes(p))} onClick={() => toggle(priorities, setPriorities, p)}>{ticketLabel(p)}</button>)}{anyFilter && <Button variant="link" size="sm" onClick={clear}>Clear filters</Button>}</div>}
        </div>

        {error ? <div role="alert" className="border-l-4 border-destructive bg-destructive/10 p-5"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-3" onClick={load}>Retry</Button></div>
          : loading ? <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div>
          : !filtered.length ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border bg-card py-12 text-center"><TicketIcon className="h-12 w-12 text-muted-foreground" /><h2 className="text-lg font-semibold">{rows.length ? 'No matching tickets' : 'No tickets yet'}</h2>{rows.length ? <Button variant="outline" onClick={clear}>Clear Filters</Button> : <Button disabled={isReadOnly} onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />Create Ticket</Button>}</div>
          : <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto"><Table>
              <TableHeader className="bg-muted/50"><TableRow>
                {head('ticket_number', 'Ticket #')}{head('subject', 'Subject')}{head('ticket_type', 'Type')}{head('priority', 'Priority')}{head('status', 'Status')}
                {mode === 'admin' && head('supplier_name', 'Supplier')}{head('linked', 'Linked To')}{mode === 'admin' && head('assigned_to_name', 'Assigned To')}{head('created_at', 'Created')}{head('last_activity', 'Last Activity')}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{visible.map(t => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`${base}/${t.id}`)}>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{t.ticket_number}</TableCell>
                  <TableCell className="max-w-64"><span className="line-clamp-1 font-medium">{t.subject}</span></TableCell>
                  <TableCell><TypeBadge type={t.ticket_type} /></TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  {mode === 'admin' && <TableCell className="whitespace-nowrap text-sm">{t.supplier_name || '—'}</TableCell>}
                  <TableCell className="whitespace-nowrap text-sm" onClick={e => e.stopPropagation()}>
                    {t.linked_po_id ? <Link className="text-primary hover:underline" to={`/purchase-orders/${t.linked_po_id}`}>{poNumbers[t.linked_po_id] || 'View PO'}</Link>
                      : t.linked_rfq_id ? <Link className="text-primary hover:underline" to={mode === 'admin' ? '/admin/rfq' : '/rfq-requests'}>{t.linked_rfq_id}</Link> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {mode === 'admin' && <TableCell className="whitespace-nowrap text-sm">{t.assigned_to_name || <span className="text-muted-foreground">Unassigned</span>}</TableCell>}
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{ticketDate(t.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{ticketDate(t.last_activity)}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Open ${t.ticket_number}`}><Eye className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>Showing {cur * PAGE + 1}–{Math.min(filtered.length, cur * PAGE + PAGE)} of {filtered.length}</span>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button></div>
            </div>
          </div>}
      </div>
      <CreateTicketSheet open={creating} onOpenChange={setCreating} onCreated={t => navigate(`${base}/${t.id}`)} />
    </DashboardLayout>
  );
}
