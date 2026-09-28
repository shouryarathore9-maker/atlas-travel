import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { AIRPORTS, CITIES, cityByCode } from '../../lib/cities.js';
import { fromIstInput, humanizePath, splitList, toIstInput } from './adminForm.js';

const emptyFare = () => ({ type: '', price: '', cabinBaggageKg: 7, checkinBaggageKg: 15, freeUntilHours: 0, fee: 0, dateChangeFee: 0, seatsAvailable: 30 });
const emptyMeal = () => ({ name: '', price: '', isVeg: true });

const BLANK = {
  airline: '',
  flightNumber: '',
  aircraftType: 'Airbus A320neo',
  origin: 'DEL',
  destination: 'BOM',
  departure: '',
  arrival: '',
  stops: 0,
  fares: [{ ...emptyFare(), type: 'Saver' }],
  meals: [],
  rows: 30,
  columns: 6,
  unavailable: '',
  window: 350,
  aisle: 300,
  middle: 0,
};

function fromFlight(f) {
  return {
    airline: f.airline,
    flightNumber: f.flightNumber,
    aircraftType: f.aircraftType,
    origin: f.origin.code,
    destination: f.destination.code,
    departure: toIstInput(f.departureTime),
    arrival: toIstInput(f.arrivalTime),
    stops: f.stops,
    fares: f.fareOptions.map((o) => ({
      type: o.type,
      price: o.price,
      cabinBaggageKg: o.cabinBaggageKg,
      checkinBaggageKg: o.checkinBaggageKg,
      freeUntilHours: o.cancellationPolicy.freeUntilHoursBeforeDeparture,
      fee: o.cancellationPolicy.feeAfterCutoff,
      dateChangeFee: o.dateChangeFee,
      seatsAvailable: o.seatsAvailable,
    })),
    meals: f.mealOptions.map((m) => ({ ...m })),
    rows: f.seatMap.rows,
    columns: f.seatMap.columns,
    unavailable: f.seatMap.unavailableSeats.join(', '),
    window: f.seatMap.seatPricing.window,
    aisle: f.seatMap.seatPricing.aisle,
    middle: f.seatMap.seatPricing.middle,
  };
}

const airport = (code) => ({ code, city: cityByCode(code)?.city || code, airport: AIRPORTS[code] || '' });

function toPayload(v) {
  return {
    airline: v.airline,
    flightNumber: v.flightNumber,
    aircraftType: v.aircraftType,
    origin: airport(v.origin),
    destination: airport(v.destination),
    departureTime: fromIstInput(v.departure),
    arrivalTime: fromIstInput(v.arrival),
    stops: v.stops,
    fareOptions: v.fares.map((f) => ({
      type: f.type,
      price: f.price,
      cabinBaggageKg: f.cabinBaggageKg,
      checkinBaggageKg: f.checkinBaggageKg,
      cancellationPolicy: { freeUntilHoursBeforeDeparture: f.freeUntilHours, feeAfterCutoff: f.fee },
      dateChangeFee: f.dateChangeFee,
      seatsAvailable: f.seatsAvailable,
    })),
    mealOptions: v.meals,
    seatMap: {
      rows: v.rows,
      columns: v.columns,
      unavailableSeats: splitList(v.unavailable),
      seatPricing: { window: v.window, aisle: v.aisle, middle: v.middle },
    },
  };
}

