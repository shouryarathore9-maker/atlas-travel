import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../components/States.jsx';
import { bookingsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatDate, formatDateTime, formatPrice } from '../lib/format.js';
import { estimateRefund, isCancellable } from '../lib/validation.js';

export default function MyBookings() {
  useDocumentTitle('My trips');
  const { data, error, reload, setData } = useAsync((signal) => bookingsApi.mine({ signal }), []);
  const [confirming, setConfirming] = useState(null);
  const [cancelState, setCancelState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);
  const cancelling = useRef(false); // a fast double-click sends one request, not two

  async function cancel() {
    if (cancelling.current) return;
    cancelling.current = true;
    setCancelState({ busy: true, error: null });
    try {
      const { booking } = await bookingsApi.cancel(confirming._id);
      setData((d) => ({ bookings: d.bookings.map((b) => (b._id === booking._id ? booking : b)) }));
      setNotice(`Booking ${booking.bookingReference} is cancelled. A simulated refund of ${formatPrice(booking.cancellation.refundAmount)} is on its way.`);
      setConfirming(null);
      setCancelState({ busy: false, error: null });
    } catch (err) {
      setCancelState({ busy: false, error: err.message });
    } finally {
      cancelling.current = false;
    }
  }

  const bookings = data?.bookings || [];
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && new Date(b.travelDates.start) > new Date());
  const others = bookings.filter((b) => !upcoming.includes(b));

  return (
    <main id="main" className="container page narrow">
      <h1>My trips</h1>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={3} />}
      {data && bookings.length === 0 && (
        <EmptyState title="No trips yet" action={<Link to="/" className="btn btn-secondary">Find a flight or stay</Link>}>
          When you book, your trips will wait for you here.
        </EmptyState>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="bookings-section">
          <h2 id="upcoming-heading">Upcoming</h2>
          {upcoming.map((b) => (
            <BookingRow key={b._id} booking={b} onCancel={() => { setCancelState({ busy: false, error: null }); setConfirming(b); }} />
          ))}
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="past-heading" className="bookings-section">
          <h2 id="past-heading">Past &amp; cancelled</h2>
          {others.map((b) => (
            <BookingRow key={b._id} booking={b} />
          ))}
        </section>
      )}

      {confirming && (
        <Modal
          title="Cancel this booking?"
          onClose={() => setConfirming(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={cancel} disabled={cancelState.busy}>
                {cancelState.busy ? 'Cancelling…' : 'Yes, cancel booking'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(null)} disabled={cancelState.busy}>
                Keep it
              </button>
            </div>
          }
        >
          <p>
            <strong>{confirming.itemSummary.title}</strong> · {confirming.bookingReference}
          </p>
          <p>
            Based on the cancellation policy, your simulated refund would be{' '}
            <strong>{formatPrice(estimateRefund(confirming))}</strong> of {formatPrice(confirming.fareBreakdown.total)} paid.
          </p>
          {cancelState.error && <p className="field-error">{cancelState.error}</p>}
        </Modal>
      )}
    </main>
  );
}

function BookingRow({ booking, onCancel }) {
  const isFlight = booking.type === 'flight';
  return (
    <article className="card booking-row">
      <div className="spread">
        <div>
          <p className="eyebrow">
            {isFlight ? 'Flight' : 'Stay'} · {booking.bookingReference}
          </p>
          <h3>{booking.itemSummary.title}</h3>
          <p className="small">{booking.itemSummary.subtitle}</p>
          <p className="small muted">
            {isFlight
              ? formatDateTime(booking.travelDates.start)
              : `${formatDate(booking.travelDates.start, { year: undefined })} – ${formatDate(booking.travelDates.end)}`}
          </p>
        </div>
        <div className="booking-row-side">
          <span className={`badge ${booking.status === 'confirmed' ? 'badge-success' : 'badge-muted'}`}>{booking.status}</span>
          <p className="price">{formatPrice(booking.fareBreakdown.total)}</p>
          {booking.status === 'cancelled' && (
            <p className="small muted">Refund {formatPrice(booking.cancellation?.refundAmount || 0)} (simulated)</p>
          )}
        </div>
      </div>
      <div className="row">
        <Link to={`/bookings/${booking.bookingReference}/confirmation`} className="btn-text small">
          View details
        </Link>
        {onCancel && isCancellable(booking) && (
          <button type="button" className="btn-text small" onClick={onCancel}>
            Cancel booking
          </button>
        )}
      </div>
    </article>
  );
}
