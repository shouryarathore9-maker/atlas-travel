import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import BookingSummary from '../components/BookingSummary.jsx';
import { bookingsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

// Read-only: refreshing this page just re-fetches the booking, it never creates another one.
export default function Confirmation() {
  const { reference } = useParams();
  const { data, error, reload } = useAsync((signal) => bookingsApi.get(reference, { signal }), [reference]);
  const notFound = error?.status === 404;
  useDocumentTitle(error ? (notFound ? 'Booking not found' : 'Booking unavailable') : data ? 'Booking confirmed' : 'Booking');

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={notFound ? undefined : reload} title={notFound ? 'Booking not found' : undefined} />
        {notFound && (
          <p className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
            <Link to="/bookings" className="btn btn-secondary">
              View my bookings
            </Link>
          </p>
        )}
      </main>
    );
  }
  if (!data) {
    return (
      <main id="main" className="container page">
        <Spinner label="Fetching your booking…" />
      </main>
    );
  }

  const { booking } = data;
  return (
    <main id="main" className="container page confirmation">
      <div className="confirmation-hero fade-in">
        <span className="confirmation-icon" aria-hidden="true">
          <Icon name="check" size={32} />
        </span>
        <h1>{booking.type === 'flight' ? 'Your trip is booked.' : 'Your stay is booked.'}</h1>
        <p className="muted">
          A confirmation is on its way to <strong>{booking.contact?.email}</strong>.
        </p>
        <p className="booking-ref">
          Booking reference <strong>{booking.bookingReference}</strong>
        </p>
        {booking.pnr && (
          <p className="booking-ref small">
            Airline PNR <strong>{booking.pnr}</strong>
          </p>
        )}
      </div>

      <BookingSummary booking={booking} />

      <div className="row confirmation-actions">
        <Link to={`/bookings/${booking.bookingReference}/documents`} className="btn btn-secondary">
          {booking.type === 'flight' ? 'View e-ticket' : 'View voucher'}
        </Link>
        <Link to="/bookings" className="btn btn-primary">
          View my bookings
        </Link>
        <Link to="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
    </main>
  );
}
