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
  useDocumentTitle('Booking confirmed');
  const { data, error, reload } = useAsync((signal) => bookingsApi.get(reference, { signal }), [reference]);

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Booking not found' : undefined} />
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
      </div>

      <BookingSummary booking={booking} />

      <div className="row confirmation-actions">
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
