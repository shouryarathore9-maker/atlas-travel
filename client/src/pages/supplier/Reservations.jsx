import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate, formatPrice } from '../../lib/format.js';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

// Hotel reservations (prd.md → Supplier console → Reservations; Workflow 8).
export default function Reservations() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Reservations`);
  const [params, setParams] = useSearchParams();
  const when = params.get('when') || 'upcoming';
  const page = Number(params.get('page')) || 1;
  const { data, error, reload } = useAsync((signal) => supplierApi.reservations({ when, page }, { signal }), [when, page]);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);

  async function confirmCancel() {
    if (reason.trim().length < 5) {
      setState({ busy: false, error: 'Give a short reason (at least 5 characters)' });
      return;
    }
    setState({ busy: true, error: null });
    try {
      await supplierApi.cancelReservation(cancelling._id, reason.trim());
      setNotice(`${cancelling.bookingReference} cancelled. The guest was refunded ${formatPrice(cancelling.total)} in full and told straight away.`);
      setCancelling(null);
      setState({ busy: false, error: null });
      reload();
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  return (
    <>
      <h1 className="console-h1">Reservations</h1>
      <div className="row chip-row" role="group" aria-label="Which reservations">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="chip-check" aria-pressed={when === t.key} onClick={() => setParams({ when: t.key })}>
            {t.label}
          </button>
        ))}
      </div>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={4} height={56} />}
      {data && data.items.length === 0 && <EmptyState title="No reservations here">New reservations appear as soon as they’re paid.</EmptyState>}
      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Stay</th>
                  <th scope="col">Booking</th>
                  <th scope="col">Guest</th>
                  <th scope="col">Room</th>
                  <th scope="col">Special request</th>
                  <th scope="col">Offer</th>
                  <th scope="col">Paid</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b._id}>
                    <td>
                      {formatDate(b.travelDates.start, { year: undefined })} – {formatDate(b.travelDates.end, { year: undefined })}
                    </td>
                    <td>{b.bookingReference}</td>
                    <td>{b.travellers[0]?.name}</td>
                    <td>
                      {b.selection.roomTypeName} × {b.selection.rooms}
                      <span className="block small muted">
                        {b.selection.ratePlan === 'nonrefundable' ? 'Non-refundable' : 'Flexible'}
                        {b.selection.breakfast ? ' · breakfast added' : ''}
                      </span>
                    </td>
                    <td className="small">{b.specialRequest ? b.specialRequest.text : '—'}</td>
                    <td className="small">{b.offer ? `${b.offer.code || b.offer.title} −${formatPrice(b.offer.amount)} (${b.offer.funder === 'platform' ? 'Atlas-funded' : 'your offer'})` : '—'}</td>
                    <td>
                      {formatPrice(b.total)}
                      {b.status === 'cancelled' && <span className="block small muted">Cancelled by {b.cancellation?.by === 'supplier' ? 'you' : 'guest'}</span>}
                    </td>
                    <td className="table-actions">
                      {b.status === 'confirmed' && new Date(b.travelDates.start) > new Date() && (
                        <button
                          type="button"
                          className="btn-text small"
                          onClick={() => {
                            setReason('');
                            setState({ busy: false, error: null });
                            setCancelling(b);
                          }}
                        >
                          Cancel
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
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParams({ when, page: page - 1 })}>
                Previous
              </button>
              <span className="small">
                Page {page} of {data.pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => setParams({ when, page: page + 1 })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
      {cancelling && (
        <Modal
          title="Cancel this reservation?"
          onClose={() => setCancelling(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={confirmCancel} disabled={state.busy}>
                {state.busy ? 'Cancelling…' : 'Cancel and refund in full'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setCancelling(null)}>
                Keep it
              </button>
            </div>
          }
        >
          <p>
            {cancelling.bookingReference} · {cancelling.travellers[0]?.name}. The guest gets {formatPrice(cancelling.total)} back in full — even on a non-refundable rate — and the rooms return to your
            inventory.
          </p>
          <Field label="Reason (shown to the guest)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} error={state.error} />
        </Modal>
      )}
    </>
  );
}
