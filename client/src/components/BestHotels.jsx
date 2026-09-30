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
export default function BestHotels({ stayQuery }) {
  const { data, error } = useAsync((signal) => hotelsApi.featured({ limit: 4 }, { signal }), []);
  if (error || (data && data.results.length === 0)) return null;

  return (
    <section className="section best-hotels" id="best-hotels" aria-labelledby="best-heading">
      <div className="section-head">
        <h2 id="best-heading">Best hotels</h2>
        <p className="muted">Four- and five-star stays that guests rate 4.0 or higher.</p>
      </div>
      {!data ? (
        <div className="stay-grid" aria-busy="true" aria-label="Loading best hotels">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 360 }} />
          ))}
        </div>
      ) : (
        <ul className="stay-grid">
          {withDistinctPhotos(data.results).map((h) => (
            <li key={h._id}>
              <StayCard hotel={h} href={`/hotels/${h._id}?${stayQuery}`} price={h.price} priceLabel="per night, from" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
