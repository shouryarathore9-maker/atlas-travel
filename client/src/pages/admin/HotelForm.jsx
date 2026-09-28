import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { CITIES } from '../../lib/cities.js';
import { humanizePath, splitList } from './adminForm.js';

const emptyRoom = () => ({
  name: '',
  adults: 2,
  children: 0,
  bedType: 'King bed',
  amenities: '',
  breakfastIncluded: false,
  price: '',
  taxesAndFees: 0,
  freeDays: 1,
  fee: 0,
  roomsAvailable: 5,
});

const BLANK = {
  name: '',
  city: 'Mumbai',
  address: '',
  description: '',
  starRating: 4,
  amenities: 'Free Wi-Fi, Air conditioning, Restaurant',
  photos: '',
  rooms: [{ ...emptyRoom(), name: 'Deluxe Room' }],
};

function fromHotel(h) {
  return {
    name: h.name,
    city: h.city,
    address: h.address || '',
    description: h.description || '',
    starRating: h.starRating,
    amenities: h.amenities.join(', '),
    photos: h.photos.join(', '),
    rooms: h.roomTypes.map((r) => ({
      name: r.name,
      adults: r.occupancy.adults,
      children: r.occupancy.children,
      bedType: r.bedType,
      amenities: r.amenities.join(', '),
      breakfastIncluded: r.breakfastIncluded,
      price: r.price,
      taxesAndFees: r.taxesAndFees,
      freeDays: r.cancellationPolicy.freeUntilDaysBeforeCheckIn,
      fee: r.cancellationPolicy.feeAfterCutoff,
      roomsAvailable: r.roomsAvailable,
    })),
  };
}

function toPayload(v) {
  return {
    name: v.name,
    city: v.city,
    address: v.address,
    description: v.description,
    starRating: v.starRating,
    amenities: splitList(v.amenities),
    photos: splitList(v.photos),
    roomTypes: v.rooms.map((r) => ({
      name: r.name,
      occupancy: { adults: r.adults, children: r.children },
      bedType: r.bedType,
      amenities: splitList(r.amenities),
      breakfastIncluded: r.breakfastIncluded,
      price: r.price,
      taxesAndFees: r.taxesAndFees,
      cancellationPolicy: { freeUntilDaysBeforeCheckIn: r.freeDays, feeAfterCutoff: r.fee },
      roomsAvailable: r.roomsAvailable,
    })),
  };
}

function validate(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Hotel name is required';
  if (!v.city) e.city = 'City is required';
  if (!v.rooms.length) e.rooms = 'Add at least one room type';
  const names = v.rooms.map((r) => r.name.trim());
  v.rooms.forEach((r, i) => {
    if (!r.name.trim()) e[`rooms.${i}.name`] = 'Required';
    else if (names.indexOf(r.name.trim()) !== i) e[`rooms.${i}.name`] = 'Room names must be unique';
    if (r.price === '' || Number(r.price) < 0) e[`rooms.${i}.price`] = 'Enter a price';
    if (Number(r.adults) < 1) e[`rooms.${i}.adults`] = 'At least 1';
  });
  return e;
}

