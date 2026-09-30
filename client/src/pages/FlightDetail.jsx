import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FlightRouteMap from '../components/FlightRouteMap.jsx';
import Icon from '../components/Icon.jsx';
import PriceSummary from '../components/PriceSummary.jsx';
import { RatingBadge } from '../components/Rating.jsx';
import Reviews from '../components/Reviews.jsx';
import SeatMap from '../components/SeatMap.jsx';
import { Banner, ErrorState, SkeletonList } from '../components/States.jsx';
import { flightsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { saveDraft } from '../lib/checkoutDraft.js';
import { formatDateTime, formatDuration, formatPrice, formatTime, pluralize, stopsLabel } from '../lib/format.js';
import { flightBreakdown, seatPrice } from '../lib/pricing.js';

function cancellationText(policy) {
  if (policy.freeUntilHoursBeforeDeparture > 0) {
    return `Free cancellation until ${policy.freeUntilHoursBeforeDeparture}h before departure, then ${formatPrice(policy.feeAfterCutoff)} fee.`;
  }
  return `Cancellation fee ${formatPrice(policy.feeAfterCutoff)} per booking.`;
}

export default function FlightDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const count = Math.min(9, Math.max(1, Number(params.get('travellers')) || 1));
  const cabin = params.get('cabin') === 'business' ? 'business' : 'economy';
  const { data, error, reload } = useAsync((signal) => flightsApi.get(id, { signal }), [id]);
  const flight = data?.flight;
  useDocumentTitle(flight ? `${flight.airline} ${flight.flightNumber}` : 'Flight');

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Flight not found' : undefined} />
      </main>
    );
  }
  if (!flight) {
    return (
      <main id="main" className="container page">
        <SkeletonList count={3} height={180} />
      </main>
    );
  }
  return <FlightBooking flight={flight} reviews={data.reviews} count={count} cabin={cabin} />;
}

