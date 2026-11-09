import { TicketsListPage } from '@/components/tickets/TicketsListPage';
import { TicketDetailPage } from '@/components/tickets/TicketDetailPage';

export default function AdminTickets() { return <TicketsListPage mode="admin" />; }
export function AdminTicketDetail() { return <TicketDetailPage mode="admin" />; }
