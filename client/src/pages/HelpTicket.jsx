import { Link, useParams } from 'react-router-dom';
import TicketThread from '../components/TicketThread.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import { meApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function HelpTicket() {
  const { id } = useParams();
  const { data, error, reload, setData } = useAsync((signal) => meApi.ticket(id, { signal }), [id]);
  useDocumentTitle('Help ticket');
  if (error) {
    return (
      <main id="main" className="container page narrow">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Ticket not found' : undefined} />
      </main>
    );
  }
  if (!data) return <Spinner />;
  return (
    <main id="main" className="container page narrow">
      <Link to="/bookings" className="btn-text back-link">
        ← My trips
      </Link>
      <h1>Help with {data.ticket.subject || data.ticket.bookingReference}</h1>
      <TicketThread
        ticket={data.ticket}
        me="traveller"
        onReply={async (message) => setData(await meApi.replyTicket(id, message))}
      />
    </main>
  );
}
