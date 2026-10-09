import { useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { daysLabel, minuteToTime } from '../../lib/consoleForm.js';
import { formatDateString, formatDuration } from '../../lib/format.js';

export default function Services() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Services`);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  const [deleting, setDeleting] = useState(null);
  const [deleteState, setDeleteState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(location.state?.saved || null);

  useEffect(() => setSearch(q), [q]);
  const { data, error, reload } = useAsync((signal) => supplierApi.services.list({ q, page }, { signal }), [q, page]);

  async function confirmDelete() {
    setDeleteState({ busy: true, error: null });
    try {
      await supplierApi.services.remove(deleting._id);
      setNotice(`${deleting.flightNumber} was deleted.`);
      setDeleting(null);
      setDeleteState({ busy: false, error: null });
      reload();
    } catch (err) {
      setDeleteState({ busy: false, error: err.message });
    }
  }

  return (
    <>
      <div className="spread">
        <h1 className="console-h1">Services</h1>
        <Link to="/supplier/services/new" className="btn btn-primary">
          Add service
        </Link>
      </div>
      <p className="muted">Your recurring flights. Departures for the next 60 days are created from these automatically.</p>
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
        <label htmlFor="svc-q" className="sr-only">
          Search services
        </label>
        <input id="svc-q" className="input" placeholder="Flight number or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={5} height={48} />}
      {data && data.items.length === 0 && (
        <EmptyState title={q ? 'No services match that search' : 'No services yet'}>{q ? 'Try a different search.' : 'Add your first recurring flight.'}</EmptyState>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total} services</p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Flight</th>
                  <th scope="col">Route</th>
                  <th scope="col">Departs</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Days</th>
                  <th scope="col">Aircraft</th>
                  <th scope="col">Runs</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s._id}>
                    <td>{s.flightNumber}</td>
                    <td>
                      {s.origin.code} → {s.destination.code}
                    </td>
                    <td>{minuteToTime(s.departureMinute)}</td>
                    <td>{formatDuration(s.durationMinutes)}</td>
                    <td>{daysLabel(s.daysOfWeek)}</td>
                    <td>{s.aircraftName}</td>
                    <td>{s.endDate ? `until ${formatDateString(s.endDate)}` : `from ${formatDateString(s.startDate)}`}</td>
                    <td className="table-actions">
                      <Link to={`/supplier/services/${s._id}`} className="btn-text small" aria-label={`Edit ${s.flightNumber}`}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn-text small"
                        aria-label={`Delete ${s.flightNumber}`}
                        onClick={() => {
                          setDeleteState({ busy: false, error: null });
                          setDeleting(s);
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
          title={`Delete ${deleting.flightNumber}?`}
          onClose={() => setDeleting(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleteState.busy} aria-busy={deleteState.busy || undefined}>
                {deleteState.busy ? 'Deleting…' : 'Delete service'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            All of its departures and reviews are removed and it disappears from search. A service that has bookings can’t be deleted — set an end date
            instead.
          </p>
          {deleteState.error && (
            <p className="field-error" role="alert">
              {deleteState.error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
