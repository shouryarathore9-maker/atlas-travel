import { Link, useParams } from 'react-router-dom';
import BookingSummary from '../../components/BookingSummary.jsx';
import { TICKET_STATUS } from '../../components/TicketThread.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDateTime, formatPrice } from '../../lib/format.js';

export default function AdminBookingDetail() {
  const { ref } = useParams();
  const { data, error, reload } = useAsync((signal) => adminApi.booking(ref, { signal }), [ref]);
  useDocumentTitle(`Admin · ${ref}`);
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Booking not found' : undefined} />;
  if (!data) return <Spinner />;
  const { booking, payments, tickets, supplier, account } = data;
  return (
    <div className="narrow-console stack">
      <Link to="/admin/bookings" className="btn-text back-link">
        ← All bookings
      </Link>
      <h1 className="console-h1">{booking.bookingReference}</h1>
      <p className="muted">
        Booked {formatDateTime(booking.createdAt)} by {account?.name} ({account?.email}) · {supplier?.name} · read-only
      </p>
      <BookingSummary booking={booking} />
      {booking.offer && (
        <section className="card">
          <h2 className="h4">Offer</h2>
          <p>
            {booking.offer.code || booking.offer.title} · −{formatPrice(booking.offer.amount)} · funded by {booking.offer.funder === 'platform' ? 'Atlas' : supplier?.name}
          </p>
        </section>
      )}
      <section className="card">
        <h2 className="h4">Payments</h2>
        <ul className="small">
          {payments.map((p) => (
            <li key={p._id}>
              {formatDateTime(p.timestamp)} · {p.method.toUpperCase()} · {formatPrice(p.amount)} · {p.status} · {p.transactionId}
            </li>
          ))}
        </ul>
      </section>
      {tickets.length > 0 && (
        <section className="card">
          <h2 className="h4">Tickets</h2>
          <ul className="small">
            {tickets.map((t) => (
              <li key={t._id}>
                <Link to={`/admin/tickets/${t._id}`}>{TICKET_STATUS[t.status]?.label || t.status}</Link> · {t.messages.length} messages
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