export default function HotelForm() {
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Add hotel' : 'Edit hotel');
  const navigate = useNavigate();
  const [values, setValues] = useState(isNew ? BLANK : null);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    adminApi.hotels
      .get(id)
      .then(({ hotel }) => setValues(fromHotel(hotel)))
      .catch(setLoadError);
  }, [id, isNew]);

  if (loadError) return <main id="main" className="container page"><ErrorState error={loadError} /></main>;
  if (!values) return <main id="main" className="container page"><Spinner /></main>;

  const errors = submitted ? validate(values) : {};
  const num = (x) => (x === '' ? '' : Number(x));
  const set = (key, cast = (x) => x) => (e) => setValues((v) => ({ ...v, [key]: cast(e.target.value) }));
  const setRoom = (i, key, cast = (x) => x) => (e) =>
    setValues((v) => ({
      ...v,
      rooms: v.rooms.map((r, j) => (j === i ? { ...r, [key]: key === 'breakfastIncluded' ? e.target.checked : cast(e.target.value) } : r)),
    }));

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
      if (isNew) await adminApi.hotels.create(payload);
      else await adminApi.hotels.update(id, payload);
      navigate('/admin/hotels');
    } catch (err) {
      setServerErrors(err.details?.length ? err.details.map((d) => `${humanizePath(d.path)}: ${d.message}`) : [err.message]);
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <main id="main" className="container page narrow">
      <Link to="/admin/hotels" className="btn-text back-link">
        ← All hotels
      </Link>
      <h1>{isNew ? 'Add a hotel' : 'Edit hotel'}</h1>
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
          <h2 className="h3">Hotel</h2>
          <div className="form-grid cols-2">
            <Field label="Name" value={values.name} onChange={set('name')} error={errors.name} />
            <Field as="select" label="City" value={values.city} onChange={set('city')} error={errors.city}>
              {CITIES.map((c) => (
                <option key={c.code} value={c.city}>
                  {c.city}
                </option>
              ))}
            </Field>
            <Field label="Address" optional value={values.address} onChange={set('address')} />
            <Field as="select" label="Star rating" value={values.starRating} onChange={set('starRating', num)}>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={s}>
                  {s} stars
                </option>
              ))}
            </Field>
          </div>
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            <Field as="textarea" label="Description" optional value={values.description} onChange={set('description')} />
            <Field label="Amenities" optional hint="Comma-separated" value={values.amenities} onChange={set('amenities')} />
            <Field label="Photo paths" optional hint="Comma-separated, e.g. /images/seed/hotels/hotel-1.jpg" value={values.photos} onChange={set('photos')} />
          </div>
        </section>

        <section className="card">
          <div className="spread">
            <h2 className="h3">Room types</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setValues((v) => ({ ...v, rooms: [...v.rooms, emptyRoom()] }))}>
              Add room type
            </button>
          </div>
          {errors.rooms && <p className="field-error">{errors.rooms}</p>}
          {values.rooms.map((r, i) => (
            <fieldset key={i} className="repeat-row">
              <legend>Room type {i + 1}</legend>
              <div className="form-grid cols-4">
                <Field label="Name" value={r.name} onChange={setRoom(i, 'name')} error={errors[`rooms.${i}.name`]} />
                <Field label="Bed type" value={r.bedType} onChange={setRoom(i, 'bedType')} />
                <Field label="Max adults" type="number" min={1} max={8} value={r.adults} onChange={setRoom(i, 'adults', num)} error={errors[`rooms.${i}.adults`]} />
                <Field label="Max children" type="number" min={0} max={6} value={r.children} onChange={setRoom(i, 'children', num)} />
                <Field label="Price / night (₹)" type="number" min={0} value={r.price} onChange={setRoom(i, 'price', num)} error={errors[`rooms.${i}.price`]} />
                <Field label="Taxes / night (₹)" type="number" min={0} value={r.taxesAndFees} onChange={setRoom(i, 'taxesAndFees', num)} />
                <Field label="Rooms available" type="number" min={0} value={r.roomsAvailable} onChange={setRoom(i, 'roomsAvailable', num)} />
                <label className="checkbox">
                  <input type="checkbox" checked={r.breakfastIncluded} onChange={setRoom(i, 'breakfastIncluded')} /> Breakfast included
                </label>
                <Field label="Free cancel until (days before)" type="number" min={0} max={30} value={r.freeDays} onChange={setRoom(i, 'freeDays', num)} />
                <Field label="Cancellation fee (₹)" type="number" min={0} value={r.fee} onChange={setRoom(i, 'fee', num)} />
                <Field label="Room amenities" optional hint="Comma-separated" value={r.amenities} onChange={setRoom(i, 'amenities')} className="span-2" />
              </div>
              {values.rooms.length > 1 && (
                <button type="button" className="btn-text small" onClick={() => setValues((v) => ({ ...v, rooms: v.rooms.filter((_, j) => j !== i) }))}>
                  Remove room type {i + 1}
                </button>
              )}
            </fieldset>
          ))}
        </section>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create hotel' : 'Save changes'}
          </button>
          <Link to="/admin/hotels" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
