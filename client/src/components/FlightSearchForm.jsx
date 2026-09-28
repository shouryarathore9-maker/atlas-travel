import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { CITIES } from '../lib/cities.js';
import { addDays, isDateString, todayIst } from '../lib/dates.js';

export function validateFlightSearch({ origin, destination, date }) {
  if (!origin) return { field: 'origin', message: 'Choose where you are flying from' };
  if (!destination) return { field: 'destination', message: 'Choose where you are flying to' };
  if (origin === destination) return { field: 'destination', message: 'Pick a destination different from your origin' };
  if (!isDateString(date)) return { field: 'date', message: 'Choose a travel date' };
  if (date < todayIst()) return { field: 'date', message: 'Travel date can’t be in the past' };
  return null;
}

export default function FlightSearchForm({ initial = {}, compact = false }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    origin: initial.origin ?? 'DEL',
    destination: initial.destination ?? 'BOM',
    date: initial.date ?? addDays(todayIst(), 1),
    travellers: initial.travellers ?? 1,
    cabin: initial.cabin ?? 'economy',
  });
  const invalid = validateFlightSearch(values);
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (invalid) return;
    navigate(`/flights?${new URLSearchParams(values)}`);
  }

  const pillClass = (field) => `pill-field ${invalid?.field === field ? 'invalid' : ''}`;
  const errorFor = (field) => (invalid?.field === field ? 'flight-search-error' : undefined);

  return (
    <form onSubmit={submit} className={`search-form ${compact ? 'search-form--compact' : ''}`} noValidate>
      <div className="search-grid search-grid--flights">
        <div className="route-pair">
        <div className={pillClass('origin')}>
          <Icon name="location" />
          <div className="pill-body">
            <label htmlFor="fs-origin">From</label>
            <select id="fs-origin" value={values.origin} onChange={set('origin')} aria-invalid={invalid?.field === 'origin'} aria-describedby={errorFor('origin')}>
              <option value="">Select city</option>
              {CITIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.city} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn swap-btn"
          aria-label="Swap origin and destination"
          onClick={() => setValues((v) => ({ ...v, origin: v.destination, destination: v.origin }))}
        >
          <Icon name="swap" />
        </button>
        <div className={pillClass('destination')}>
          <Icon name="location" />
          <div className="pill-body">
            <label htmlFor="fs-destination">To</label>
            <select
              id="fs-destination"
              value={values.destination}
              onChange={set('destination')}
              aria-invalid={invalid?.field === 'destination'}
              aria-describedby={errorFor('destination')}
            >
              <option value="">Select city</option>
              {CITIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.city} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        </div>
        <div className={pillClass('date')}>
          <Icon name="calendar" />
          <div className="pill-body">
            <label htmlFor="fs-date">Departure</label>
            <input
              id="fs-date"
              type="date"
              min={todayIst()}
              value={values.date}
              onChange={set('date')}
              aria-invalid={invalid?.field === 'date'}
              aria-describedby={errorFor('date')}
            />
          </div>
        </div>
        <div className="pill-field">
          <Icon name="guest" />
          <div className="pill-body">
            <label htmlFor="fs-travellers">Travellers</label>
            <select id="fs-travellers" value={values.travellers} onChange={set('travellers')}>
              {Array.from({ length: 9 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} {i === 0 ? 'traveller' : 'travellers'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="pill-field">
          <Icon name="seat" />
          <div className="pill-body">
            <label htmlFor="fs-cabin">Cabin</label>
            <select id="fs-cabin" value={values.cabin} onChange={set('cabin')}>
              <option value="economy">Economy</option>
              <option value="business">Business</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-primary search-submit" disabled={Boolean(invalid)}>
          <Icon name="search" /> Search flights
        </button>
      </div>
      {invalid && (
        <p id="flight-search-error" className="field-error search-error" role="status">
          {invalid.message}
        </p>
      )}
    </form>
  );
}
