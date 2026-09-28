import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PriceSummary from '../components/PriceSummary.jsx';
import { RatingBadge, Stars } from '../components/Rating.jsx';
import Reviews from '../components/Reviews.jsx';
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

function cancellationText(policy, price) {
  if (policy.freeUntilDaysBeforeCheckIn > 0) {
    return `Free cancellation until ${pluralize(policy.freeUntilDaysBeforeCheckIn, 'day')} before check-in; after that, ${formatPrice(policy.feeAfterCutoff)} fee.`;
  }
  return `Non-refundable window: ${formatPrice(policy.feeAfterCutoff ?? price)} fee on cancellation.`;
}

export default function HotelDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, error, reload } = useAsync((signal) => hotelsApi.get(id, { signal }), [id]);
  useDocumentTitle(data?.hotel?.name || 'Hotel');

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Hotel not found' : undefined} />
      </main>
    );
  }
  if (!data) {
    return (
      <main id="main" className="container page">
        <SkeletonList count={3} height={200} />
      </main>
    );
  }
  return <HotelBooking hotel={data.hotel} reviews={data.reviews} stay={readStay(params)} />;
}

function HotelBooking({ hotel, reviews, stay }) {
  const navigate = useNavigate();
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const [selected, setSelected] = useState(null);
  const [roomCounts, setRoomCounts] = useState(() => Object.fromEntries(hotel.roomTypes.map((r) => [r.name, stay.rooms])));

  const problemFor = (room) => {
    const rooms = roomCounts[room.name];
    if (room.roomsAvailable === 0) return 'Fully booked for now.';
    if (rooms > room.roomsAvailable) return `Only ${pluralize(room.roomsAvailable, 'room')} of this type left.`;
    if (!roomFits(room, { adults: stay.adults, children: stay.children, rooms })) {
      return `${pluralize(rooms, 'room')} can’t fit ${pluralize(stay.adults, 'adult')}${stay.children ? ` and ${pluralize(stay.children, 'child', 'children')}` : ''}. Add rooms.`;
    }
    return null;
  };

  const room = hotel.roomTypes.find((r) => r.name === selected);
  const rooms = room ? roomCounts[room.name] : stay.rooms;
  const blocked = room ? problemFor(room) : null;
  const breakdown = room && !blocked ? hotelBreakdown(room, rooms, nights) : null;
  const stayQuery = new URLSearchParams({ ...stay, city: hotel.city }).toString();

  function reserve() {
    saveDraft({
      type: 'hotel',
      itemId: hotel._id,
      roomTypeName: room.name,
      rooms,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      adults: stay.adults,
      children: stay.children,
      display: {
        title: hotel.name,
        subtitle: `${room.name} · ${pluralize(rooms, 'room')} · ${pluralize(nights, 'night')}`,
        when: `${formatDateString(stay.checkIn)} – ${formatDateString(stay.checkOut)}`,
        breakdown,
        policy: cancellationText(room.cancellationPolicy, room.price),
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
        {[0, 1, 2].map((i) => (
          <SmartImage
            key={i}
            src={hotel.photos?.[i]}
            alt={i === 0 ? hotel.name : ''}
            caption={i === 0 ? hotel.name : ''}
            className={`gallery-item gallery-item-${i}`}
            eager={i === 0}
            sizes={i === 0 ? '(min-width: 768px) 66vw, 100vw' : '33vw'}
          />
        ))}
      </div>

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
            <p className="small muted">
              Prices for {pluralize(nights, 'night')}; taxes shown separately.
            </p>
            <div className="room-list">
              {hotel.roomTypes.map((r) => {
                const problem = problemFor(r);
                const isSelected = selected === r.name;
                const maxRooms = Math.max(1, Math.min(8, r.roomsAvailable + 2));
                return (
                  <article key={r.name} className={`room-card ${isSelected ? 'is-selected' : ''}`}>
                    <div className="room-card-main">
                      <h3>{r.name}</h3>
                      <p className="small">
                        Sleeps {pluralize(r.occupancy.adults, 'adult')}
                        {r.occupancy.children ? ` + ${pluralize(r.occupancy.children, 'child', 'children')}` : ''} · {r.bedType}
                      </p>
                      <p className="small muted">{r.amenities.join(' · ')}</p>
                      <div className="row">
                        {r.breakfastIncluded ? <span className="badge badge-olive">Breakfast included</span> : <span className="badge badge-muted">Room only</span>}
                        {r.cancellationPolicy.freeUntilDaysBeforeCheckIn > 0 && <span className="badge badge-success">Free cancellation</span>}
                      </div>
                      <p className="small">{cancellationText(r.cancellationPolicy, r.price)}</p>
                    </div>
                    <div className="room-card-side">
                      <p className="price">{formatPrice(r.price)}</p>
                      <p className="small muted">per room / night + {formatPrice(r.taxesAndFees)} taxes</p>
                      <div className="field">
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
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-pressed={isSelected}
                        disabled={r.roomsAvailable === 0}
                        onClick={() => setSelected(isSelected ? null : r.name)}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <Reviews itemType="hotel" itemId={hotel._id} rating={hotel.rating} initialReviews={reviews} />
        </div>

        <PriceSummary
          title="Your stay"
          lines={
            breakdown
              ? [
                  { label: `${formatPrice(room.price)} × ${pluralize(rooms, 'room')} × ${pluralize(nights, 'night')}`, amount: breakdown.base },
                  { label: 'Taxes & fees', amount: breakdown.taxes },
                ]
              : []
          }
          total={breakdown?.total || 0}
          note={blocked || (room ? cancellationText(room.cancellationPolicy, room.price) : 'Select a room to continue.')}
          action={
            <button type="button" className="btn btn-primary btn-block" disabled={!breakdown} onClick={reserve}>
              Reserve
            </button>
          }
        />
      </div>
    </main>
  );
}
