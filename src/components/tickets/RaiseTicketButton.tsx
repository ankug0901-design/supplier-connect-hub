import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TicketPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { CreateTicketSheet, TicketDefaults } from './CreateTicketSheet';

export function RaiseTicketButton({ defaults, compact }: { defaults: TicketDefaults; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { isAdmin, isReadOnly } = useAuth();
  const navigate = useNavigate();
  if (isReadOnly) return null;
  return <>
    {compact
      ? <Button variant="ghost" size="icon" className="h-8 w-8" title="Raise ticket" aria-label="Raise ticket" onClick={e => { e.stopPropagation(); setOpen(true); }}><TicketPlus className="h-4 w-4" /></Button>
      : <Button variant="outline" className="gap-2" onClick={e => { e.stopPropagation(); setOpen(true); }}><TicketPlus className="h-4 w-4" />Raise Ticket</Button>}
    <CreateTicketSheet open={open} onOpenChange={setOpen} defaults={defaults} onCreated={t => navigate(`${isAdmin ? '/admin' : '/supplier'}/tickets/${t.id}`)} />
  </>;
}
