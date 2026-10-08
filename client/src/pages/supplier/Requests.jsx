import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { TICKET_STATUS } from '../../components/TicketThread.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate, formatDateTime } from '../../lib/format.js';

function RequestCard({ booking, onReplied }) {
  const [comment, setComment] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  async function reply(status) {
    setState({ busy: true, error: null });
    try {
      await supplierApi.replyRequest(booking._id, { status, comment: comment.trim() });
      onReplied(booking, status);
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }
  const reply_ = booking.specialRequest.reply;
  return (
    <article className="card request-card">
      <p className="small muted">
        {booking.bookingReference} · {booking.title} · {formatDate(booking.travelDates.start, { weekday: 'short' })} · {booking.travellers[0]?.name}
      </p>
      <p className="request-text">“{booking.specialRequest.text}”</p>
      {reply_ ? (
        <p className="small">
          You replied {formatDateTime(reply_.at)}: <strong>{reply_.status === 'accepted' ? 'Accepted' : 'Can’t accommodate'}</strong>
          {reply_.comment && ` — ${reply_.comment}`}
        </p>
      ) : (
        <>
          <Field label="Comment (optional, shown to the traveller)" value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} />
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" disabled={state.busy} onClick={() => reply('accepted')}>
              Accept
            </button>
            <button type="button" className="btn-text small" disabled={state.busy} onClick={() => reply('cannot')}>
              Can’t accommodate
            </button>
          </div>
          {state.error && <p className="field-error small">{state.error}</p>}
        </>
      )}
    </article>
  );
}

// Special requests to answer, and tickets Atlas support escalated to this supplier (prd.md → Workflows 4–5).
export default function Requests() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Requests & tickets`);
  const [status, setStatus] = useState('open');
  const requests = useAsync((signal) => supplierApi.specialRequests({ status }, { signal }), [status]);
  const tickets = useAsync((signal) => supplierApi.tickets({ signal }), []);
  const [notice, setNotice] = useState(null);

  return (
    <>
      <h1 className="console-h1">Requests &amp; tickets</h1>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      <section className="console-section">
        <div className="spread">
          <h2 className="h3">Special requests</h2>
          <div className="row" role="group" aria-label="Which requests">
            <button type="button" className="chip-check" aria-pressed={status === 'open'} onClick={() => setStatus('open')}>
              To answer
            </button>
            <button type="button" className="chip-check" aria-pressed={status === 'answered'} onClick={() => setStatus('answered')}>
              Answered
            </button>
          </div>
        </div>
        {requests.error && <ErrorState error={requests.error} onRetry={requests.reload} />}
        {!requests.error && !requests.data && <SkeletonList count={2} height={120} />}
        {requests.data && requests.data.items.length === 0 && <EmptyState title={status === 'open' ? 'Nothing to answer' : 'No answered requests yet'}>Requests travellers add at checkout appear here.</EmptyState>}
        {requests.data?.items.map((b) => (
          <RequestCard
            key={b._id}
            booking={b}
            onReplied={(booking, s) => {
              setNotice(`Reply sent for ${booking.bookingReference} (${s === 'accepted' ? 'accepted' : 'can’t accommodate'}).`);
              requests.reload();
            }}
          />
        ))}
      </section>

      <section className="console-section">
        <h2 className="h3">Escalated tickets and statement queries</h2>
        {tickets.error && <ErrorState error={tickets.error} onRetry={tickets.reload} />}
        {tickets.data && tickets.data.tickets.length === 0 && <p className="muted">No tickets have been escalated to you, and you haven’t queried a statement.</p>}
        {tickets.data && tickets.data.tickets.length > 0 && (
          <ul className="plain-list ticket-list">
            {tickets.data.tickets.map((t) => (
              <li key={t._id} className="card spread">
                <div>
                  <Link to={`/supplier/tickets/${t._id}`}>{t.bookingReference}</Link>
                  {t.type === 'statement_query' && <span className="small muted"> · statement query</span>}
                  <p className="small muted">{t.messages[0]?.body.slice(0, 120)}</p>
                </div>
                <span className={`badge ${TICKET_STATUS[t.status]?.tone}`}>{t.type === 'statement_query' ? (t.status === 'resolved' ? 'Resolved' : 'With Atlas') : t.status === 'escalated' ? 'Needs your reply' : TICKET_STATUS[t.status]?.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
