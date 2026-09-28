import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { CITIES } from '../lib/cities.js';
import { addDays, isDateString, todayIst } from '../lib/dates.js';

export function validateHotelSearch({ city, checkIn, checkOut, adults, rooms }) {
  if (!city) return { field: 'city', message: 'Choose a destination' };
  if (!isDateString(checkIn)) return { field: 'checkIn', message: 'Choose a check-in date' };
  if (checkIn < todayIst()) return { field: 'checkIn', message: 'Check-in can’t be in the past' };
  if (!isDateString(checkOut)) return { field: 'checkOut', message: 'Choose a check-out date' };
  if (checkOut <= checkIn) return { field: 'checkOut', message: 'Check-out must be after check-in' };
  if (Number(rooms) > Number(adults)) return { field: 'rooms', message: 'Each room needs at least one adult' };
  return null;
}

export default function HotelSearchForm({ initial = {}, compact = false }) {
  const navigate = useNavigate();
  const tomorrow = addDays(todayIst(), 1);
  const [values, setValues] = useState({
    city: initial.city ?? 'Mumbai',
    checkIn: initial.checkIn ?? tomorrow,
    checkOut: initial.checkOut ?? addDays(tomorrow, 2),
    adults: initial.adults ?? 2,
    children: initial.children ?? 0,
    rooms: initial.rooms ?? 1,
  });
  const invalid = validateHotelSearch(values);
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (invalid) return;
    navigate(`/hotels?${new URLSearchParams(values)}`);
  }

  const pillClass = (field) => `pill-field ${invalid?.field === field ? 'invalid' : ''}`;
  const aria = (field) =>
    invalid?.field === field ? { 'aria-invalid': true, 'aria-describedby': 'hotel-search-error' } : {};

  return (
    <form onSubmit={submit} className={`search-form ${compact ? 'search-form--compact' : ''}`} noValidate>
      <div className="search-grid search-grid--hotels">
        <div className={pillClass('city')}>
          <Icon name="location" />
          <div className="pill-body">
            <label htmlFor="hs-city">Destination</label>
            <select id="hs-city" value={values.city} onChange={set('city')} {...aria('city')}>
              <option value="">Select city</option>
              {CITIES.map((c) => (
                <option key={c.code} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={pillClass('checkIn')}>
          <Icon name="calendar" />
          <div className="pill-body">
            <label htmlFor="hs-in">Check-in</label>
            <input id="hs-in" type="date" min={todayIst()} value={values.checkIn} onChange={set('checkIn')} {...aria('checkIn')} />
          </div>
        </div>
        <div className={pillClass('checkOut')}>
          <Icon name="calendar" />
          <div className="pill-body">
            <label htmlFor="hs-out">Check-out</label>
            <input
              id="hs-out"
              type="date"
              min={values.checkIn ? addDays(values.checkIn, 1) : todayIst()}
              value={values.checkOut}
              onChange={set('checkOut')}
              {...aria('checkOut')}
            />
          </div>
        </div>
        <div className={`${pillClass('rooms')} guests-pill`}>
          <Icon name="guest" />
          <div className="pill-body guests-body">
            <span className="field-label-caps" id="hs-guests-label">
              Guests &amp; rooms
            </span>
            <div className="guest-selects" role="group" aria-labelledby="hs-guests-label">
              <select aria-label="Adults" value={values.adults} onChange={set('adults')}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1} {i === 0 ? 'adult' : 'adults'}
                  </option>
                ))}
              </select>
              <select aria-label="Children" value={values.children} onChange={set('children')}>
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i} value={i}>
                    {i} {i === 1 ? 'child' : 'children'}
                  </option>
                ))}
              </select>
              <select aria-label="Rooms" value={values.rooms} onChange={set('rooms')} {...aria('rooms')}>
                {Array.from({ length: 6 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1} {i === 0 ? 'room' : 'rooms'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary search-submit" disabled={Boolean(invalid)}>
          <Icon name="search" /> Search stays
        </button>
      </div>
      {invalid && (
        <p id="hotel-search-error" className="field-error search-error" role="status">
          {invalid.message}
        </p>
      )}
    </form>
  );
}
