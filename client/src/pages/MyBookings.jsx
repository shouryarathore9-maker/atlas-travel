import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cancellationLabel } from '../components/BookingSummary.jsx';
import Field from '../components/Field.jsx';
import Modal from '../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../components/States.jsx';
import { bookingsApi, meApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useReveal } from '../hooks/useReveal.js';
import { formatDate, formatDateTime, formatPrice } from '../lib/format.js';
import { checkInOpensAt, checkInState } from '../lib/trips.js';
import { estimateRefund, isCancellable } from '../lib/validation.js';

export default function MyBookings() {
  useDocumentTitle('My trips');
  const navigate = useNavigate();
  const { data, error, reload, setData } = useAsync((signal) => bookingsApi.mine({ signal }), []);
  const [confirming, setConfirming] = useState(null);
  const [cancelState, setCancelState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);
  const [helpFor, setHelpFor] = useState(null);
  const [help, setHelp] = useState({ message: '', busy: false, error: null });
  const cancelling = useRef(false); // a fast double-click sends one request, not two

  const replaceBooking = (booking) => setData((d) => ({ bookings: d.bookings.map((b) => (b._id === booking._id ? { ...b, ...booking } : b)) }));

  async function cancel() {
    if (cancelling.current) return;
    cancelling.current = true;
    setCancelState({ busy: true, error: null });
    try {
      const { booking } = await bookingsApi.cancel(confirming._id);
      replaceBooking(booking);
      setNotice(`Booking ${booking.bookingReference} is cancelled. A simulated refund of ${formatPrice(booking.cancellation.refundAmount)} is on its way — your receipt is in your notifications.`);
      setConfirming(null);
      setCancelState({ busy: false, error: null });
    } catch (err) {
      setCancelState({ busy: false, error: err.message });
    } finally {
      cancelling.current = false;
    }
  }

  async function respond(booking, decision) {
    try {
      const { booking: updated } = await bookingsApi.respondToReschedule(booking.bookingReference, decision);
      replaceBooking(updated);
      setNotice(
        decision === 'keep'
          ? `You’re keeping the new time for ${booking.bookingReference}.`
          : `Booking ${booking.bookingReference} is cancelled with a full refund of ${formatPrice(updated.cancellation.refundAmount)} (simulated).`,
      );
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function openTicket(e) {
    e.preventDefault();
    if (help.message.trim().length < 10) {
      setHelp((h) => ({ ...h, error: 'Tell us a little more (at least 10 characters)' }));
      return;
    }
    setHelp((h) => ({ ...h, busy: true, error: null }));
    try {
      const { ticket } = await meApi.openTicket({ bookingReference: helpFor.bookingReference, message: help.message.trim() });
      navigate(`/help/${ticket._id}`);
    } catch (err) {
      setHelp((h) => ({ ...h, busy: false, error: err.message }));
    }
  }

  const bookings = data?.bookings || [];
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && new Date(b.travelDates.end || b.travelDates.start) > new Date());
  const others = bookings.filter((b) => !upcoming.includes(b));
  const rowProps = (b) => ({
    booking: b,
    onCancel: () => {
      setCancelState({ busy: false, error: null });
      setConfirming(b);
    },
    onHelp: () => {
      setHelp({ message: '', busy: false, error: null });
      setHelpFor(b);
    },
    onRespond: (decision) => respond(b, decision),
  });

  return (
    <main id="main" className="container page narrow">
      <div className="spread">
        <h1>My trips</h1>
        <Link to="/travellers" className="btn-text small">
          Saved travellers
        </Link>
      </div>
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
            <BookingRow key={b._id} {...rowProps(b)} />
          ))}
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="past-heading" className="bookings-section">
          <h2 id="past-heading">Past &amp; cancelled</h2>
          {others.map((b) => (
            <BookingRow key={b._id} {...rowProps(b)} onCancel={null} onRespond={null} />
          ))}
        </section>
      )}

      {confirming && (
        <Modal
          title="Cancel this booking?"
          onClose={() => setConfirming(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={cancel} disabled={cancelState.busy} aria-busy={cancelState.busy || undefined}>
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
            Based on the cancellation terms you agreed to, your simulated refund would be <strong>{formatPrice(estimateRefund(confirming))}</strong> of{' '}
            {formatPrice(confirming.fareBreakdown.total)} paid.
          </p>
          {confirming.offer && <p className="small muted">Your {confirming.offer.title} offer won’t be given back if you cancel.</p>}
          {cancelState.error && <p className="field-error">{cancelState.error}</p>}
        </Modal>
      )}

      {helpFor && (
        <Modal
          title="What’s wrong with this booking?"
          onClose={() => setHelpFor(null)}
          footer={
            <div className="row">
              <button type="submit" form="help-form" className="btn btn-primary" disabled={help.busy} aria-busy={help.busy || undefined}>
                {help.busy ? 'Sending…' : 'Send to Atlas support'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setHelpFor(null)}>
                Cancel
              </button>
            </div>
          }
        >
          <p className="small">
            {helpFor.itemSummary.title} · {helpFor.bookingReference}
          </p>
          <form id="help-form" onSubmit={openTicket} noValidate>
            <Field as="textarea" label="Your message" rows={5} maxLength={1000} value={help.message} onChange={(e) => setHelp((h) => ({ ...h, message: e.target.value }))} error={help.error} hint="Atlas support replies here and in your notifications." />
          </form>
        </Modal>
      )}
    </main>
  );
}

