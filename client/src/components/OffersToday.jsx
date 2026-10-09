import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import OfferCard from './OfferCard.jsx';
import Reveal from './Reveal.jsx';
import { offersApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';

// Homepage "Offers available today" (story #21), directly above Featured destinations.
// Hidden when nothing is active or the list fails to load — it's never in the way.
export default function OffersToday() {
  const { data, error } = useAsync((signal) => offersApi.list({ limit: 4 }, { signal }), []);
  // Hold the space while loading so the page below doesn't jump (CLS).
  if (!data && !error) return <div className="section offers-section offers-placeholder" aria-hidden="true" />;
  if (!data?.offers?.length) return null;
  return (
    <section className="section offers-section" id="offers" aria-labelledby="offers-heading">
      <Reveal className="spread section-head">
        <div>
          <h2 id="offers-heading">Offers available today</h2>
          <p className="muted">One offer per booking, shown before you pay. No countdowns.</p>
        </div>
        <Link to="/offers" className="btn-text view-all">
          View all <Icon name="arrowRight" size={16} />
        </Link>
      </Reveal>
      <ul className="offer-grid">
        {data.offers.slice(0, 4).map((o) => (
          <Reveal as="li" key={o._id}>
            <OfferCard offer={o} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
