import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { errorLines } from '../../lib/consoleForm.js';
import PhotoPicker from './PhotoPicker.jsx';

const blankRoom = () => ({
  originalName: null,
  name: '',
  occupancy: { adults: 2, children: 0 },
  bedType: 'King bed',
  amenities: [],
  breakfastIncluded: false,
  baseRate: '',
  taxesAndFees: 0,
  roomsTotal: 5,
  salesStopped: false,
});

const fromHotel = (h, baseRates = {}) => ({
  description: h.description || '',
  amenities: h.amenities,
  photos: h.photos,
  salesStopped: Boolean(h.salesStopped),
  roomTypes: h.roomTypes.map((r) => ({
    originalName: r.name,
    name: r.name,
    occupancy: { adults: r.occupancy.adults, children: r.occupancy.children },
    bedType: r.bedType,
    amenities: r.amenities,
    breakfastIncluded: r.breakfastIncluded,
    baseRate: baseRates[r.name] ?? '',
    taxesAndFees: r.taxesAndFees,
    roomsTotal: r.roomsTotal,
    nights: r.nights,
    salesStopped: Boolean(r.salesStopped),
  })),
});

function validate(v) {
  const e = {};
  if (v.description.trim().length < 20) e.description = 'Write at least a sentence or two';
  if (!v.photos.length) e.photos = 'Pick at least one photo';
  if (v.photos.length > 6) e.photos = 'Pick up to six photos';
  if (!v.roomTypes.length) e.roomTypes = 'Keep at least one room type';
  const names = v.roomTypes.map((r) => r.name.trim().toLowerCase());
  v.roomTypes.forEach((r, i) => {
    if (r.name.trim().length < 2) e[`room${i}.name`] = 'Required';
    else if (names.indexOf(r.name.trim().toLowerCase()) !== i) e[`room${i}.name`] = 'Room names must be unique';
    if (!(Number(r.baseRate) >= 500)) e[`room${i}.baseRate`] = 'At least ₹500';
    if (!(Number(r.occupancy.adults) >= 1)) e[`room${i}.adults`] = 'At least 1';
    if (!(Number(r.roomsTotal) >= 0)) e[`room${i}.roomsTotal`] = '0 or more';
  });
  return e;
}

const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const night = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const range = (r) => (r.from === r.to ? night(r.from) : `${night(r.from)} – ${night(r.to)}`);
const todayIst = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// "3 booked tonight · busiest: 8 on 20 Oct" for an existing room type.
function nightsHint(r) {
  if (!r.nights) return undefined;
  const { bookedTonight, peak } = r.nights;
  return `${bookedTonight} booked tonight${peak && peak.date !== todayIst() ? ` · busiest: ${peak.booked} on ${night(peak.date)}` : ''}`;
}

