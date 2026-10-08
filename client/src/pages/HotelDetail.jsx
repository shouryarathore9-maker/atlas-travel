import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Lightbox from '../components/Lightbox.jsx';
import PriceSummary from '../components/PriceSummary.jsx';
import { RatingBadge, Stars } from '../components/Rating.jsx';
import Reviews from '../components/Reviews.jsx';
import SimilarStays from '../components/SimilarStays.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { ErrorState, SkeletonList } from '../components/States.jsx';
import { hotelsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { saveDraft } from '../lib/checkoutDraft.js';
import { addDays, isDateString, nightsBetween, todayIst } from '../lib/dates.js';
import { formatDateString, formatPrice, pluralize } from '../lib/format.js';
import { hotelBreakdown, roomFits } from '../lib/pricing.js';

function readStay(params) {
  const tomorrow = addDays(todayIst(), 1);
  const checkIn = isDateString(params.get('checkIn')) ? params.get('checkIn') : tomorrow;
  let checkOut = isDateString(params.get('checkOut')) ? params.get('checkOut') : addDays(checkIn, 2);
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
  return {
    checkIn,
    checkOut,
    adults: Math.max(1, Number(params.get('adults')) || 2),
    children: Math.max(0, Number(params.get('children')) || 0),
    rooms: Math.max(1, Number(params.get('rooms')) || 1),
  };
}

export default function HotelDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const stay = readStay(params);
  const { data, error, reload } = useAsync((signal) => hotelsApi.get(id, { checkIn: stay.checkIn, checkOut: stay.checkOut }, { signal }), [id, stay.checkIn, stay.checkOut]);
  useDocumentTitle(data?.hotel?.name || 'Hotel');

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Hotel not found' : undefined} />
      </main>
    );
  }
  // Also show the skeleton while moving from one hotel to another (e.g. via Similar stays).
  if (!data || String(data.hotel._id) !== id || data.stay.checkIn !== stay.checkIn || data.stay.checkOut !== stay.checkOut) {
    return (
      <main id="main" className="container page">
        <SkeletonList count={3} height={200} />
      </main>
    );
  }
  // Keyed by hotel so room selection and the photo viewer reset for each hotel.
  return <HotelBooking key={`${data.hotel._id}-${stay.checkIn}-${stay.checkOut}`} data={data} stay={stay} />;
}

