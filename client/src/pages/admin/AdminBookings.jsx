import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDateTime, formatPrice } from '../../lib/format.js';

// Every booking, read-only (prd.md → Admin console → Bookings; Workflow 31). No edits, no refunds.
export default function AdminBookings() {
  useDocumentTitle('Admin · Bookings');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const type = params.get('type') || '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  const { data, error, reload } = useAsync((signal) => adminApi.bookings({ q, status, type, page }, { signal }), [q, status, type, page]);
  const update = (next) => setParams(Object.fromEntries(Object.entries({ q, status, type, ...next }).filter(([, v]) => v)));

  return (
    <>
      <h1 className="console-h1">Bookings</h1>
      <p className="muted">Every booking on Atlas, read-only. Refunds only ever come from the cancellation rules — never by hand.</p>
      <form
        className="row admin-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search.trim(), page: '' });
        }}
      >
        <label htmlFor="bk-q" className="sr-only">
          Booking reference, PNR or email
        </label>
        <input id="bk-q" className="input" placeholder="Reference (AT…), PNR or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value, page: '' })}>
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="select" aria-label="Type" value={type} onChange={(e) => update({ type: e.target.value, page: '' })}>
          <option value="">Flights &amp; hotels</option>
          <option value="flight">Flights</option>
          <option value="hotel">Hotels</option>
        </select>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={6} height={44} />}
      {data && data.items.length === 0 && <EmptyState title="No bookings found">Try another reference or email.</EmptyState>}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total} bookings</p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Booked</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Trip</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Offer</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b._id}>
                    <td>{formatDateTime(b.createdAt)}</td>
                    <td>
                      <Link to={`/admin/bookings/${b.bookingReference}`}>{b.bookingReference}</Link>
                    </td>
                    <td>
                      {b.itemSummary.title}
                      <span className="block small muted">{b.itemSummary.subtitle}</span>
                    </td>
                    <td>{b.supplierName || '—'}</td>
                    <td>{formatPrice(b.fareBreakdown.total)}</td>
                    <td className="small">{b.offer ? `${b.offer.code || b.offer.title} (${b.offer.funder === 'platform' ? 'Atlas' : 'supplier'})` : '—'}</td>
                    <td>{b.status === 'cancelled' ? `Cancelled by ${b.cancellation?.by || 'traveller'}` : 'Confirmed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
                Previous
              </button>
              <span className="small">
                Page {page} of {data.pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
