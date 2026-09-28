import { Link } from 'react-router-dom';
import SmartImage from './SmartImage.jsx';
import { RatingBadge, Stars } from './Rating.jsx';
import { formatPrice, pluralize } from '../lib/format.js';

export default function HotelCard({ hotel, stayQuery }) {
  return (
    <article className="result-card hotel-card fade-in">
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
          <h3 className="result-title">{hotel.name}</h3>
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
        <Link to={`/hotels/${hotel._id}?${stayQuery}`} className="btn btn-secondary btn-sm" aria-label={`See rooms at ${hotel.name}`}>
          See rooms
        </Link>
      </div>
    </article>
  );
}