function BookingRow({ booking, onCancel, onHelp, onRespond }) {
  const isFlight = booking.type === 'flight';
  const checkIn = checkInState(booking);
  const reschedule = booking.reschedule?.decision === 'pending' && new Date(booking.reschedule.respondBy) > new Date() ? booking.reschedule : null;
  const reply = booking.specialRequest?.reply;
  const revealRef = useReveal();
  return (
    <article ref={revealRef} className="card booking-row">
      <div className="spread">
        <div>
          <p className="eyebrow">
            {isFlight ? 'Flight' : 'Stay'} · {booking.bookingReference}
            {booking.pnr && ` · PNR ${booking.pnr}`}
          </p>
          <h3>{booking.itemSummary.title}</h3>
          <p className="small">{booking.itemSummary.subtitle}</p>
          <p className="small muted">
            {isFlight
              ? formatDateTime(booking.travelDates.start)
              : `${formatDate(booking.travelDates.start, { year: undefined })} – ${formatDate(booking.travelDates.end)}`}
          </p>
          {booking.offer && <p className="small muted">Offer used: {booking.offer.title} (−{formatPrice(booking.offer.amount)})</p>}
          {reply && (
            <p className="small reply-line">
              “{booking.specialRequest.text}” — {reply.status === 'accepted' ? 'accepted' : 'can’t accommodate'}
              {reply.comment ? `: ${reply.comment}` : ''}
            </p>
          )}
        </div>
        <div className="booking-row-side">
          <span className={`badge ${booking.status === 'confirmed' ? 'badge-success' : booking.cancellation?.by === 'supplier' ? 'badge-error' : 'badge-muted'}`}>
            {cancellationLabel(booking) || 'Confirmed'}
          </span>
          <p className="price">{formatPrice(booking.fareBreakdown.total)}</p>
          {booking.status === 'cancelled' && <p className="small muted">Refund {formatPrice(booking.cancellation?.refundAmount || 0)} (simulated)</p>}
        </div>
      </div>

      {reschedule && onRespond && (
        <div className="notice-sand reschedule-box">
          <p>
            <strong>Schedule changed by the airline.</strong> Was <s>{formatDateTime(reschedule.previousStart)}</s>, now <strong>{formatDateTime(booking.travelDates.start)}</strong>.
          </p>
          <p className="small">Keep the new time, or cancel for a full refund until {formatDateTime(reschedule.respondBy)}. If you don’t answer, the trip is kept.</p>
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRespond('keep')}>
              Keep new time
            </button>
            <button type="button" className="btn-text small" onClick={() => onRespond('cancel')}>
              Cancel for a full refund
            </button>
          </div>
        </div>
      )}

      <div className="row booking-actions">
        <Link to={`/bookings/${booking.bookingReference}/confirmation`} className="btn-text small">
          View details
        </Link>
        <Link to={`/bookings/${booking.bookingReference}/documents`} className="btn-text small">
          {isFlight ? 'E-ticket' : 'Voucher'}
        </Link>
        {checkIn === 'open' && (
          <Link to={`/bookings/${booking.bookingReference}/documents?view=check-in`} className="btn-text small">
            Check in
          </Link>
        )}
        {checkIn === 'done' && (
          <Link to={`/bookings/${booking.bookingReference}/documents?view=passes`} className="btn-text small">
            Boarding passes
          </Link>
        )}
        {checkIn === 'soon' && <span className="small muted">Check-in opens {formatDateTime(checkInOpensAt(booking))}</span>}
        {booking.ticket ? (
          <Link to={`/help/${booking.ticket._id}`} className="btn-text small">
            Help ticket ({booking.ticket.status})
          </Link>
        ) : (
          <button type="button" className="btn-text small" onClick={onHelp}>
            Get help
          </button>
        )}
        {onCancel && isCancellable(booking) && (
          <button type="button" className="btn-text small" onClick={onCancel}>
            Cancel booking
          </button>
        )}
      </div>
    </article>
  );
}
