import { formatDate, formatDateTime, formatPrice } from '../lib/format.js';

export function cancellationLabel(booking) {
  if (booking.status !== 'cancelled') return null;
  return booking.cancellation?.by === 'supplier' ? `Cancelled by the ${booking.type === 'flight' ? 'airline' : 'hotel'}` : 'Cancelled by you';
}

export default function BookingSummary({ booking }) {
  const isFlight = booking.type === 'flight';
  const f = booking.fareBreakdown;
  const policy = booking.policySnapshot || {};
  const reply = booking.specialRequest?.reply;
  return (
    <section className="card booking-summary" aria-label="Trip summary">
      <div className="spread">
        <div>
          <p className="eyebrow">
            {isFlight ? 'Flight' : 'Stay'}
            {booking.pnr && ` · PNR ${booking.pnr}`}
          </p>
          <h2 className="h3">{booking.itemSummary.title}</h2>
          <p className="small">{booking.itemSummary.subtitle}</p>
        </div>
        <span className={`badge ${booking.status === 'confirmed' ? 'badge-success' : booking.cancellation?.by === 'supplier' ? 'badge-error' : 'badge-muted'}`}>
          {cancellationLabel(booking) || 'Confirmed'}
        </span>
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
            {booking.travellers.map((t, i) => (
              <span key={`${t.name}-${i}`} className="block">
                {t.name}
                {t.ageCategory && t.ageCategory !== 'adult' && ` (${t.ageCategory})`}
                {t.seat && ` · seat ${t.seat}`}
                {t.meal && ` · ${t.meal}`}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Cancellation</dt>
          <dd>
            {policy.terms ||
              (policy.freeUntil ? `Free until ${formatDateTime(policy.freeUntil)}` : `${formatPrice(policy.feeAfterCutoff || 0)} fee applies`)}
            {policy.freeUntil && new Date(policy.freeUntil) > new Date() && booking.status === 'confirmed' && (
              <span className="block small muted">Free until {formatDateTime(policy.freeUntil)}</span>
            )}
          </dd>
        </div>
        {booking.specialRequest?.text && (
          <div>
            <dt>Special request</dt>
            <dd>
              {booking.specialRequest.text}
              <span className="block small muted">
                {reply ? `${reply.status === 'accepted' ? 'Accepted' : 'Can’t accommodate'} by ${reply.by}${reply.comment ? ` — “${reply.comment}”` : ''}` : 'Waiting for a reply'}
              </span>
            </dd>
          </div>
        )}
      </dl>

      <dl className="price-lines">
        <div className="price-line">
          <dt>{isFlight ? 'Base fare' : 'Room charges'}</dt>
          <dd>{formatPrice(f.base)}</dd>
        </div>
        {f.discounts > 0 && (
          <div className="price-line price-line-offer">
            <dt>{booking.offer?.code || booking.offer?.title || 'Offer'}</dt>
            <dd>−{formatPrice(f.discounts)}</dd>
          </div>
        )}
        {f.infantFees > 0 && (
          <div className="price-line">
            <dt>Infant fees</dt>
            <dd>{formatPrice(f.infantFees)}</dd>
          </div>
        )}
        {f.addons > 0 && (
          <div className="price-line">
            <dt>{isFlight ? 'Seats & meals' : 'Breakfast'}</dt>
            <dd>{formatPrice(f.addons)}</dd>
          </div>
        )}
        <div className="price-line">
          <dt>Taxes</dt>
          <dd>{formatPrice(f.taxes)}</dd>
        </div>
        <div className="price-line price-total">
          <dt>Paid</dt>
          <dd>
            {formatPrice(f.total)}
          </dd>
        </div>
        {booking.status === 'cancelled' && booking.cancellation?.refundAmount !== undefined && (
          <div className="price-line">
            <dt>Simulated refund{booking.cancellation.receiptNo ? ` · ${booking.cancellation.receiptNo}` : ''}</dt>
            <dd>{formatPrice(booking.cancellation.refundAmount)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
