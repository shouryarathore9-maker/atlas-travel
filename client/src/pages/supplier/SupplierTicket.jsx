import { Link, useParams } from 'react-router-dom';
import TicketThread from '../../components/TicketThread.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export default function SupplierTicket() {
  const { id } = useParams();
  const { data, error, reload, setData } = useAsync((signal) => supplierApi.ticket(id, { signal }), [id]);
  useDocumentTitle('Ticket');
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Ticket not found' : undefined} />;
  if (!data) return <Spinner />;
  return (
    <div className="narrow-console">
      <Link to="/supplier/requests" className="btn-text back-link">
        ← Requests &amp; tickets
      </Link>
      {data.ticket.type === 'statement_query' ? (
        <>
          <h1 className="console-h1">Statement query {data.ticket.bookingReference}</h1>
          <p className="muted small">
            {data.ticket.subject}. Atlas support answers with “no change” or an adjustment on your next statement.{' '}
            {data.ticket.statementId && <Link to={`/supplier/statements/${data.ticket.statementId}`}>View the statement</Link>}
          </p>
          <TicketThread ticket={data.ticket} me="supplier" replyLabel="Reply to Atlas" onReply={async (m) => setData(await supplierApi.replyTicket(id, m))} />
        </>
      ) : (
        <>
          <h1 className="console-h1">Ticket {data.ticket.bookingReference}</h1>
          <p className="muted small">Atlas support asked you to help. Your reply goes straight to the traveller; Atlas can see it too.</p>
          <TicketThread ticket={data.ticket} me="supplier" replyLabel="Reply to the traveller" onReply={async (m) => setData(await supplierApi.replyTicket(id, m))} />
        </>
      )}
    </div>
  );
}
