import { Link } from 'react-router-dom';
import { RatingBadge } from './Rating.jsx';
import { formatDuration, formatPrice, formatTime, stopsLabel } from '../lib/format.js';

// Calendar day in IST, so "+1" is correct regardless of the viewer's timezone.
const istDay = (date) => Math.floor((new Date(date).getTime() + 5.5 * 3600 * 1000) / 86400000);

export default function FlightCard({ flight, travellers, cabin }) {
  const plusDays = istDay(flight.arrivalTime) - istDay(flight.departureTime);
  const href = `/flights/${flight._id}?${new URLSearchParams({ travellers, cabin })}`;
  return (
    // Whole card is clickable, same pattern as HotelCard: overlay link under the real button.
    <article className="result-card flight-card clickable-card fade-in">
      <Link to={href} className="card-overlay-link" tabIndex={-1} aria-hidden="true" />
      <div className="flight-card-airline">
        <h2 className="result-title">{flight.airline}</h2>
        <p className="small muted">
          {flight.flightNumber} · {flight.aircraftType}
        </p>
        <RatingBadge rating={flight.rating} />
      </div>

      <div className="flight-timeline" aria-label={`Departs ${formatTime(flight.departureTime)}, arrives ${formatTime(flight.arrivalTime)}`}>
        <div>
          <p className="time">{formatTime(flight.departureTime)}</p>
          <p className="small muted">{flight.origin.code}</p>
        </div>
        <div className="timeline-mid">
          <p className="small muted">{formatDuration(flight.durationMinutes)}</p>
          <span className="timeline-line" aria-hidden="true" />
          <p className="small">{stopsLabel(flight.stops)}</p>
        </div>
        <div>
          <p className="time">
            {formatTime(flight.arrivalTime)}
            {plusDays > 0 && <sup className="plus-day">+{plusDays}</sup>}
          </p>
          <p className="small muted">{flight.destination.code}</p>
        </div>
      </div>

      <div className="result-price">
        <p className="price">{formatPrice(flight.price)}</p>
        <p className="small muted">per traveller</p>
        <Link
          to={href}
          className="btn btn-secondary btn-sm card-cta"
          aria-label={`View fares for ${flight.airline} ${flight.flightNumber} at ${formatTime(flight.departureTime)}`}
        >
          View fares
        </Link>
      </div>
    </article>
  );
}
