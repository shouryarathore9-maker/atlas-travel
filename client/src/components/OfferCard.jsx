import { Link } from 'react-router-dom';
import SmartImage from './SmartImage.jsx';
import { formatDateString } from '../lib/format.js';

export const SCOPE_LABEL = { flights: 'Flights', hotels: 'Hotels', both: 'Flights & hotels' };

// An offer in the same calm card style as featured destinations (design.md → Offers stay calm):
// photo, product label, serif title, one line, the code in a quiet chip, a plain expiry date.
export default function OfferCard({ offer }) {
  return (
    <Link to={`/offers/${offer.slug}`} className="offer-card">
      <SmartImage src={offer.image} alt="" caption={offer.title} className="offer-card-image" sizes="(min-width: 1024px) 300px, 50vw" />
      <div className="offer-card-body">
        <p className="eyebrow">{SCOPE_LABEL[offer.scope]}</p>
        <h3 className="offer-card-title">{offer.title}</h3>
        <p className="small">{offer.summary}</p>
        <div className="offer-card-foot">
          {offer.code ? <span className="code-chip">{offer.code}</span> : <span className="small muted">Applied automatically</span>}
          <span className="small muted">Until {formatDateString(offer.validTo, { year: 'numeric' })}</span>
        </div>
      </div>
    </Link>
  );
}
