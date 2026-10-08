import { Link } from 'react-router-dom';
import SmartImage from './SmartImage.jsx';
import { RatingBadge, Stars } from './Rating.jsx';
import { formatPrice } from '../lib/format.js';

// Compact vertical hotel card (similar stays, best hotels). The whole card is one link.
export default function StayCard({ hotel, href, price, priceLabel = 'per night' }) {
  const area = hotel.address?.split(',')[0] || hotel.city;
  return (
    <Link to={href} className="stay-card">
      <SmartImage src={hotel.photo} alt="" caption={hotel.name} className="stay-card-image" sizes="(min-width: 1024px) 300px, 50vw" />
      <div className="stay-card-body">
        <Stars count={hotel.starRating} />
        <h3 className="stay-card-title">{hotel.name}</h3>
        <p className="small muted">
          {area}, {hotel.city}
        </p>
        <RatingBadge rating={hotel.rating} />
        <p className="small stay-card-amenities">{hotel.amenities.filter((a) => !['Free Wi-Fi', 'Air conditioning'].includes(a)).slice(0, 2).join(' · ')}</p>
        {price != null && (
          <p className="stay-card-price">
            <span className="price">{formatPrice(price)}</span>
            <span className="small muted">{priceLabel}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
