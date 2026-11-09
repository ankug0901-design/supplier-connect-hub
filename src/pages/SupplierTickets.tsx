import { TicketsListPage } from '@/components/tickets/TicketsListPage';
import { TicketDetailPage } from '@/components/tickets/TicketDetailPage';

export default function SupplierTickets() { return <TicketsListPage mode="supplier" />; }
export function SupplierTicketDetail() { return <TicketDetailPage mode="supplier" />; }
