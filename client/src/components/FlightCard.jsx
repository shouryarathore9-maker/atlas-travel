import { Link } from 'react-router-dom';
import { RatingBadge } from './Rating.jsx';
import { formatDuration, formatPrice, formatTime, stopsLabel } from '../lib/format.js';

// Calendar day in IST, so "+1" is correct regardless of the viewer's timezone.
const istDay = (date) => Math.floor((new Date(date).getTime() + 5.5 * 3600 * 1000) / 86400000);

export default function FlightCard({ flight, travellers, cabin }) {
  const plusDays = istDay(flight.arrivalTime) - istDay(flight.departureTime);
  return (
    <article className="result-card flight-card fade-in">
      <div className="flight-card-airline">
        <h3 className="result-title">{flight.airline}</h3>
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
          to={`/flights/${flight._id}?${new URLSearchParams({ travellers, cabin })}`}
          className="btn btn-secondary btn-sm"
          aria-label={`View fares for ${flight.airline} ${flight.flightNumber} at ${formatTime(flight.departureTime)}`}
        >
          View fares
        </Link>
      </div>
    </article>
  );
}
