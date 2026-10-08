import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { errorLines } from '../../lib/consoleForm.js';

const blankRoom = () => ({
  originalName: null,
  name: '',
  occupancy: { adults: 2, children: 0 },
  bedType: 'King bed',
  amenities: [],
  breakfastIncluded: false,
  price: '',
  taxesAndFees: 0,
  roomsTotal: 5,
  salesStopped: false,
});

const fromHotel = (h) => ({
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
    price: r.price,
    taxesAndFees: r.taxesAndFees,
    roomsTotal: r.roomsTotal ?? r.roomsAvailable,
    roomsAvailable: r.roomsAvailable,
    salesStopped: Boolean(r.salesStopped),
  })),
});

function validate(v) {
  const e = {};
  if (v.description.trim().length < 20) e.description = 'Write at least a sentence or two';
  if (!v.photos.length) e.photos = 'Pick at least one photo';
  if (v.photos.length > 3) e.photos = 'Pick up to three photos';
  if (!v.roomTypes.length) e.roomTypes = 'Keep at least one room type';
  const names = v.roomTypes.map((r) => r.name.trim().toLowerCase());
  v.roomTypes.forEach((r, i) => {
    if (r.name.trim().length < 2) e[`room${i}.name`] = 'Required';
    else if (names.indexOf(r.name.trim().toLowerCase()) !== i) e[`room${i}.name`] = 'Room names must be unique';
    if (!(Number(r.price) >= 500)) e[`room${i}.price`] = 'At least ₹500';
    if (!(Number(r.occupancy.adults) >= 1)) e[`room${i}.adults`] = 'At least 1';
    if (!(Number(r.roomsTotal) >= 0)) e[`room${i}.roomsTotal`] = '0 or more';
  });
  return e;
}

const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export default function HotelProperty() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Property & rooms`);
  const [values, setValues] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([supplierApi.hotel.get(), supplierApi.catalogue()])
      .then(([{ hotel }, cat]) => {
        setValues(fromHotel(hotel));
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
        roomTypes: values.roomTypes.map(({ roomsAvailable: _avail, ...r }) => ({
          ...r,
          occupancy: { adults: Number(r.occupancy.adults), children: Number(r.occupancy.children) },
          price: Number(r.price),
          taxesAndFees: Number(r.taxesAndFees),
          roomsTotal: Number(r.roomsTotal),
        })),
      });
      setValues(fromHotel(hotel));
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
          <p className="small muted">Pick up to three from the Atlas gallery, in order. The first is the main photo. Uploads aren’t available.</p>
          <div className="gallery-picker" role="group" aria-label="Photo gallery" aria-describedby={errors.photos ? 'photos-error' : undefined}>
            {catalogue.gallery.map((src) => {
              const position = values.photos.indexOf(src);
              return (
                <button
                  key={src}
                  type="button"
                  className={`gallery-option ${position >= 0 ? 'is-picked' : ''}`}
                  aria-pressed={position >= 0}
                  aria-label={`Gallery photo ${src.match(/(\d+)\.jpg$/)?.[1]}${position >= 0 ? `, picked as photo ${position + 1}` : ''}`}
                  onClick={() => set('photos', toggle(values.photos, src))}
                >
                  <img src={src} alt="" loading="lazy" />
                  {position >= 0 && <span className="gallery-order">{position + 1}</span>}
                </button>
              );
            })}
          </div>
          {errors.photos && (
            <p id="photos-error" className="field-error">
              {errors.photos}
            </p>
          )}
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
                <Field label="Price / night (₹)" type="number" min={500} value={r.price} onChange={(e) => setRoom(i, { price: e.target.value })} error={errors[`room${i}.price`]} hint="Until your rate card is set up" />
                <Field label="Taxes / night (₹)" type="number" min={0} value={r.taxesAndFees} onChange={(e) => setRoom(i, { taxesAndFees: e.target.value })} />
                <Field
                  label="Rooms of this type"
                  type="number"
                  min={0}
                  value={r.roomsTotal}
                  onChange={(e) => setRoom(i, { roomsTotal: e.target.value })}
                  error={errors[`room${i}.roomsTotal`]}
                  hint={r.originalName ? `${r.roomsAvailable} free right now` : undefined}
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
          <p className="small muted">A room type that has bookings can’t be removed or renamed — stop its sales instead.</p>
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
