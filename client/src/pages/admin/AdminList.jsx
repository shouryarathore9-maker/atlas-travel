import { useEffect, useState } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDateTime, formatPrice } from '../../lib/format.js';

const CONFIG = {
  flights: {
    title: 'Flights',
    singular: 'flight',
    columns: ['Flight', 'Route', 'Departs', 'From price'],
    row: (f) => [
      `${f.airline} ${f.flightNumber}`,
      `${f.origin.code} → ${f.destination.code}`,
      formatDateTime(f.departureTime),
      formatPrice(Math.min(...f.fareOptions.map((o) => o.price))),
    ],
    label: (f) => `${f.airline} ${f.flightNumber}`,
  },
  hotels: {
    title: 'Hotels',
    singular: 'hotel',
    columns: ['Hotel', 'City', 'Stars', 'From price'],
    row: (h) => [h.name, h.city, `${h.starRating}★`, formatPrice(Math.min(...h.roomTypes.map((r) => r.price)))],
    label: (h) => h.name,
  },
};

export default function AdminList({ resource }) {
  const config = CONFIG[resource];
  useDocumentTitle(`Admin · ${config.title}`);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  const [deleting, setDeleting] = useState(null);
  const [deleteState, setDeleteState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  const { data, error, reload } = useAsync((signal) => adminApi[resource].list({ q, page }, { signal }), [resource, q, page]);

  async function confirmDelete() {
    setDeleteState({ busy: true, error: null });
    try {
      await adminApi[resource].remove(deleting._id);
      setNotice(`${config.label(deleting)} was deleted.`);
      setDeleting(null);
      setDeleteState({ busy: false, error: null });
      reload();
    } catch (err) {
      setDeleteState({ busy: false, error: err.message });
    }
  }

  return (
    <main id="main" className="container page">
      <p className="eyebrow">Admin</p>
      <div className="spread">
        <h1>Inventory</h1>
        <Link to={`/admin/${resource}/new`} className="btn btn-primary">
          Add {config.singular}
        </Link>
      </div>
      <nav className="tabs admin-tabs" aria-label="Inventory type">
        <NavLink to="/admin/flights" className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`} aria-current={resource === 'flights' ? 'page' : undefined}>
          Flights
        </NavLink>
        <NavLink to="/admin/hotels" className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`} aria-current={resource === 'hotels' ? 'page' : undefined}>
          Hotels
        </NavLink>
      </nav>

      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}

      <form
        className="row admin-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(search ? { q: search } : {});
        }}
      >
        <label htmlFor="admin-q" className="sr-only">
          Search {config.title.toLowerCase()}
        </label>
        <input
          id="admin-q"
          className="input"
          placeholder={resource === 'flights' ? 'Flight number, airline or city' : 'Hotel name or city'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={5} height={56} />}
      {data && data.items.length === 0 && <EmptyState title={`No ${config.title.toLowerCase()} found`}>Try a different search.</EmptyState>}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total} total</p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {config.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item._id}>
                    {config.row(item).map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                    <td className="table-actions">
                      <Link to={`/admin/${resource}/${item._id}`} className="btn-text small" aria-label={`Edit ${config.label(item)}`}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn-text small"
                        aria-label={`Delete ${config.label(item)}`}
                        onClick={() => {
                          setDeleteState({ busy: false, error: null });
                          setDeleting(item);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParams({ ...(q && { q }), page: page - 1 })}>
                Previous
              </button>
              <span className="small">
                Page {page} of {data.pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => setParams({ ...(q && { q }), page: page + 1 })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {deleting && (
        <Modal
          title={`Delete ${config.singular}?`}
          onClose={() => setDeleting(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleteState.busy}>
                {deleteState.busy ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            <strong>{config.label(deleting)}</strong> and its reviews will be removed from search immediately. This can’t be undone.
          </p>
          {deleteState.error && (
            <p className="field-error" role="alert">
              {deleteState.error}
            </p>
          )}
        </Modal>
      )}
    </main>
  );
}