function HotelBooking({ data, stay }) {
  const { hotel, reviews, breakfastPerGuest, supplierCancellation } = data;
  const navigate = useNavigate();
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const guests = stay.adults + stay.children;
  const [selected, setSelected] = useState(null); // { room, plan }
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const photos = (hotel.photos || []).filter(Boolean);
  const [roomCounts, setRoomCounts] = useState(() => Object.fromEntries(hotel.roomTypes.map((r) => [r.name, stay.rooms])));
  const [breakfast, setBreakfast] = useState({});

  const problemFor = (room) => {
    const rooms = roomCounts[room.name];
    if (room.salesStopped) return 'Not available to book right now.';
    if (room.roomsAvailable === 0) return 'Fully booked for now.';
    if (rooms > room.roomsAvailable) return `Only ${pluralize(room.roomsAvailable, 'room')} of this type left.`;
    if (!roomFits(room, { adults: stay.adults, children: stay.children, rooms })) {
      return `${pluralize(rooms, 'room')} can’t fit ${pluralize(stay.adults, 'adult')}${stay.children ? ` and ${pluralize(stay.children, 'child', 'children')}` : ''}. Add rooms.`;
    }
    return null;
  };

  const room = hotel.roomTypes.find((r) => r.name === selected?.room);
  const plan = room?.plans.find((p) => p.key === selected?.plan);
  const rooms = room ? roomCounts[room.name] : stay.rooms;
  const blocked = room ? problemFor(room) : null;
  const withBreakfast = Boolean(room && breakfast[room.name]);
  const breakdown = room && plan && !blocked ? hotelBreakdown({ plan, room, rooms, nights, breakfast: withBreakfast, breakfastPerGuest, guests }) : null;
  const stayQuery = new URLSearchParams({ ...stay, city: hotel.city }).toString();

  function reserve() {
    saveDraft({
      type: 'hotel',
      itemId: hotel._id,
      roomTypeName: room.name,
      ratePlan: plan.key,
      breakfast: withBreakfast,
      rooms,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      adults: stay.adults,
      children: stay.children,
      display: {
        title: hotel.name,
        subtitle: `${room.name} · ${plan.name} · ${pluralize(rooms, 'room')} · ${pluralize(nights, 'night')}`,
        when: `${formatDateString(stay.checkIn)} – ${formatDateString(stay.checkOut)}`,
        policy: plan.terms,
        estimate: breakdown.total,
      },
    });
    navigate('/checkout');
  }

  return (
    <main id="main" className="container page">
      <Link to={`/hotels?${stayQuery}`} className="btn-text back-link">
        ← All stays in {hotel.city}
      </Link>

      <div className="gallery">
        {[0, 1, 2].map((i) => {
          const image = (
            <SmartImage
              src={photos[i]}
              alt={i === 0 ? hotel.name : ''}
              caption={i === 0 ? hotel.name : ''}
              className="gallery-photo"
              eager={i === 0}
              sizes={i === 0 ? '(min-width: 768px) 66vw, 100vw' : '33vw'}
            />
          );
          // Photos open the full-screen viewer (story #17); empty slots stay plain placeholders.
          return photos[i] ? (
            <button
              key={i}
              type="button"
              className={`gallery-item gallery-item-${i} gallery-button`}
              aria-label={`View photo ${i + 1} of ${photos.length} full screen`}
              onClick={() => setLightboxIndex(i)}
            >
              {image}
            </button>
          ) : (
            <div key={i} className={`gallery-item gallery-item-${i}`}>
              {image}
            </div>
          );
        })}
      </div>
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          label={`${hotel.name} photos`}
        />
      )}

      <header className="detail-header">
        <Stars count={hotel.starRating} />
        <h1>{hotel.name}</h1>
        <p className="muted">
          <Icon name="location" size={16} /> {hotel.address}
        </p>
        <div className="row">
          <RatingBadge rating={hotel.rating} />
          <span className="small">
            {formatDateString(stay.checkIn, { year: undefined })} – {formatDateString(stay.checkOut, { year: undefined })} ·{' '}
            {pluralize(stay.adults + stay.children, 'guest')}
          </span>
        </div>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          {hotel.description && <p className="lede">{hotel.description}</p>}

          <section className="detail-section" aria-labelledby="amenities-heading">
            <h2 id="amenities-heading">Amenities</h2>
            <ul className="amenity-list">
              {hotel.amenities.map((a) => (
                <li key={a}>
                  <Icon name="check" size={16} /> {a}
                </li>
              ))}
            </ul>
          </section>

          <section className="detail-section" aria-labelledby="rooms-heading">
            <h2 id="rooms-heading">Choose your room</h2>
            <p className="small muted">Average price per room per night for your {pluralize(nights, 'night')}; taxes shown separately.</p>
            <div className="room-list">
              {hotel.roomTypes.map((r) => {
                const problem = problemFor(r);
                const maxRooms = Math.max(1, Math.min(8, r.roomsAvailable + 2));
                return (
                  <article key={r.name} className={`room-card ${selected?.room === r.name ? 'is-selected' : ''}`}>
                    <div className="room-card-main">
                      <h3>{r.name}</h3>
                      <p className="small">
                        Sleeps {pluralize(r.occupancy.adults, 'adult')}
                        {r.occupancy.children ? ` + ${pluralize(r.occupancy.children, 'child', 'children')}` : ''} · {r.bedType}
                      </p>
                      <p className="small muted">{r.amenities.join(' · ')}</p>
                      <div className="row">
                        {r.breakfastIncluded ? <span className="badge badge-olive">Breakfast included</span> : <span className="badge badge-muted">Room only</span>}
                      </div>
                      {!r.breakfastIncluded && breakfastPerGuest > 0 && (
                        <label className="checkbox small">
                          <input type="checkbox" checked={Boolean(breakfast[r.name])} onChange={(e) => setBreakfast((b) => ({ ...b, [r.name]: e.target.checked }))} /> Add breakfast (
                          {formatPrice(breakfastPerGuest)} per guest per night)
                        </label>
                      )}
                      <div className="field room-count">
                        <label htmlFor={`rooms-${r.name}`} className="small">
                          Rooms
                        </label>
                        <select
                          id={`rooms-${r.name}`}
                          className="select"
                          value={roomCounts[r.name]}
                          onChange={(e) => setRoomCounts((c) => ({ ...c, [r.name]: Number(e.target.value) }))}
                          aria-describedby={problem ? `room-problem-${r.name}` : undefined}
                          aria-invalid={problem ? 'true' : undefined}
                        >
                          {Array.from({ length: maxRooms }, (_, i) => (
                            <option key={i} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                      {problem && (
                        <p className="field-error small" id={`room-problem-${r.name}`}>
                          {problem}
                        </p>
                      )}
                    </div>
                    <div className="rate-plans">
                      {r.plans.map((p) => {
                        const isSelected = selected?.room === r.name && selected?.plan === p.key;
                        return (
                          <div key={p.key} className={`rate-plan ${isSelected ? 'is-selected' : ''}`}>
                            <div className="rate-plan-terms">
                              <p className="rate-plan-name">
                                {p.name} {p.freeCancellation && <span className="badge badge-success">Free cancellation</span>}
                              </p>
                              <p className="small muted">{p.terms}</p>
                            </div>
                            <div className="rate-plan-price">
                              <p className="price">{formatPrice(p.avgNightly)}</p>
                              <p className="small muted">
                                avg per night + {formatPrice(r.taxesAndFees)} taxes · {formatPrice(p.perRoom)} per room for the stay
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-pressed={isSelected}
                              aria-label={`${isSelected ? 'Selected' : 'Select'} ${r.name}, ${p.name}`}
                              disabled={r.roomsAvailable === 0 || r.salesStopped}
                              onClick={() => setSelected(isSelected ? null : { room: r.name, plan: p.key })}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="supplier-promise small">
              <strong>If the hotel cancels.</strong> {supplierCancellation}
            </p>
          </section>

          <Reviews itemType="hotel" itemId={hotel._id} rating={hotel.rating} initialReviews={reviews} />
        </div>

        <PriceSummary
          title="Your stay"
          lines={
            breakdown
              ? [
                  { label: `Room charges (${pluralize(rooms, 'room')} × ${pluralize(nights, 'night')})`, amount: breakdown.base },
                  breakdown.breakfast ? { label: 'Breakfast', amount: breakdown.breakfast } : null,
                  { label: 'Taxes', amount: breakdown.taxes },
                ]
              : []
          }
          total={breakdown?.total || 0}
          note={
            blocked ||
            (plan ? (
              <>
                {plan.terms}
                <details className="night-by-night">
                  <summary>Night-by-night</summary>
                  <ul>
                    {plan.nights.map((n) => (
                      <li key={n.date}>
                        {formatDateString(n.date, { weekday: 'short', year: undefined })}: {formatPrice(n.price)} per room
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              'Select a room and rate to continue.'
            ))
          }
          action={
            <button type="button" className="btn btn-primary btn-block" disabled={!breakdown} onClick={reserve}>
              Reserve
            </button>
          }
        />
      </div>

      <SimilarStays hotel={hotel} stay={stay} nights={nights} />
    </main>
  );
}
