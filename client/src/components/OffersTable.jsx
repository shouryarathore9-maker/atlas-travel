import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Modal from './Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from './States.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatDateString, formatPrice } from '../lib/format.js';

const STATUS_TONE = { active: 'badge-success', paused: 'badge-olive', expired: 'badge-muted', exhausted: 'badge-muted' };

// Offer list for the supplier console (own offers) and the admin console (all offers + kill switch).
export default function OffersTable({ api, base, admin = false }) {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const funder = params.get('funder') || '';
  const page = Number(params.get('page')) || 1;
  const { data, error, reload } = useAsync((signal) => api.list({ status, funder, page }, { signal }), [status, funder, page]);
  const [confirm, setConfirm] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);
  const update = (next) => setParams(Object.fromEntries(Object.entries({ status, funder, ...next }).filter(([, v]) => v)));

  async function toggle() {
    const o = confirm;
    setState({ busy: true, error: null });
    try {
      await (o.status === 'paused' ? api.resume(o._id) : api.pause(o._id));
      setNotice(`${o.title} ${o.status === 'paused' ? 'resumed' : 'paused'}. Bookings that already used it aren’t affected.`);
      setConfirm(null);
      setState({ busy: false, error: null });
      reload();
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  const totals = data?.items.reduce(
    (acc, o) => ({ redemptions: acc.redemptions + o.redemptions, [o.funder]: (acc[o.funder] || 0) + o.redemptions }),
    { redemptions: 0 },
  );

  return (
    <>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      <div className="row filter-row">
        <label className="small" htmlFor="offer-status">
          Status
        </label>
        <select id="offer-status" className="select" value={status} onChange={(e) => update({ status: e.target.value, page: '' })}>
          <option value="">All</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {admin && (
          <>
            <label className="small" htmlFor="offer-funder">
              Funded by
            </label>
            <select id="offer-funder" className="select" value={funder} onChange={(e) => update({ funder: e.target.value, page: '' })}>
              <option value="">Anyone</option>
              <option value="platform">Atlas</option>
              <option value="supplier">Suppliers</option>
            </select>
          </>
        )}
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={4} height={48} />}
      {data && data.items.length === 0 && <EmptyState title="No offers here">Create one to fill seats or rooms.</EmptyState>}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">
            {data.total} offers · {totals.redemptions} redemptions on this page
            {admin && ` (Atlas-funded ${totals.platform || 0}, supplier-funded ${totals.supplier || 0})`}
          </p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Offer</th>
                  <th scope="col">Code</th>
                  <th scope="col">Discount</th>
                  {admin && <th scope="col">Funded by</th>}
                  <th scope="col">Valid (booking dates)</th>
                  <th scope="col">Redemptions</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o._id}>
                    <td>
                      {o.title}
                      <span className="block small muted">
                        {o.scope}
                        {o.firstBookingsOnly ? ' · first 3 bookings' : ''}
                        {o.minSpend ? ` · min ${formatPrice(o.minSpend)}` : ''}
                      </span>
                    </td>
                    <td>{o.code || <span className="small muted">automatic</span>}</td>
                    <td>{o.discount}</td>
                    {admin && <td>{o.funder === 'platform' ? 'Atlas' : o.supplierName}</td>}
                    <td className="small">
                      {formatDateString(o.validFrom, { year: undefined })} – {formatDateString(o.validTo)}
                    </td>
                    <td>
                      {o.redemptions}
                      {o.redemptionLimit ? ` / ${o.redemptionLimit}` : ''}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_TONE[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="table-actions">
                      {(!admin || o.funder === 'platform') && (
                        <Link to={`${base}/${o._id}`} className="btn-text small" aria-label={`Edit ${o.title}`}>
                          Edit
                        </Link>
                      )}
                      {(o.status === 'active' || o.status === 'paused') && (
                        <button
                          type="button"
                          className="btn-text small"
                          onClick={() => {
                            setState({ busy: false, error: null });
                            setConfirm(o);
                          }}
                        >
                          {o.status === 'paused' ? 'Resume' : admin && o.funder === 'supplier' ? 'Pause (kill switch)' : 'Pause'}
                        </button>
                      )}
                    </td>
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
      {confirm && (
        <Modal
          title={confirm.status === 'paused' ? 'Resume this offer?' : 'Pause this offer?'}
          onClose={() => setConfirm(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={toggle} disabled={state.busy}>
                {state.busy ? 'Saving…' : confirm.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            <strong>{confirm.title}</strong>
            {confirm.funder === 'supplier' && admin ? ` (${confirm.supplierName}’s offer)` : ''}.{' '}
            {confirm.status === 'paused'
              ? 'Travellers will be able to use it again.'
              : 'Travellers can’t use it from now on; anyone already at checkout is told before paying. Bookings that used it keep their discount.'}
          </p>
          {state.error && <p className="field-error">{state.error}</p>}
        </Modal>
      )}
    </>
  );
}
