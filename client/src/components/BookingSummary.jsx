import { formatDate, formatDateTime, formatPrice } from '../lib/format.js';

export default function BookingSummary({ booking }) {
  const isFlight = booking.type === 'flight';
  const f = booking.fareBreakdown;
  return (
    <section className="card booking-summary" aria-label="Trip summary">
      <div className="spread">
        <div>
          <p className="eyebrow">{isFlight ? 'Flight' : 'Stay'}</p>
          <h2 className="h3">{booking.itemSummary.title}</h2>
          <p className="small">{booking.itemSummary.subtitle}</p>
        </div>
        <span className={`badge ${booking.status === 'confirmed' ? 'badge-success' : 'badge-muted'}`}>{booking.status}</span>
      </div>

      <dl className="facts">
        <div>
          <dt>{isFlight ? 'Departs' : 'Check-in'}</dt>
          <dd>{isFlight ? formatDateTime(booking.travelDates.start) : formatDate(booking.travelDates.start, { weekday: 'short' })}</dd>
        </div>
        <div>
          <dt>{isFlight ? 'Arrives' : 'Check-out'}</dt>
          <dd>{isFlight ? formatDateTime(booking.travelDates.end) : formatDate(booking.travelDates.end, { weekday: 'short' })}</dd>
        </div>
        <div>
          <dt>{isFlight ? 'Travellers' : 'Guest'}</dt>
          <dd>
            {booking.travellers.map((t) => (
              <span key={t.name + (t.seat || '')} className="block">
                {t.name}
                {t.seat && ` · seat ${t.seat}`}
                {t.meal && ` · ${t.meal}`}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Free cancellation until</dt>
          <dd>
            {booking.policySnapshot?.freeUntil && new Date(booking.policySnapshot.freeUntil) > new Date(booking.createdAt)
              ? formatDateTime(booking.policySnapshot.freeUntil)
              : `Not available — ${formatPrice(booking.policySnapshot?.feeAfterCutoff || 0)} fee applies`}
          </dd>
        </div>
      </dl>

      <dl className="price-lines">
        <div className="price-line">
          <dt>Base</dt>
          <dd>{formatPrice(f.base)}</dd>
        </div>
        <div className="price-line">
          <dt>Taxes &amp; fees</dt>
          <dd>{formatPrice(f.taxes)}</dd>
        </div>
        {f.addons > 0 && (
          <div className="price-line">
            <dt>Seats &amp; meals</dt>
            <dd>{formatPrice(f.addons)}</dd>
          </div>
        )}
        <div className="price-line price-total">
          <dt>Paid</dt>
          <dd>{formatPrice(f.total)}</dd>
        </div>
        {booking.cancellation?.refundAmount !== undefined && booking.status === 'cancelled' && (
          <div className="price-line">
            <dt>Simulated refund</dt>
            <dd>{formatPrice(booking.cancellation.refundAmount)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
