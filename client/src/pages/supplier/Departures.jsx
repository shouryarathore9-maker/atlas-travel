import { useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { lastBookableDate, todayIst } from '../../lib/dates.js';
import { formatDateTime, formatPrice } from '../../lib/format.js';

function statusLabel(f) {
  if (f.status === 'cancelled') return { text: 'Cancelled', tone: 'badge-muted' };
  if (f.salesStopped) return { text: 'Sales stopped', tone: 'badge-olive' };
  return { text: 'On sale', tone: 'badge-success' };
}

export default function Departures() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Departures`);
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || '';
  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  const [confirming, setConfirming] = useState(null);
  const [action, setAction] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);

  const { data, error, reload, setData } = useAsync((signal) => supplierApi.departures.list({ q, date, page }, { signal }), [q, date, page]);
  const update = (next) => setParams(Object.fromEntries(Object.entries({ q, date, ...next }).filter(([, v]) => v)));

  async function toggleSales() {
    const f = confirming;
    setAction({ busy: true, error: null });
    try {
      const res = f.salesStopped ? await supplierApi.departures.resumeSales(f._id) : await supplierApi.departures.stopSales(f._id);
      setData((d) => ({ ...d, items: d.items.map((x) => (x._id === f._id ? { ...x, salesStopped: res.flight.salesStopped } : x)) }));
      setNotice(`${f.flightNumber} on ${formatDateTime(f.departureTime)}: sales ${res.flight.salesStopped ? 'stopped' : 'resumed'}.`);
      setConfirming(null);
      setAction({ busy: false, error: null });
    } catch (err) {
      setAction({ busy: false, error: err.message });
    }
  }

  return (
    <>
      <h1 className="console-h1">Departures</h1>
      <p className="muted">Dated flights for the next 60 days, created from your services.</p>
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
          update({ q: search, page: '' });
        }}
      >
        <label htmlFor="dep-date" className="sr-only">
          Date
        </label>
        <input id="dep-date" className="input input-date" type="date" min={todayIst()} max={lastBookableDate()} value={date} onChange={(e) => update({ date: e.target.value, page: '' })} />
        <label htmlFor="dep-q" className="sr-only">
          Search departures
        </label>
        <input id="dep-q" className="input" placeholder="Flight number or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={6} height={44} />}
      {data && data.items.length === 0 && <EmptyState title="No departures found">Try another date or search.</EmptyState>}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total} departures</p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Departs</th>
                  <th scope="col">Flight</th>
                  <th scope="col">Route</th>
                  <th scope="col">Aircraft</th>
                  <th scope="col">Bookings</th>
                  <th scope="col">Load</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => {
                  const status = statusLabel(f);
                  return (
                    <tr key={f._id}>
                      <td>{formatDateTime(f.departureTime)}</td>
                      <td>
                        <Link to={`/supplier/departures/${f._id}`}>{f.flightNumber}</Link>
                      </td>
                      <td>
                        {f.origin.code} → {f.destination.code}
                      </td>
                      <td>{f.aircraftName}</td>
                      <td>{f.bookings}</td>
                      <td>{f.cabins?.economy ? `${Math.round(((f.cabins.economy.sold + (f.cabins.business?.sold || 0)) / (f.cabins.economy.capacity + (f.cabins.business?.capacity || 0))) * 100)}%` : '—'}</td>
                      <td>{formatPrice(f.revenue)}</td>
                      <td>
                        <span className={`badge ${status.tone}`}>{status.text}</span>
                      </td>
                      <td className="table-actions">
                        {f.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="btn-text small"
                            onClick={() => {
                              setAction({ busy: false, error: null });
                              setConfirming(f);
                            }}
                          >
                            {f.salesStopped ? 'Resume sales' : 'Stop sales'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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

      {confirming && (
        <Modal
          title={confirming.salesStopped ? 'Resume sales?' : 'Stop sales?'}
          onClose={() => setConfirming(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={toggleSales} disabled={action.busy} aria-busy={action.busy || undefined}>
                {action.busy ? 'Saving…' : confirming.salesStopped ? 'Resume sales' : 'Stop sales'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            <strong>
              {confirming.flightNumber} · {formatDateTime(confirming.departureTime)}
            </strong>
          </p>
          <p>
            {confirming.salesStopped
              ? 'Travellers will be able to find and book this departure again.'
              : `It disappears from search and can’t be booked. ${
                  confirming.bookings === 0
                    ? 'It has no bookings yet.'
                    : `The ${confirming.bookings} existing booking${confirming.bookings === 1 ? '' : 's'} stay as ${confirming.bookings === 1 ? 'it is' : 'they are'}.`
                }`}
          </p>
          {action.error && (
            <p className="field-error" role="alert">
              {action.error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
