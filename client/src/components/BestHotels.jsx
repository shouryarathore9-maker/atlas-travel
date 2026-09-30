import { useState } from 'react';
import Icon from './Icon.jsx';
import StayCard from './StayCard.jsx';
import { hotelsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';

// Seed hotels share a small photo pool, so show each hotel's first photo not already used in this row.
function withDistinctPhotos(hotels) {
  const used = new Set();
  return hotels.map((h) => {
    const photo = h.photos?.find((p) => !used.has(p)) || h.photo;
    used.add(photo);
    return { ...h, photo };
  });
}

// Homepage "Best hotels" (story #19): 4★+ hotels with a 4.0+ guest rating, best-rated first.
// `stayQuery` gives each card a default stay (the same defaults the destination tiles use).
const SHOWN = 4;
const MAX = 10; // "View all" reveals up to the top 10

export default function BestHotels({ stayQuery }) {
  const [showAll, setShowAll] = useState(false);
  const { data, error } = useAsync((signal) => hotelsApi.featured({ limit: MAX }, { signal }), []);
  if (error || (data && data.results.length === 0)) return null;
  const hotels = data ? withDistinctPhotos(data.results) : [];
  const visible = showAll ? hotels : hotels.slice(0, SHOWN);

  return (
    <section className="section best-hotels" id="best-hotels" aria-labelledby="best-heading">
      <div className="spread section-head">
        <div>
          <h2 id="best-heading">Best hotels</h2>
          <p className="muted">Four- and five-star stays that guests rate 4.0 or higher.</p>
        </div>
        {hotels.length > SHOWN && (
          <button type="button" className="btn-text view-all" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
            {showAll ? 'Show fewer' : 'View all'} <Icon name="arrowRight" size={16} />
          </button>
        )}
      </div>
      {!data ? (
        <div className="stay-grid" aria-busy="true" aria-label="Loading best hotels">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 360 }} />
          ))}
        </div>
      ) : (
        <ul className="stay-grid">
          {visible.map((h) => (
            <li key={h._id}>
              <StayCard hotel={h} href={`/hotels/${h._id}?${stayQuery}`} price={h.price} priceLabel="per night, from" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