// Client-side checks for the required fields; the server re-validates everything.
function validate(v) {
  const e = {};
  if (!v.airline.trim()) e.airline = 'Airline is required';
  if (!v.flightNumber.trim()) e.flightNumber = 'Flight number is required';
  if (v.origin === v.destination) e.destination = 'Destination must differ from origin';
  if (!v.departure) e.departure = 'Departure time is required';
  if (!v.arrival) e.arrival = 'Arrival time is required';
  else if (v.departure && v.arrival <= v.departure) e.arrival = 'Arrival must be after departure';
  if (!v.fares.length) e.fares = 'Add at least one fare option';
  v.fares.forEach((f, i) => {
    if (!String(f.type).trim()) e[`fares.${i}.type`] = 'Required';
    if (f.price === '' || Number(f.price) < 0) e[`fares.${i}.price`] = 'Enter a price';
  });
  v.meals.forEach((m, i) => {
    if (!m.name.trim()) e[`meals.${i}.name`] = 'Required';
    if (m.price === '' || Number(m.price) < 0) e[`meals.${i}.price`] = 'Enter a price';
  });
  return e;
}

export default function FlightForm() {
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Add flight' : 'Edit flight');
  const navigate = useNavigate();
  const [values, setValues] = useState(isNew ? BLANK : null);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    adminApi.flights
      .get(id)
      .then(({ flight }) => setValues(fromFlight(flight)))
      .catch(setLoadError);
  }, [id, isNew]);

  if (loadError) return <main id="main" className="container page"><ErrorState error={loadError} /></main>;
  if (!values) return <main id="main" className="container page"><Spinner /></main>;

  const errors = submitted ? validate(values) : {};
  const set = (key, cast = (x) => x) => (e) => setValues((v) => ({ ...v, [key]: cast(e.target.value) }));
  const setRow = (list, i, key, cast = (x) => x) => (e) =>
    setValues((v) => ({ ...v, [list]: v[list].map((row, j) => (j === i ? { ...row, [key]: key === 'isVeg' ? e.target.checked : cast(e.target.value) } : row)) }));
  const num = (x) => (x === '' ? '' : Number(x));

  async function submit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerErrors([]);
    if (Object.keys(validate(values)).length) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const payload = toPayload(values);
      if (isNew) await adminApi.flights.create(payload);
      else await adminApi.flights.update(id, payload);
      navigate('/admin/flights');
    } catch (err) {
      setServerErrors(err.details?.length ? err.details.map((d) => `${humanizePath(d.path)}: ${d.message}`) : [err.message]);
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <main id="main" className="container page narrow">
      <Link to="/admin/flights" className="btn-text back-link">
        ← All flights
      </Link>
      <h1>{isNew ? 'Add a flight' : 'Edit flight'}</h1>
      {serverErrors.length > 0 && (
        <Banner tone="error">
          <p>Please fix the following:</p>
          <ul>
            {serverErrors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Banner>
      )}

      <form onSubmit={submit} noValidate className="stack">
        <section className="card">
          <h2 className="h3">Flight</h2>
          <div className="form-grid cols-3">
            <Field label="Airline" value={values.airline} onChange={set('airline')} error={errors.airline} />
            <Field label="Flight number" value={values.flightNumber} onChange={set('flightNumber')} error={errors.flightNumber} />
            <Field label="Aircraft" value={values.aircraftType} onChange={set('aircraftType')} />
            <Field as="select" label="From" value={values.origin} onChange={set('origin')}>
              {CITIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.city} ({c.code})
                </option>
              ))}
            </Field>
            <Field as="select" label="To" value={values.destination} onChange={set('destination')} error={errors.destination}>
              {CITIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.city} ({c.code})
                </option>
              ))}
            </Field>
            <Field label="Stops" type="number" min={0} max={3} value={values.stops} onChange={set('stops', num)} />
            <Field label="Departure (IST)" type="datetime-local" value={values.departure} onChange={set('departure')} error={errors.departure} />
            <Field label="Arrival (IST)" type="datetime-local" value={values.arrival} onChange={set('arrival')} error={errors.arrival} />
          </div>
        </section>

        <section className="card">
          <div className="spread">
            <h2 className="h3">Fare options</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setValues((v) => ({ ...v, fares: [...v.fares, emptyFare()] }))}>
              Add fare
            </button>
          </div>
          {errors.fares && <p className="field-error">{errors.fares}</p>}
          {values.fares.map((f, i) => (
            <fieldset key={i} className="repeat-row">
              <legend>Fare {i + 1}</legend>
              <div className="form-grid cols-4">
                <Field label="Type" value={f.type} onChange={setRow('fares', i, 'type')} error={errors[`fares.${i}.type`]} placeholder="Saver" />
                <Field label="Price (₹)" type="number" min={0} value={f.price} onChange={setRow('fares', i, 'price', num)} error={errors[`fares.${i}.price`]} />
                <Field label="Seats available" type="number" min={0} value={f.seatsAvailable} onChange={setRow('fares', i, 'seatsAvailable', num)} />
                <Field label="Date change fee (₹)" type="number" min={0} value={f.dateChangeFee} onChange={setRow('fares', i, 'dateChangeFee', num)} />
                <Field label="Cabin bag (kg)" type="number" min={0} value={f.cabinBaggageKg} onChange={setRow('fares', i, 'cabinBaggageKg', num)} />
                <Field label="Check-in bag (kg)" type="number" min={0} value={f.checkinBaggageKg} onChange={setRow('fares', i, 'checkinBaggageKg', num)} />
                <Field label="Free cancel until (hrs before)" type="number" min={0} value={f.freeUntilHours} onChange={setRow('fares', i, 'freeUntilHours', num)} />
                <Field label="Cancellation fee (₹)" type="number" min={0} value={f.fee} onChange={setRow('fares', i, 'fee', num)} />
              </div>
              {values.fares.length > 1 && (
                <button type="button" className="btn-text small" onClick={() => setValues((v) => ({ ...v, fares: v.fares.filter((_, j) => j !== i) }))}>
                  Remove fare {i + 1}
                </button>
              )}
            </fieldset>
          ))}
        </section>

        <section className="card">
          <div className="spread">
            <h2 className="h3">Meals</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setValues((v) => ({ ...v, meals: [...v.meals, emptyMeal()] }))}>
              Add meal
            </button>
          </div>
          {values.meals.length === 0 && <p className="small muted">No meals offered.</p>}
          {values.meals.map((m, i) => (
            <fieldset key={i} className="repeat-row">
              <legend>Meal {i + 1}</legend>
              <div className="form-grid cols-3">
                <Field label="Name" value={m.name} onChange={setRow('meals', i, 'name')} error={errors[`meals.${i}.name`]} />
                <Field label="Price (₹)" type="number" min={0} value={m.price} onChange={setRow('meals', i, 'price', num)} error={errors[`meals.${i}.price`]} />
                <label className="checkbox">
                  <input type="checkbox" checked={m.isVeg} onChange={setRow('meals', i, 'isVeg')} /> Vegetarian
                </label>
              </div>
              <button type="button" className="btn-text small" onClick={() => setValues((v) => ({ ...v, meals: v.meals.filter((_, j) => j !== i) }))}>
                Remove meal {i + 1}
              </button>
            </fieldset>
          ))}
        </section>

        <section className="card">
          <h2 className="h3">Seat map</h2>
          <div className="form-grid cols-3">
            <Field label="Rows" type="number" min={1} max={60} value={values.rows} onChange={set('rows', num)} />
            <Field label="Seats per row" type="number" min={2} max={10} value={values.columns} onChange={set('columns', num)} />
            <span />
            <Field label="Window seat (₹)" type="number" min={0} value={values.window} onChange={set('window', num)} />
            <Field label="Aisle seat (₹)" type="number" min={0} value={values.aisle} onChange={set('aisle', num)} />
            <Field label="Middle seat (₹)" type="number" min={0} value={values.middle} onChange={set('middle', num)} />
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Field as="textarea" label="Unavailable seats" optional hint="Comma-separated, e.g. 12A, 12B" value={values.unavailable} onChange={set('unavailable')} />
          </div>
        </section>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create flight' : 'Save changes'}
          </button>
          <Link to="/admin/flights" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
