import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import TicketThread from '../../components/TicketThread.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export default function AdminTicket() {
  const { id } = useParams();
  const { data, error, reload, setData } = useAsync((signal) => adminApi.ticket(id, { signal }), [id]);
  const [state, setState] = useState({ busy: false, error: null });
  useDocumentTitle('Admin · Ticket');
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Ticket not found' : undefined} />;
  if (!data) return <Spinner />;
  const t = data.ticket;

  async function act(fn) {
    setState({ busy: true, error: null });
    try {
      const res = await fn();
      setData({ ticket: { ...res.ticket, supplierName: t.supplierName } });
      setState({ busy: false, error: null });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  return (
    <div className="narrow-console">
      <Link to="/admin/tickets" className="btn-text back-link">
        ← All tickets
      </Link>
      <h1 className="console-h1">Ticket {t.bookingReference}</h1>
      <p className="muted small">
        {t.subject} · supplier: {t.supplierName || '—'} · <Link to={`/admin/bookings/${t.bookingReference}`}>view booking</Link>
      </p>
      <TicketThread
        ticket={t}
        me="admin"
        onReply={async (m) => act(() => adminApi.replyTicket(id, m))}
        actions={
          t.canReply && (
            <div className="row ticket-actions">
              {t.type === 'booking_problem' && t.status !== 'escalated' && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={state.busy} onClick={() => act(() => adminApi.escalateTicket(id))}>
                  Escalate to {t.supplierName || 'the supplier'}
                </button>
              )}
              <button type="button" className="btn-text small" disabled={state.busy} onClick={() => act(() => adminApi.closeTicket(id))}>
                Close without reply
              </button>
              {state.error && <p className="field-error small">{state.error}</p>}
            </div>
          )
        }
      />
    </div>
  );
}
