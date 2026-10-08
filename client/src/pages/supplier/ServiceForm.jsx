import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { errorLines, minuteToTime, WEEKDAYS } from '../../lib/consoleForm.js';
import { todayIst } from '../../lib/dates.js';
import { formatDateTime } from '../../lib/format.js';

const blank = (code) => ({
  flightNumber: `${code} `,
  origin: 'DEL',
  destination: 'BOM',
  aircraftConfig: '',
  departureTime: '09:00',
  durationMinutes: 120,
  stops: 0,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDate: todayIst(),
  endDate: '',
});

const fromService = (s) => ({
  flightNumber: s.flightNumber,
  origin: s.origin.code,
  destination: s.destination.code,
  aircraftConfig: s.aircraftConfig,
  departureTime: minuteToTime(s.departureMinute),
  durationMinutes: s.durationMinutes,
  stops: s.stops,
  daysOfWeek: s.daysOfWeek,
  startDate: s.startDate,
  endDate: s.endDate || '',
});

function validate(v, code) {
  const e = {};
  if (!new RegExp(`^${code} \\d{2,4}$`).test(v.flightNumber.trim().toUpperCase())) e.flightNumber = `Use ${code}, a space and 2–4 digits, e.g. ${code} 245`;
  if (v.origin === v.destination) e.destination = 'Origin and destination must differ';
  if (!v.aircraftConfig) e.aircraftConfig = 'Choose an aircraft';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.departureTime)) e.departureTime = 'Use a 24-hour time like 07:45';
  if (!(Number(v.durationMinutes) >= 20 && Number(v.durationMinutes) <= 900)) e.durationMinutes = 'Between 20 and 900 minutes';
  if (!v.daysOfWeek.length) e.daysOfWeek = 'Pick at least one day';
  if (!v.startDate) e.startDate = 'Choose a start date';
  if (v.endDate && v.endDate < v.startDate) e.endDate = 'The end date must be on or after the start date';
  return e;
}

export default function ServiceForm() {
  const { supplier } = useOutletContext();
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Add service' : 'Edit service');
  const navigate = useNavigate();
  const [values, setValues] = useState(isNew ? blank(supplier.code) : null);
  const [catalogue, setCatalogue] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(null);

  useEffect(() => {
    supplierApi.catalogue().then(setCatalogue).catch(setLoadError);
    if (!isNew) {
      supplierApi.services
        .get(id)
        .then(({ service }) => setValues(fromService(service)))
        .catch(setLoadError);
    }
  }, [id, isNew]);

  if (loadError) return <ErrorState error={loadError} />;
  if (!values || !catalogue) return <Spinner />;

  const errors = submitted ? validate(values, supplier.code) : {};
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const toggleDay = (d) => setValues((v) => ({ ...v, daysOfWeek: v.daysOfWeek.includes(d) ? v.daysOfWeek.filter((x) => x !== d) : [...v.daysOfWeek, d].sort() }));

  async function submit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerErrors([]);
    if (Object.keys(validate(values, supplier.code)).length) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    const payload = {
      ...values,
      flightNumber: values.flightNumber.trim().toUpperCase(),
      durationMinutes: Number(values.durationMinutes),
      stops: Number(values.stops),
      endDate: values.endDate || null,
    };
    try {
      if (isNew) {
        const res = await supplierApi.services.create(payload);
        navigate('/supplier/services', { state: { saved: `${res.service.flightNumber} was added with ${res.departuresAdded} departures.` } });
      } else {
        const res = await supplierApi.services.update(id, payload);
        if (res.keptBooked.length) {
          setKept(res.keptBooked);
          setBusy(false);
          window.scrollTo({ top: 0 });
        } else {
          navigate('/supplier/services', { state: { saved: `${res.service.flightNumber} was updated.` } });
        }
      }
    } catch (err) {
      setServerErrors(errorLines(err));
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <div className="narrow-console">
      <Link to="/supplier/services" className="btn-text back-link">
        ← All services
      </Link>
      <h1 className="console-h1">{isNew ? 'Add a service' : `Edit ${values.flightNumber}`}</h1>
      {kept && (
        <Banner tone="info" action={<Link to="/supplier/services" className="btn btn-secondary btn-sm">Done</Link>}>
          <p>
            Saved. Departures nobody has booked now follow the new details. These {kept.length} booked departures keep their old details — reschedule
            them one by one if they need to change:
          </p>
          <ul>
            {kept.map((f) => (
              <li key={f._id}>{formatDateTime(f.departureTime)}</li>
            ))}
          </ul>
        </Banner>
      )}
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
          <div className="form-grid cols-2">
            <Field label="Flight number" value={values.flightNumber} onChange={set('flightNumber')} error={errors.flightNumber} />
            <Field as="select" label="Aircraft" value={values.aircraftConfig} onChange={set('aircraftConfig')} error={errors.aircraftConfig} hint="Fixes the cabins and seat layout">
              <option value="">Choose an aircraft</option>
              {catalogue.aircraft.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                  {a.maxRouteKm ? ` — routes under ${a.maxRouteKm} km` : ''}
                </option>
              ))}
            </Field>
            <Field as="select" label="From" value={values.origin} onChange={set('origin')}>
              {catalogue.airports.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.city} ({a.code})
                </option>
              ))}
            </Field>
            <Field as="select" label="To" value={values.destination} onChange={set('destination')} error={errors.destination}>
              {catalogue.airports.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.city} ({a.code})
                </option>
              ))}
            </Field>
            <Field label="Departure time (IST)" type="time" value={values.departureTime} onChange={set('departureTime')} error={errors.departureTime} />
            <Field label="Duration (minutes)" type="number" min={20} max={900} value={values.durationMinutes} onChange={set('durationMinutes')} error={errors.durationMinutes} />
            <Field as="select" label="Stops" value={values.stops} onChange={set('stops')}>
              <option value={0}>Non-stop</option>
              <option value={1}>1 stop</option>
              <option value={2}>2 stops</option>
            </Field>
          </div>
        </section>

        <section className="card">
          <h2 className="h3">When it flies</h2>
          <fieldset className="days-picker" aria-describedby={errors.daysOfWeek ? 'days-error' : undefined}>
            <legend className="field-label">Days of the week</legend>
            <div className="row">
              {WEEKDAYS.map((label, d) => (
                <label key={label} className="chip-check">
                  <input type="checkbox" checked={values.daysOfWeek.includes(d)} onChange={() => toggleDay(d)} /> {label}
                </label>
              ))}
            </div>
            {errors.daysOfWeek && (
              <p id="days-error" className="field-error">
                {errors.daysOfWeek}
              </p>
            )}
          </fieldset>
          <div className="form-grid cols-2" style={{ marginTop: 'var(--space-4)' }}>
            <Field label="Start date" type="date" value={values.startDate} onChange={set('startDate')} error={errors.startDate} />
            <Field label="End date" optional type="date" value={values.endDate} onChange={set('endDate')} error={errors.endDate} hint="Leave empty to keep flying" />
          </div>
        </section>

        <p className="small muted">
          Fares follow Atlas’s standard levels until your rate card is set up. Changes apply to future bookings only; departures that already have
          bookings keep their times.
        </p>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add service' : 'Save changes'}
          </button>
          <Link to="/supplier/services" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
