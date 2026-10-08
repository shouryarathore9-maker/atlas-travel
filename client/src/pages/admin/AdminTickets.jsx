import { Link, useSearchParams } from 'react-router-dom';
import { TICKET_STATUS } from '../../components/TicketThread.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDateTime } from '../../lib/format.js';

export default function AdminTickets() {
  useDocumentTitle('Admin · Tickets');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Number(params.get('page')) || 1;
  const { data, error, reload } = useAsync((signal) => adminApi.tickets({ status, page }, { signal }), [status, page]);
  return (
    <>
      <h1 className="console-h1">Tickets</h1>
      <p className="muted">Help tickets from travellers. Reply, close, or escalate to the booking’s airline or hotel.</p>
      <div className="row chip-row" role="group" aria-label="Filter by status">
        {['', 'open', 'escalated', 'answered', 'closed'].map((s) => (
          <button key={s || 'all'} type="button" className="chip-check" aria-pressed={status === s} onClick={() => setParams(s ? { status: s } : {})}>
            {s ? TICKET_STATUS[s].label : 'All'}
          </button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={4} height={52} />}
      {data && data.items.length === 0 && <EmptyState title="No tickets here">All quiet.</EmptyState>}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Updated</th>
                <th scope="col">Booking</th>
                <th scope="col">Supplier</th>
                <th scope="col">Latest message</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t._id}>
                  <td>{formatDateTime(t.updatedAt)}</td>
                  <td>
                    <Link to={`/admin/tickets/${t._id}`}>{t.bookingReference}</Link>
                  </td>
                  <td>{t.supplierName || '—'}</td>
                  <td className="small ticket-preview">{t.messages[t.messages.length - 1]?.body}</td>
                  <td>
                    <span className={`badge ${TICKET_STATUS[t.status]?.tone}`}>{TICKET_STATUS[t.status]?.label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
