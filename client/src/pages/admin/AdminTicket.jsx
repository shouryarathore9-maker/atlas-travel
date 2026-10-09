import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import TicketThread from '../../components/TicketThread.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

const MAX_LINES = 5;
const emptyLine = () => ({ amount: '', note: '' });
const signedInr = (n) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;

export default function AdminTicket() {
  const { id } = useParams();
  const { data, error, reload, setData } = useAsync((signal) => adminApi.ticket(id, { signal }), [id]);
  const [state, setState] = useState({ busy: false, error: null });
  const [resolution, setResolution] = useState({ outcome: 'no_change', note: '', lines: [emptyLine()] });
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
      const detail = err.details?.[0];
      const line = /^adjustments\.(\d+)/.exec(detail?.path || '');
      setState({ busy: false, error: detail ? `${line ? `Line ${Number(line[1]) + 1}: ` : ''}${detail.message}` : err.message });
    }
  }

  const isQuery = t.type === 'statement_query';
  const resolve = (e) => {
    e.preventDefault();
    act(() =>
      adminApi.resolveQuery(id, {
        outcome: resolution.outcome,
        note: resolution.note.trim(),
        ...(resolution.outcome === 'adjustment' && {
          adjustments: resolution.lines.map((l) => ({ amount: l.amount === '' ? undefined : Number(l.amount), note: l.note.trim() })),
        }),
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
          Resolved: {t.resolution?.kind === 'adjustment' ? `adjustment of ${signedInr(t.resolution.amount)} on the next statement` : 'no change'} — {t.resolution?.note}
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
          </div>
          {resolution.outcome === 'adjustment' && (
            <fieldset className="stack adjustment-lines">
              <legend className="small">Adjustment lines (shown to the supplier on their next statement)</legend>
              {resolution.lines.map((l, i) => {
                const setLine = (patch) => setResolution((r) => ({ ...r, lines: r.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                return (
                  <div className="row filter-row" key={i}>
                    <Field label={`Amount ${i + 1} (₹, negative to deduct)`} type="number" step="1" inputMode="numeric" value={l.amount} onChange={(e) => setLine({ amount: e.target.value })} />
                    <Field label={`Reason ${i + 1}`} maxLength={300} value={l.note} onChange={(e) => setLine({ note: e.target.value })} />
                    {resolution.lines.length > 1 && (
                      <button type="button" className="btn-text small" onClick={() => setResolution((r) => ({ ...r, lines: r.lines.filter((_, j) => j !== i) }))}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
              {resolution.lines.length < MAX_LINES && (
                <button type="button" className="btn-text small" onClick={() => setResolution((r) => ({ ...r, lines: [...r.lines, emptyLine()] }))}>
                  + Add another line
                </button>
              )}
            </fieldset>
          )}
          <Field label="Note for the supplier" maxLength={300} value={resolution.note} onChange={(e) => setResolution({ ...resolution, note: e.target.value })} />
          {state.error && <p className="field-error small">{state.error}</p>}
          <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy} aria-busy={state.busy || undefined}>
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
