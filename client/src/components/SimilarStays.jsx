import StayCard from './StayCard.jsx';
import { hotelsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatDateString, pluralize } from '../lib/format.js';
import Reveal from './Reveal.jsx';

const MAX = 4;

// "Similar stays" (story #18): same city, same party and dates, priced like-for-like.
// Most similar first: closest star rating, then best guest rating.
export default function SimilarStays({ hotel, stay, nights }) {
  const stayKey = JSON.stringify(stay);
  const { data } = useAsync(
    (signal) => hotelsApi.search({ city: hotel.city, ...stay, limit: 50 }, { signal }),
    [hotel._id, stayKey],
  );

  if (!data) return null; // loads quietly below the fold; errors just hide the section
  const similar = data.results
    .filter((h) => h._id !== hotel._id)
    .sort(
      (a, b) =>
        Math.abs(a.starRating - hotel.starRating) - Math.abs(b.starRating - hotel.starRating) ||
        b.rating.average - a.rating.average,
    )
    .slice(0, MAX);
  if (!similar.length) return null;

  const query = new URLSearchParams(stay).toString();
  const guests = Number(stay.adults) + Number(stay.children);

  return (
    <Reveal as="section" className="similar-stays" aria-labelledby="similar-heading">
      <h2 id="similar-heading">Similar stays in {hotel.city}</h2>
      <p className="muted">
        Prices for {pluralize(nights, 'night')}, {formatDateString(stay.checkIn, { year: undefined })} –{' '}
        {formatDateString(stay.checkOut, { year: undefined })}, {pluralize(guests, 'guest')}
        {stay.rooms > 1 ? `, ${pluralize(stay.rooms, 'room')}` : ''}. Taxes shown separately.
      </p>
      <ul className="stay-grid">
        {similar.map((h) => (
          <li key={h._id}>
            <StayCard hotel={h} href={`/hotels/${h._id}?${query}`} price={h.price} priceLabel="avg per night" />
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
