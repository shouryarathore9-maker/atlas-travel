import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import StatementView, { StatementStatus } from '../../components/StatementView.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatPrice } from '../../lib/format.js';

// Every supplier's statements (prd.md → Admin console → Settlement; story #41).
export function AdminSettlement() {
  useDocumentTitle('Admin · Settlement');
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries([...params].filter(([, v]) => v));
  const { data, error, reload } = useAsync((signal) => adminApi.statements(query, { signal }), [params.toString()]);
  const suppliers = useAsync((signal) => adminApi.suppliers({ signal }), []);
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const goTo = (page) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  };

  return (
    <>
      <h1 className="console-h1">Settlement</h1>
      <p className="muted">Statements are created on the 1st for the month before and never change. Resolve queries from Tickets; mark a statement paid once the (simulated) payout is sent.</p>
      <div className="row filter-row">
        <Field label="Month" as="select" value={params.get('period') || ''} onChange={(e) => setFilter('period', e.target.value)}>
          <option value="">All months</option>
          {data?.periods.map((p) => (
            <option key={p.period} value={p.period}>
              {p.label}
            </option>
          ))}
        </Field>
        <Field label="Status" as="select" value={params.get('status') || ''} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">Any</option>
          <option value="ready">Awaiting payment</option>
          <option value="paid">Paid</option>
        </Field>
        <Field label="Supplier" as="select" value={params.get('supplierId') || ''} onChange={(e) => setFilter('supplierId', e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.data?.suppliers.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Field>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={6} height={52} />}
      {data && data.items.length === 0 && <EmptyState title="No statements match" />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Month</th>
                  <th scope="col" className="num">
                    Commission
                  </th>
                  <th scope="col" className="num">
                    Net owed
                  </th>
                  <th scope="col" className="num">
                    Atlas keeps
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <Link to={`/admin/settlement/${s._id}`}>{s.supplierName}</Link>
                    </td>
                    <td>{s.label}</td>
                    <td className="num">{formatPrice(s.totals.commission)}</td>
                    <td className="num">{formatPrice(s.totals.net)}</td>
                    <td className="num">{formatPrice(s.totals.atlasTake)}</td>
                    <td>
                      <StatementStatus statement={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => goTo(data.page - 1)}>
                Previous
              </button>
              <span className="small">
                Page {data.page} of {data.pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page >= data.pages} onClick={() => goTo(data.page + 1)}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export function AdminStatement() {
  const { id } = useParams();
  const { data, error, reload } = useAsync((signal) => adminApi.statement(id, { signal }), [id]);
  const [ref, setRef] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  useDocumentTitle('Admin · Statement');
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Statement not found' : undefined} />;
  if (!data) return <Spinner />;
  const { statement, supplier, queries } = data;

  async function markPaid(e) {
    e.preventDefault();
    setState({ busy: true, error: null });
    try {
      await adminApi.markPaid(id, ref.trim());
      setState({ busy: false, error: null });
      reload();
    } catch (err) {
      setState({ busy: false, error: err.details?.[0]?.message || err.message });
    }
  }

  return (
    <div className="stack">
      <Link to="/admin/settlement" className="btn-text back-link">
        ← All statements
      </Link>
      <h1 className="console-h1">
        {supplier?.name} · {statement.label}
      </h1>
      {statement.status === 'paid' && (
        <Banner tone="success">
          <p>Marked as paid by {statement.paidBy}.</p>
        </Banner>
      )}
      {statement.status === 'ready' && (
        <form className="card row filter-row" onSubmit={markPaid} noValidate>
          <Field label="Mock payment reference" placeholder="ATLPAY-2026-0042" value={ref} onChange={(e) => setRef(e.target.value)} error={state.error} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy}>
            {state.busy ? 'Saving…' : 'Mark as paid'}
          </button>
        </form>
      )}
      <StatementView statement={statement} queries={queries} admin />
      {queries.length > 0 && (
        <section className="card">
          <h2 className="h4">Queries on this statement</h2>
          <ul className="plain-list">
            {queries.map((q) => (
              <li key={q._id}>
                <Link to={`/admin/tickets/${q._id}`}>{q.bookingReference}</Link> — {q.status === 'resolved' ? `resolved (${q.resolution?.kind === 'adjustment' ? formatPrice(q.resolution.amount) : 'no change'})` : 'open'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
