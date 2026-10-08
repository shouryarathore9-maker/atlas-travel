import { useState } from 'react';
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
import { flightBreakdown, partyLabel, partySlots, readParty, seatPrice } from '../lib/pricing.js';

const SUPPLIER_PROMISE =
  'If the airline cancels this flight you get a full refund automatically. If it changes the time, you can keep the new time or cancel for a full refund until 24 hours before the new departure.';

export default function FlightDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const party = readParty(params);
  const cabin = params.get('cabin') === 'business' ? 'business' : 'economy';
  const { data, error, reload } = useAsync((signal) => flightsApi.get(id, { cabin, ...party }, { signal }), [id, cabin, party.adults, party.children, party.infants]);
  useDocumentTitle(data?.flight ? `${data.flight.airline} ${data.flight.flightNumber}` : 'Flight');

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Flight not found' : undefined} />
      </main>
    );
  }
  if (!data || String(data.flight._id) !== id) {
    return (
      <main id="main" className="container page">
        <SkeletonList count={3} height={180} />
      </main>
    );
  }
  return <FlightBooking key={`${id}-${cabin}`} data={data} party={party} cabin={cabin} />;
}

function FlightBooking({ data, party, cabin }) {
  const navigate = useNavigate();
  const { flight, tiers, seatMap, meals, taxRate, infantFee } = data;
  const firstBookable = tiers.find((t) => t.available);
  const [fareType, setFareType] = useState(firstBookable?.name || '');
  const [travellers, setTravellers] = useState(() => partySlots(party).map((slot) => ({ ...slot, seat: '', meal: '' })));
  const paying = travellers.map((t, i) => ({ ...t, index: i })).filter((t) => t.ageCategory !== 'infant');
  const [active, setActive] = useState(0); // index into `paying`

  const departed = new Date(flight.departureTime) <= new Date();
  const notOnSale = departed || flight.status === 'cancelled' || flight.salesStopped;
  const tier = tiers.find((t) => t.name === fareType);
  const breakdown = tier ? flightBreakdown({ tier, travellers, seatMap, meals, taxRate, infantFee }) : null;
  const assigned = paying.map((t) => t.seat);

  function selectSeat(label) {
    const next = travellers.map((t) => ({ ...t }));
    const ownerSlot = paying.findIndex((t) => t.seat === label);
    if (ownerSlot >= 0) {
      next[paying[ownerSlot].index].seat = ''; // clicking a chosen seat releases it
      setActive(ownerSlot);
    } else {
      next[paying[active].index].seat = label;
      const nextEmpty = paying.findIndex((t, i) => i > active && !t.seat);
      if (nextEmpty >= 0) setActive(nextEmpty);
    }
    setTravellers(next);
  }

  const setMeal = (index, meal) => setTravellers((list) => list.map((t, i) => (i === index ? { ...t, meal } : t)));

  function continueToCheckout() {
    saveDraft({
      type: 'flight',
      itemId: flight._id,
      fareType,
      cabin,
      party,
      travellers: travellers.map(({ ageCategory, label, seat, meal }) => ({ ageCategory, label, seat, meal })),
      display: {
        title: `${flight.origin.city} → ${flight.destination.city}`,
        subtitle: `${flight.airline} ${flight.flightNumber} · ${fareType}`,
        when: formatDateTime(flight.departureTime),
        party: partyLabel(party),
        estimate: breakdown?.total,
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
            {flight.scheduleChange && <span className="badge badge-olive">Schedule changed by the airline</span>}
          </div>
        </header>
        <FlightRouteMap origin={flight.origin} destination={flight.destination} />
      </div>

      {departed && (
        <Banner tone="error">
          <p>This flight has already departed and can no longer be booked.</p>
        </Banner>
      )}
      {!departed && flight.status === 'cancelled' && (
        <Banner tone="error">
          <p>This flight was cancelled by the airline and can’t be booked.</p>
        </Banner>
      )}
      {!departed && flight.status !== 'cancelled' && flight.salesStopped && (
        <Banner tone="info">
          <p>The airline has stopped sales on this flight for now.</p>
        </Banner>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-section" aria-labelledby="fares-heading">
            <h2 id="fares-heading">Choose a fare</h2>
            <p className="small muted">
              {partyLabel(party)} · {cabin === 'business' ? 'Business' : 'Economy'}
            </p>
            {tiers.length === 0 && <p className="muted">This flight has no {cabin} cabin. Go back and try another cabin.</p>}
            <div className="fare-grid" role="radiogroup" aria-labelledby="fares-heading">
              {tiers.map((f) => (
                <label key={f.name} className={`fare-card ${fareType === f.name ? 'is-selected' : ''} ${!f.available ? 'is-disabled' : ''}`}>
                  <input type="radio" name="fare" className="sr-only" value={f.name} checked={fareType === f.name} disabled={!f.available} onChange={() => setFareType(f.name)} />
                  <span className="fare-name">{f.name}</span>
                  <span className="price">{formatPrice(f.price)}</span>
                  <span className="small muted">per traveller</span>
                  <ul className="fare-facts small">
                    <li>
                      <Icon name="suitcase" size={16} /> {f.cabinBaggageKg} kg cabin · {f.checkinBaggageKg} kg check-in
                    </li>
                    <li>{f.terms}</li>
                    <li>{f.dateChangeFee ? `Date change ${formatPrice(f.dateChangeFee)} (for information)` : 'Free date change (for information)'}</li>
                  </ul>
                  {!f.available && <span className="small field-error">Not enough seats for {pluralize(party.adults + party.children, 'traveller')}</span>}
                </label>
              ))}
            </div>
          </section>

          {seatMap && (
            <section className="detail-section" aria-labelledby="seats-heading">
              <h2 id="seats-heading">Pick your seats</h2>
              <p className="muted small">
                Optional — skip it and seats are assigned at web check-in.{party.infants > 0 && ' Infants sit on an adult’s lap and don’t need a seat.'}
              </p>
              {paying.length > 1 && (
                <div className="traveller-tabs" role="group" aria-label="Choosing a seat for">
                  {paying.map((t, i) => (
                    <button key={t.index} type="button" className="btn btn-secondary btn-sm" aria-pressed={active === i} onClick={() => setActive(i)}>
                      {t.label}: {t.seat || 'no seat'}
                    </button>
                  ))}
                </div>
              )}
              <SeatMap seatMap={seatMap} cabin={cabin} assigned={assigned} onSelect={selectSeat} />
              <p className="small" aria-live="polite">
                {paying
                  .map((t) => (t.seat ? `${t.label}: ${t.seat} (${seatPrice(seatMap, t.seat) ? formatPrice(seatPrice(seatMap, t.seat)) : cabin === 'business' ? 'included' : 'free'})` : null))
                  .filter(Boolean)
                  .join(' · ') || 'No seats selected yet.'}
              </p>
            </section>
          )}

          {meals.length > 0 && (
            <section className="detail-section" aria-labelledby="meals-heading">
              <h2 id="meals-heading">Add a meal</h2>
              <p className="muted small">Optional. {cabin === 'business' ? 'Business meals are included in your fare.' : 'Pre-booked meals are served first.'}</p>
              <div className="form-grid cols-2">
                {paying.map((t) => (
                  <div className="field" key={t.index}>
                    <label htmlFor={`meal-${t.index}`}>Meal for {t.label.toLowerCase()}</label>
                    <select id={`meal-${t.index}`} className="select" value={t.meal} onChange={(e) => setMeal(t.index, e.target.value)}>
                      <option value="">No meal selected</option>
                      {meals.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name} ({m.isVeg ? 'veg' : 'non-veg'}) — {m.price ? formatPrice(m.price) : 'included'}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tier && (
            <section className="detail-section" aria-labelledby="policy-heading">
              <h2 id="policy-heading">Baggage &amp; cancellation</h2>
              <dl className="facts">
                <div>
                  <dt>Cabin baggage</dt>
                  <dd>{tier.cabinBaggageKg} kg per traveller</dd>
                </div>
                <div>
                  <dt>Check-in baggage</dt>
                  <dd>{tier.checkinBaggageKg} kg per traveller</dd>
                </div>
                <div>
                  <dt>Cancellation</dt>
                  <dd>{tier.terms}</dd>
                </div>
                <div>
                  <dt>Date change</dt>
                  <dd>{tier.dateChangeFee ? formatPrice(tier.dateChangeFee) : 'Free'} (changing a booking isn’t available on Atlas yet)</dd>
                </div>
              </dl>
              <p className="supplier-promise small">
                <strong>If the airline cancels or reschedules.</strong> {SUPPLIER_PROMISE}
              </p>
            </section>
          )}

          <Reviews itemType="flight" itemId={flight._id} rating={flight.rating} initialReviews={data.reviews} />
        </div>

        <PriceSummary
          lines={
            breakdown
              ? [
                  { label: `${fareType} fare × ${breakdown.paying}`, amount: breakdown.base },
                  breakdown.infants ? { label: `Infant fee × ${breakdown.infants}`, amount: breakdown.infantFees } : null,
                  { label: 'Taxes', amount: breakdown.taxes },
                  breakdown.seats ? { label: 'Seats', amount: breakdown.seats } : null,
                  breakdown.meals ? { label: 'Meals', amount: breakdown.meals } : null,
                ]
              : []
          }
          total={breakdown?.total || 0}
          note={tier ? tier.terms : 'Choose a fare to continue.'}
          action={
            <button type="button" className="btn btn-primary btn-block" disabled={!tier || notOnSale} onClick={continueToCheckout}>
              Continue
            </button>
          }
        />
      </div>
    </main>
  );
}
