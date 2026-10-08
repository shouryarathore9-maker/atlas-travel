import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, SkeletonList, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate, formatPrice } from '../../lib/format.js';

const ROLE_LABEL = { traveler: 'Traveller', airline_manager: 'Airline manager', hotel_manager: 'Hotel manager', admin: 'Admin' };

// Every account on Atlas (prd.md → Admin console → Users). Read-only: admin can see who signed up and
// what they booked, but not edit accounts.
export function AdminUsers() {
  useDocumentTitle('Admin · Users');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const query = Object.fromEntries([...params].filter(([, v]) => v));
  const { data, error, reload } = useAsync((signal) => adminApi.users(query, { signal }), [params.toString()]);
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <h1 className="console-h1">Users</h1>
      <p className="muted">Every account on Atlas, newest first. Read-only.</p>
      <form
        className="row admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() });
        }}
      >
        <label className="sr-only" htmlFor="user-q">
          Name or email
        </label>
        <input id="user-q" className="input" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="user-role">
          Role
        </label>
        <select id="user-role" className="select" value={params.get('role') || ''} onChange={(e) => set({ role: e.target.value })}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary btn-sm">
          Search
        </button>
      </form>
      <label className="row small">
        <input type="checkbox" checked={params.get('seeded') === 'true'} onChange={(e) => set({ seeded: e.target.checked ? 'true' : '' })} /> Include seeded history accounts
      </label>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={6} height={52} />}
      {data && data.items.length === 0 && <EmptyState title="No accounts match" />}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total.toLocaleString('en-IN')} accounts</p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Joined</th>
                  <th scope="col" className="num">
                    Bookings
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <Link to={`/admin/users/${u._id}`}>{u.name}</Link>
                    </td>
                    <td className="small">{u.email}</td>
                    <td className="small">
                      {ROLE_LABEL[u.role]}
                      {u.supplierName && <span className="block muted">{u.supplierName}</span>}
                    </td>
                    <td className="small">{formatDate(u.createdAt, { year: undefined })}</td>
                    <td className="num">{u.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => set({ page: String(data.page - 1) })}>
                Previous
              </button>
              <span className="small">
                Page {data.page} of {data.pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page >= data.pages} onClick={() => set({ page: String(data.page + 1) })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export function AdminUser() {
  const { id } = useParams();
  const { data, error, reload } = useAsync((signal) => adminApi.user(id, { signal }), [id]);
  useDocumentTitle(data ? `Admin · ${data.user.name}` : 'Admin · User');
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Account not found' : undefined} />;
  if (!data) return <Spinner />;
  const { user, supplier, bookings, bookingCount, tickets } = data;
  return (
    <div className="stack">
      <Link to="/admin/users" className="btn-text back-link">
        ← All users
      </Link>
      <h1 className="console-h1">{user.name}</h1>
      <section className="card">
        <dl className="detail-list">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Mobile</dt>
            <dd>{user.phone || '—'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>
              {ROLE_LABEL[user.role]}
              {supplier && ` · ${supplier.name}${supplier.status === 'suspended' ? ' (suspended)' : ''}`}
            </dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
          {user.role === 'traveler' && (
            <div>
              <dt>Saved travellers</dt>
              <dd>{user.savedTravellers}</dd>
            </div>
          )}
        </dl>
      </section>
      {user.role === 'traveler' && (
        <section className="card">
          <h2 className="h4">Bookings ({bookingCount})</h2>
          {bookings.length === 0 ? (
            <p className="small muted">No bookings yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Trip</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b._id}>
                      <td>
                        <Link to={`/admin/bookings/${b.bookingReference}`}>{b.bookingReference}</Link>
                        <span className="block small muted">{formatDate(b.createdAt, { year: undefined })}</span>
                      </td>
                      <td className="small">
                        {b.itemSummary?.title}
                        <span className="block muted">{formatDate(b.travelDates.start, { year: undefined })}</span>
                      </td>
                      <td>
                        <span className={`badge ${b.status === 'confirmed' ? 'badge-success' : 'badge-muted'}`}>{b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}</span>
                      </td>
                      <td className="num">{formatPrice(b.fareBreakdown?.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {bookingCount > bookings.length && <p className="small muted">Showing the latest {bookings.length}.</p>}
        </section>
      )}
      {tickets.length > 0 && (
        <section className="card">
          <h2 className="h4">Help tickets</h2>
          <ul className="plain-list">
            {tickets.map((t) => (
              <li key={t._id} className="small">
                <Link to={`/admin/tickets/${t._id}`}>{t.bookingReference}</Link> · {t.subject} · {t.status}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
