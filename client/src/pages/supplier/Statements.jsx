import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import StatementView, { StatementStatus } from '../../components/StatementView.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate, formatPrice } from '../../lib/format.js';

const pct = (rate) => `${Math.round(rate * 1000) / 10}%`;
const signed = (n) => (n < 0 ? `−${formatPrice(-n)}` : formatPrice(n));

// Monthly settlement statements (prd.md → Supplier console → Statements; story #37). The manager sees
// their own commission rate here, read-only, including a change admin has scheduled for next month.
export function Statements() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Statements`);
  const { data, error, reload } = useAsync((signal) => supplierApi.statements({ signal }), []);
  return (
    <>
      <h1 className="console-h1">Statements</h1>
      <p className="muted">
        One statement per month, created on the 1st for the month before: trips that finished, cancellation fees you kept, and any adjustments. Statements never change once
        created — if a line looks wrong, open it and query the line.
      </p>
      {data && (
        <p className="small">
          Your commission: <strong>{pct(data.commission.current.rate)}</strong>
          {data.commission.upcoming && (
            <>
              {' '}
              · <strong>{pct(data.commission.upcoming.rate)}</strong> from 1 {data.commission.upcoming.label}
            </>
          )}
          <span className="muted"> · set by Atlas</span>
        </p>
      )}
      {data && data.pendingAdjustments.length > 0 && (
        <section className="card">
          <h2 className="h4">Coming on your next statement</h2>
          <ul className="small">
            {data.pendingAdjustments.map((a) => (
              <li key={a._id}>
                {a.kind === 'balance' ? a.note : `${a.bookingReference ? `${a.bookingReference}: ` : ''}${a.note}`} · <strong>{signed(a.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={4} height={52} />}
      {data && data.statements.length === 0 && <EmptyState title="No statements yet">Your first statement appears on the 1st of next month.</EmptyState>}
      {data && data.statements.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">
                  Lines
                </th>
                <th scope="col" className="num">
                  Commission
                </th>
                <th scope="col" className="num">
                  Net owed to you
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.statements.map((s) => (
                <tr key={s._id}>
                  <td>
                    <Link to={`/supplier/statements/${s._id}`}>{s.label}</Link>
                    <span className="block small muted">Created {formatDate(s.createdAt, { year: undefined })}</span>
                  </td>
                  <td className="num">{s.totals.lines}</td>
                  <td className="num">{formatPrice(s.totals.commission)}</td>
                  <td className="num">
                    <strong>{signed(s.totals.net)}</strong>
                  </td>
                  <td>
                    <StatementStatus statement={s} />
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

export function StatementDetail() {
  const { id } = useParams();
  const { supplier } = useOutletContext();
  const { data, error, reload } = useAsync((signal) => supplierApi.statement(id, { signal }), [id]);
  const [querying, setQuerying] = useState(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState({ busy: false, error: null, sent: null });
  useDocumentTitle(data ? `${data.statement.label} statement` : 'Statement');
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Statement not found' : undefined} />;
  if (!data) return <Spinner />;

  async function sendQuery(e) {
    e.preventDefault();
    setState({ busy: true, error: null, sent: null });
    try {
      const { ticket } = await supplierApi.queryLine(id, querying.bookingReference, note.trim());
      setState({ busy: false, error: null, sent: ticket });
      setQuerying(null);
      reload();
    } catch (err) {
      setState({ busy: false, error: err.details?.[0]?.message || err.message, sent: null });
    }
  }

  return (
    <div className="stack">
      <Link to="/supplier/statements" className="btn-text back-link">
        ← All statements
      </Link>
      <h1 className="console-h1">{data.statement.label} statement</h1>
      {state.sent && (
        <Banner tone="success">
          <p>
            Query sent to Atlas. Follow it in <Link to={`/supplier/tickets/${state.sent._id}`}>Requests &amp; tickets</Link>.
          </p>
        </Banner>
      )}
      <StatementView
        statement={data.statement}
        queries={data.queries}
        supplierKind={supplier.kind}
        lineAction={(line, query) =>
          line.bookingReference && line.kind !== 'adjustment' && line.kind !== 'balance' ? (
            query && query.status !== 'resolved' ? (
              <Link to={`/supplier/tickets/${query._id}`} className="small">
                View query
              </Link>
            ) : (
              <button
                type="button"
                className="btn-text small"
                onClick={() => {
                  setQuerying(line);
                  setNote('');
                  setState({ busy: false, error: null, sent: null });
                }}
              >
                Query this line
              </button>
            )
          ) : null
        }
      />
      {data.pendingAdjustments.length > 0 && (
        <section className="card">
          <h2 className="h4">Coming on your next statement</h2>
          <ul className="small">
            {data.pendingAdjustments.map((a) => (
              <li key={a._id}>
                {a.kind === 'balance' ? a.note : `${a.bookingReference ? `${a.bookingReference}: ` : ''}${a.note}`} · <strong>{signed(a.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {querying && (
        <Modal
          title={`Query ${querying.bookingReference}`}
          onClose={() => setQuerying(null)}
          footer={
            <div className="row">
              <button type="submit" form="query-form" className="btn btn-primary" disabled={state.busy}>
                {state.busy ? 'Sending…' : 'Send query'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setQuerying(null)} disabled={state.busy}>
                Cancel
              </button>
            </div>
          }
        >
          <p className="small muted">
            {querying.description} · net {formatPrice(querying.net)}. Atlas support answers with “no change” or an adjustment on your next statement.
          </p>
          <form id="query-form" onSubmit={sendQuery} noValidate>
            <Field label="What looks wrong?" as="textarea" rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} error={state.error} />
          </form>
        </Modal>
      )}
    </div>
  );
}
