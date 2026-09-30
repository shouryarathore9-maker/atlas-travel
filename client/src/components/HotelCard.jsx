import { Link } from 'react-router-dom';
import SmartImage from './SmartImage.jsx';
import { RatingBadge, Stars } from './Rating.jsx';
import { formatPrice, pluralize } from '../lib/format.js';

// The whole card is clickable (story #16) via an invisible overlay link that sits *under* the
// "See rooms" button. Pointer users can click anywhere; the button keeps its own pressed state;
// keyboard and screen-reader users get exactly one link (the button), so no duplicate tab stops.
export default function HotelCard({ hotel, stayQuery }) {
  const href = `/hotels/${hotel._id}?${stayQuery}`;
  return (
    <article className="result-card hotel-card clickable-card fade-in">
      <Link to={href} className="card-overlay-link" tabIndex={-1} aria-hidden="true" />
      <SmartImage
        src={hotel.photo}
        alt={`${hotel.name}`}
        caption={hotel.name}
        className="hotel-card-image"
        sizes="(min-width: 768px) 260px, 100vw"
      />
      <div className="hotel-card-body">
        <div>
          <Stars count={hotel.starRating} />
          <h2 className="result-title">{hotel.name}</h2>
          <p className="small muted">{hotel.address}</p>
        </div>
        <RatingBadge rating={hotel.rating} />
        <p className="small">{hotel.amenities.slice(0, 4).join(' · ')}</p>
        <div className="row">
          {hotel.freeCancellation && <span className="badge badge-success">Free cancellation</span>}
          {hotel.breakfastIncluded && <span className="badge badge-olive">Breakfast included</span>}
        </div>
      </div>
      <div className="result-price">
        <p className="price">{formatPrice(hotel.price)}</p>
        <p className="small muted">per night, before taxes</p>
        <p className="small muted">{pluralize(hotel.nights, 'night')}</p>
        <Link to={href} className="btn btn-secondary btn-sm card-cta" aria-label={`See rooms at ${hotel.name}`}>
          See rooms
        </Link>
      </div>
    </article>
  );
}