function FlightBooking({ flight, reviews, count, cabin }) {
  const navigate = useNavigate();
  const fares = useMemo(
    () => flight.fareOptions.filter((f) => (cabin === 'business' ? f.type === 'Business' : f.type !== 'Business')),
    [flight, cabin],
  );
  const firstBookable = fares.find((f) => f.seatsAvailable >= count);
  const [fareType, setFareType] = useState(firstBookable?.type || '');
  const [travellers, setTravellers] = useState(() => Array.from({ length: count }, () => ({ seat: '', meal: '' })));
  const [active, setActive] = useState(0);

  const departed = new Date(flight.departureTime) <= new Date();
  const fare = fares.find((f) => f.type === fareType);
  const breakdown = fare ? flightBreakdown(flight, fareType, travellers) : null;
  const assigned = travellers.map((t) => t.seat);

  function selectSeat(label) {
    const next = travellers.map((t) => ({ ...t }));
    const owner = next.findIndex((t) => t.seat === label);
    if (owner >= 0) {
      next[owner].seat = ''; // clicking a chosen seat releases it
      setActive(owner);
    } else {
      next[active].seat = label;
      const nextEmpty = next.findIndex((t, i) => i > active && !t.seat);
      if (nextEmpty >= 0) setActive(nextEmpty);
    }
    setTravellers(next);
  }

  function setMeal(index, meal) {
    setTravellers((list) => list.map((t, i) => (i === index ? { ...t, meal } : t)));
  }

  function continueToCheckout() {
    saveDraft({
      type: 'flight',
      itemId: flight._id,
      fareType,
      travellers,
      display: {
        title: `${flight.origin.city} → ${flight.destination.city}`,
        subtitle: `${flight.airline} ${flight.flightNumber} · ${fareType}`,
        when: formatDateTime(flight.departureTime),
        breakdown,
      },
    });
    navigate('/checkout');
  }

  return (
    <main id="main" className="container page">
      <button type="button" className="btn-text back-link" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="flight-header">
      <header className="detail-header">
        <p className="eyebrow">
          {flight.airline} · {flight.flightNumber} · {flight.aircraftType}
        </p>
        <h1>
          {flight.origin.city} <span className="muted">to</span> {flight.destination.city}
        </h1>
        <div className="flight-hero-times">
          <div>
            <p className="time-lg">{formatTime(flight.departureTime)}</p>
            <p className="small muted">
              {flight.origin.code} · {flight.origin.airport}
            </p>
          </div>
          <div className="timeline-mid">
            <p className="small muted">{formatDuration(flight.durationMinutes)}</p>
            <span className="timeline-line" aria-hidden="true" />
            <p className="small">{stopsLabel(flight.stops)}</p>
          </div>
          <div>
            <p className="time-lg">{formatTime(flight.arrivalTime)}</p>
            <p className="small muted">
              {flight.destination.code} · {flight.destination.airport}
            </p>
          </div>
        </div>
        <div className="row">
          <span className="small">{formatDateTime(flight.departureTime)}</span>
          <RatingBadge rating={flight.rating} />
        </div>
      </header>
      <FlightRouteMap origin={flight.origin} destination={flight.destination} />
      </div>

      {departed && (
        <Banner tone="error">
          <p>This flight has already departed and can no longer be booked.</p>
        </Banner>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-section" aria-labelledby="fares-heading">
            <h2 id="fares-heading">Choose a fare</h2>
            {fares.length === 0 && <p className="muted">This flight has no {cabin} fares. Go back and try another cabin.</p>}
            <div className="fare-grid" role="radiogroup" aria-labelledby="fares-heading">
              {fares.map((f) => {
                const soldOut = f.seatsAvailable < count;
                return (
                  <label key={f.type} className={`fare-card ${fareType === f.type ? 'is-selected' : ''} ${soldOut ? 'is-disabled' : ''}`}>
                    <input
                      type="radio"
                      name="fare"
                      className="sr-only"
                      value={f.type}
                      checked={fareType === f.type}
                      disabled={soldOut}
                      onChange={() => setFareType(f.type)}
                    />
                    <span className="fare-name">{f.type}</span>
                    <span className="price">{formatPrice(f.price)}</span>
                    <span className="small muted">per traveller</span>
                    <ul className="fare-facts small">
                      <li>
                        <Icon name="suitcase" size={16} /> {f.cabinBaggageKg} kg cabin · {f.checkinBaggageKg} kg check-in
                      </li>
                      <li>{cancellationText(f.cancellationPolicy)}</li>
                      <li>{f.dateChangeFee ? `Date change ${formatPrice(f.dateChangeFee)}` : 'Free date change'}</li>
                    </ul>
                    {soldOut && <span className="small field-error">Not enough seats for {pluralize(count, 'traveller')}</span>}
                  </label>
                );
              })}
            </div>
          </section>

          <section className="detail-section" aria-labelledby="seats-heading">
            <h2 id="seats-heading">Pick your seats</h2>
            <p className="muted small">Optional — skip it and a free seat is assigned at check-in.</p>
            {count > 1 && (
              <div className="traveller-tabs" role="group" aria-label="Choosing a seat for">
                {travellers.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-pressed={active === i}
                    onClick={() => setActive(i)}
                  >
                    Traveller {i + 1}: {t.seat || 'no seat'}
                  </button>
                ))}
              </div>
            )}
            <SeatMap seatMap={flight.seatMap} assigned={assigned} onSelect={selectSeat} />
            <p className="small" aria-live="polite">
              {travellers.map((t, i) => (t.seat ? `Traveller ${i + 1}: ${t.seat} (${seatPrice(t.seat, flight.seatMap) ? formatPrice(seatPrice(t.seat, flight.seatMap)) : 'free'})` : null)).filter(Boolean).join(' · ') ||
                'No seats selected yet.'}
            </p>
          </section>

          <section className="detail-section" aria-labelledby="meals-heading">
            <h2 id="meals-heading">Add a meal</h2>
            <p className="muted small">Optional. Pre-booked meals are served first.</p>
            <div className="form-grid cols-2">
              {travellers.map((t, i) => (
                <div className="field" key={i}>
                  <label htmlFor={`meal-${i}`}>Meal for traveller {i + 1}</label>
                  <select id={`meal-${i}`} className="select" value={t.meal} onChange={(e) => setMeal(i, e.target.value)}>
                    <option value="">No meal selected</option>
                    {flight.mealOptions.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.isVeg ? 'veg' : 'non-veg'}) — {formatPrice(m.price)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          {fare && (
            <section className="detail-section" aria-labelledby="policy-heading">
              <h2 id="policy-heading">Baggage &amp; cancellation</h2>
              <dl className="facts">
                <div>
                  <dt>Cabin baggage</dt>
                  <dd>{fare.cabinBaggageKg} kg per traveller</dd>
                </div>
                <div>
                  <dt>Check-in baggage</dt>
                  <dd>{fare.checkinBaggageKg} kg per traveller</dd>
                </div>
                <div>
                  <dt>Cancellation</dt>
                  <dd>{cancellationText(fare.cancellationPolicy)}</dd>
                </div>
                <div>
                  <dt>Date change</dt>
                  <dd>{fare.dateChangeFee ? formatPrice(fare.dateChangeFee) : 'Free'}</dd>
                </div>
              </dl>
            </section>
          )}

          <Reviews itemType="flight" itemId={flight._id} rating={flight.rating} initialReviews={reviews} />
        </div>

        <PriceSummary
          lines={
            breakdown
              ? [
                  { label: `${fareType} fare × ${count}`, amount: breakdown.base },
                  { label: 'Taxes & fees', amount: breakdown.taxes },
                  breakdown.seats ? { label: 'Seats', amount: breakdown.seats } : null,
                  breakdown.meals ? { label: 'Meals', amount: breakdown.meals } : null,
                ]
              : []
          }
          total={breakdown?.total || 0}
          note={fare ? cancellationText(fare.cancellationPolicy) : 'Choose a fare to continue.'}
          action={
            <button type="button" className="btn btn-primary btn-block" disabled={!fare || departed} onClick={continueToCheckout}>
              Continue
            </button>
          }
        />
      </div>
    </main>
  );
}
