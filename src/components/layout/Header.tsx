import { useEffect, useState } from 'react';
import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

type NotifEvent = {
  id: string;
  rfq_id: string;
  type: string;
  tone: string;
  ts: string;
};

function deriveEvent(r: any): NotifEvent {
  if (r.rfq_closed_at && r.status !== 'accepted' && r.status !== 'rejected') {
    return { id: r.id, rfq_id: r.rfq_id, type: 'RFQ closed', tone: 'text-red-600', ts: r.rfq_closed_at };
  }
  if (r.status === 'accepted') {
    return { id: r.id, rfq_id: r.rfq_id, type: 'Quote accepted', tone: 'text-green-600', ts: r.decided_at || r.updated_at };
  }
  if (r.status === 'rejected') {
    return { id: r.id, rfq_id: r.rfq_id, type: 'Quote rejected', tone: 'text-muted-foreground', ts: r.decided_at || r.updated_at };
  }
  if (r.status === 'quote_submitted') {
    const isRev = (r.revision_count || 0) > 0;
    return {
      id: r.id, rfq_id: r.rfq_id,
      type: isRev ? `Quote revised by ${r.supplier_email}` : `New quote from ${r.supplier_email}`,
      tone: 'text-blue-600',
      ts: r.last_revised_at || r.quote_submitted_at || r.updated_at,
    };
  }
  return { id: r.id, rfq_id: r.rfq_id, type: 'RFQ updated', tone: 'text-muted-foreground', ts: r.updated_at };
}

function timeAgo(ts: string) {
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<NotifEvent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      const { data } = await supabase
        .from('rfq_portal_requests')
        .select('id,rfq_id,status,updated_at,quote_submitted_at,last_revised_at,rfq_closed_at,decided_at,revision_count,supplier_email')
        .order('updated_at', { ascending: false })
        .limit(10);
      setEvents((data || []).map(deriveEvent));
    };
    load();
    const ch = supabase
      .channel('header_notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfq_portal_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-64 pl-9"
          />
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {events.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                  {events.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">Recent RFQ activity</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {events.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No new notifications</p>
              ) : (
                <ul className="divide-y">
                  {events.map((e) => (
                    <li key={e.id} className="px-4 py-3 hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${e.tone}`}>{e.type}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{e.rfq_id}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.ts)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