// Stop (or resume) selling some room types on a range of nights. Reservations already made are kept.
function StopSellDates({ roomTypes, horizonEnd, onDone }) {
  const [form, setForm] = useState({ rooms: roomTypes.map((r) => r.name), from: todayIst(), to: todayIst() });
  const [state, setState] = useState({ busy: null, error: null, notice: null });
  const stopped = roomTypes.filter((r) => r.nights?.stopped?.length);

  async function run(stop) {
    if (!form.rooms.length) return setState({ busy: null, error: 'Choose at least one room type', notice: null });
    if (form.to < form.from) return setState({ busy: null, error: 'The last night must be on or after the first', notice: null });
    setState({ busy: stop ? 'stop' : 'resume', error: null, notice: null });
    try {
      const { hotel } = await supplierApi.hotel.stopSell({ ...form, stopped: stop });
      setState({ busy: null, error: null, notice: `${stop ? 'Sales stopped' : 'Sales resumed'} for ${range(form)}.` });
      onDone(hotel);
    } catch (err) {
      setState({ busy: null, error: errorLines(err).join(' '), notice: null });
    }
  }

  return (
    <section className="card">
      <h2 className="h3">Stop sales on dates</h2>
      <p className="small muted">Guests can’t book a stay that includes these nights. Reservations already made are kept — cancel them from Reservations if you need to.</p>
      {state.notice && (
        <Banner tone="success">
          <p>{state.notice}</p>
        </Banner>
      )}
      <fieldset className="check-grid">
        <legend className="field-label">Room types</legend>
        {roomTypes.map((r) => (
          <label key={r.name} className="checkbox">
            <input type="checkbox" checked={form.rooms.includes(r.name)} onChange={() => setForm((f) => ({ ...f, rooms: toggle(f.rooms, r.name) }))} /> {r.name}
          </label>
        ))}
      </fieldset>
      <div className="form-grid cols-2">
        <Field label="First night" type="date" min={todayIst()} max={horizonEnd} value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
        <Field label="Last night" type="date" min={form.from} max={horizonEnd} value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
      </div>
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(true)} disabled={Boolean(state.busy)} aria-busy={state.busy === 'stop' || undefined}>
          {state.busy === 'stop' ? 'Saving…' : 'Stop sales on these nights'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(false)} disabled={Boolean(state.busy)} aria-busy={state.busy === 'resume' || undefined}>
          {state.busy === 'resume' ? 'Saving…' : 'Resume sales'}
        </button>
      </div>
      {stopped.length > 0 && (
        <ul className="small plain-list">
          {stopped.map((r) => (
            <li key={r.name}>
              <strong>{r.name}</strong>: stopped {r.nights.stopped.map(range).join(', ')}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function HotelProperty() {
  const { supplier } = useOutletContext();
  const { sandbox } = useAuth();
  useDocumentTitle(`${supplier.name} · Property & rooms`);
  const [values, setValues] = useState(null);
  const [horizonEnd, setHorizonEnd] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([supplierApi.hotel.get(), supplierApi.catalogue()])
      .then(([{ hotel, baseRates, horizonEnd: end }, cat]) => {
        setValues(fromHotel(hotel, baseRates));
        setHorizonEnd(end);
        setCatalogue(cat);
      })
      .catch(setLoadError);
  }, []);

  if (loadError) return <ErrorState error={loadError} />;
  if (!values) return <Spinner />;

  const errors = submitted ? validate(values) : {};
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const setRoom = (i, patch) => setValues((v) => ({ ...v, roomTypes: v.roomTypes.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  async function submit(e) {
    e.preventDefault();
    setSubmitted(true);
    setSaved(false);
    setServerErrors([]);
    if (Object.keys(validate(values)).length) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const { hotel } = await supplierApi.hotel.update({
        ...values,
        roomTypes: values.roomTypes.map(({ nights: _nights, ...r }) => ({
          ...r,
          occupancy: { adults: Number(r.occupancy.adults), children: Number(r.occupancy.children) },
          baseRate: Number(r.baseRate),
          taxesAndFees: Number(r.taxesAndFees),
          roomsTotal: Number(r.roomsTotal),
        })),
      });
      const fresh = await supplierApi.hotel.get();
      setValues(fromHotel(hotel, fresh.baseRates));
      setSubmitted(false);
      setSaved(true);
    } catch (err) {
      setServerErrors(errorLines(err));
    } finally {
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <div className="narrow-console">
      <h1 className="console-h1">Property & rooms</h1>
      <p className="muted">Changes appear in search straight away and apply to future bookings only.</p>
      {saved && (
        <Banner tone="success">
          <p>Your hotel was updated.</p>
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

      <StopSellDates
          roomTypes={values.roomTypes.filter((r) => r.originalName)}
          horizonEnd={horizonEnd}
          onDone={(hotel) => setValues((v) => ({ ...v, roomTypes: v.roomTypes.map((r) => ({ ...r, nights: hotel.roomTypes.find((h) => h.name === r.originalName)?.nights ?? r.nights })) }))}
        />

      <form onSubmit={submit} noValidate className="stack">
        <section className="card">
          <div className="spread">
            <h2 className="h3">Sales</h2>
            <label className="checkbox">
              <input type="checkbox" checked={values.salesStopped} onChange={(e) => set('salesStopped', e.target.checked)} /> Stop all sales
            </label>
          </div>
          <p className="small muted">While sales are stopped your hotel doesn’t appear in search. Existing reservations aren’t affected.</p>
        </section>

        <section className="card">
          <h2 className="h3">About the hotel</h2>
          <Field as="textarea" label="Description" rows={4} value={values.description} onChange={(e) => set('description', e.target.value)} error={errors.description} />
          <fieldset className="check-grid">
            <legend className="field-label">Amenities</legend>
            {catalogue.hotelAmenities.map((a) => (
              <label key={a} className="checkbox">
                <input type="checkbox" checked={values.amenities.includes(a)} onChange={() => set('amenities', toggle(values.amenities, a))} /> {a}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card">
          <h2 className="h3">Photos</h2>
          <p className="small muted">
            Pick up to {catalogue.uploads?.maxHotelPhotos || 6}, in order: the first is the main photo and the first three appear on your hotel page.
          </p>
          <PhotoPicker value={values.photos} onChange={(photos) => set('photos', photos)} gallery={catalogue.gallery} limits={catalogue.uploads} allowUploads={!sandbox} error={errors.photos} />
        </section>

        <section className="card">
          <div className="spread">
            <h2 className="h3">Room types</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('roomTypes', [...values.roomTypes, blankRoom()])} disabled={values.roomTypes.length >= 6}>
              Add room type
            </button>
          </div>
          {errors.roomTypes && <p className="field-error">{errors.roomTypes}</p>}
          {values.roomTypes.map((r, i) => (
            <fieldset key={r.originalName || `new-${i}`} className="repeat-row">
              <legend>{r.originalName || `New room type ${i + 1}`}</legend>
              <div className="form-grid cols-4">
                <Field label="Name" value={r.name} onChange={(e) => setRoom(i, { name: e.target.value })} error={errors[`room${i}.name`]} />
                <Field label="Bed type" value={r.bedType} onChange={(e) => setRoom(i, { bedType: e.target.value })} />
                <Field label="Max adults" type="number" min={1} max={8} value={r.occupancy.adults} onChange={(e) => setRoom(i, { occupancy: { ...r.occupancy, adults: e.target.value } })} error={errors[`room${i}.adults`]} />
                <Field label="Max children" type="number" min={0} max={6} value={r.occupancy.children} onChange={(e) => setRoom(i, { occupancy: { ...r.occupancy, children: e.target.value } })} />
                <Field label="Base rate / night (₹)" type="number" min={500} value={r.baseRate} onChange={(e) => setRoom(i, { baseRate: e.target.value })} error={errors[`room${i}.baseRate`]} hint="Your rate card’s base for this room" />
                <Field label="Taxes / night (₹)" type="number" min={0} value={r.taxesAndFees} onChange={(e) => setRoom(i, { taxesAndFees: e.target.value })} />
                <Field
                  label="Rooms of this type"
                  type="number"
                  min={0}
                  value={r.roomsTotal}
                  onChange={(e) => setRoom(i, { roomsTotal: e.target.value })}
                  error={errors[`room${i}.roomsTotal`]}
                  hint={nightsHint(r)}
                />
                <div className="stack-tight">
                  <label className="checkbox">
                    <input type="checkbox" checked={r.breakfastIncluded} onChange={(e) => setRoom(i, { breakfastIncluded: e.target.checked })} /> Breakfast included
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" checked={r.salesStopped} onChange={(e) => setRoom(i, { salesStopped: e.target.checked })} /> Stop sales
                  </label>
                </div>
              </div>
              <fieldset className="check-grid">
                <legend className="field-label">Room amenities</legend>
                {catalogue.roomAmenities.map((a) => (
                  <label key={a} className="checkbox">
                    <input type="checkbox" checked={r.amenities.includes(a)} onChange={() => setRoom(i, { amenities: toggle(r.amenities, a) })} /> {a}
                  </label>
                ))}
              </fieldset>
              {values.roomTypes.length > 1 && (
                <button type="button" className="btn-text small" onClick={() => set('roomTypes', values.roomTypes.filter((_, j) => j !== i))}>
                  Remove {r.name || `room type ${i + 1}`}
                </button>
              )}
            </fieldset>
          ))}
          <p className="small muted">
            A room type that has bookings can’t be removed or renamed — stop its sales instead. You can’t set fewer rooms than are already booked on an upcoming night.
          </p>
        </section>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
