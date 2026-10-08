import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import TicketThread from '../../components/TicketThread.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export default function AdminTicket() {
  const { id } = useParams();
  const { data, error, reload, setData } = useAsync((signal) => adminApi.ticket(id, { signal }), [id]);
  const [state, setState] = useState({ busy: false, error: null });
  const [resolution, setResolution] = useState({ outcome: 'no_change', amount: '', note: '' });
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
      setState({ busy: false, error: err.details?.[0]?.message || err.message });
    }
  }

  const isQuery = t.type === 'statement_query';
  const resolve = (e) => {
    e.preventDefault();
    act(() =>
      adminApi.resolveQuery(id, {
        outcome: resolution.outcome,
        note: resolution.note.trim(),
        ...(resolution.outcome === 'adjustment' && { amount: Number(resolution.amount) }),
      }),
    );
  };

  return (
    <div className="narrow-console">
      <Link to="/admin/tickets" className="btn-text back-link">
        ← All tickets
      </Link>
      <h1 className="console-h1">
        {isQuery ? 'Statement query' : 'Ticket'} {t.bookingReference}
      </h1>
      <p className="muted small">
        {t.subject} · supplier: {t.supplierName || '—'} · <Link to={`/admin/bookings/${t.bookingReference}`}>view booking</Link>
        {isQuery && t.statementId && (
          <>
            {' '}
            · <Link to={`/admin/settlement/${t.statementId}`}>view statement</Link>
          </>
        )}
      </p>
      {isQuery && t.status === 'resolved' && (
        <p className="small">
          Resolved: {t.resolution?.kind === 'adjustment' ? `adjustment of ₹${t.resolution.amount.toLocaleString('en-IN')} on the next statement` : 'no change'} — {t.resolution?.note}
        </p>
      )}
      {isQuery && t.status !== 'resolved' && (
        <form className="card stack" onSubmit={resolve} noValidate>
          <h2 className="h4">Resolve this query</h2>
          <div className="row filter-row">
            <Field label="Outcome" as="select" value={resolution.outcome} onChange={(e) => setResolution({ ...resolution, outcome: e.target.value })}>
              <option value="no_change">No change</option>
              <option value="adjustment">Adjustment on the next statement</option>
            </Field>
            {resolution.outcome === 'adjustment' && (
              <Field label="Amount (₹, negative to deduct)" type="number" step="1" value={resolution.amount} onChange={(e) => setResolution({ ...resolution, amount: e.target.value })} />
            )}
          </div>
          <Field label="Note for the supplier" maxLength={300} value={resolution.note} onChange={(e) => setResolution({ ...resolution, note: e.target.value })} />
          {state.error && <p className="field-error small">{state.error}</p>}
          <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy}>
            {state.busy ? 'Saving…' : 'Resolve query'}
          </button>
        </form>
      )}
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
