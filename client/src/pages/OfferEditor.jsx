import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import Field from '../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../components/States.jsx';
import { adminApi, supplierApi } from '../api/resources.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { errorLines } from '../lib/consoleForm.js';
import { addDays, todayIst } from '../lib/dates.js';

// Mirrors OFFER_IMAGES on the server: themed offer artwork, never city or hotel photos.
const IMAGES = ['welcome', 'plane-sky', 'wing-sunset', 'plane-landing', 'business-cabin', 'luggage', 'summer-kit', 'gift', 'marigold', 'diya', 'kites', 'holi-colours', 'breakfast-tray', 'room-keys'].map((n) => `/images/seed/offers/${n}.jpg`);

const blank = (scope) => ({
  title: '',
  summary: '',
  description: '',
  image: IMAGES[0],
  auto: false,
  code: '',
  scope,
  discountType: 'percent',
  value: 10,
  maxDiscount: 1000,
  minSpend: 0,
  validFrom: todayIst(),
  validTo: addDays(todayIst(), 30),
  redemptionLimit: '',
  firstBookingsOnly: false,
});

// Create or edit an offer — supplier offers for own items, or platform offers (admin). Workflow 18.
export default function OfferEditor({ scope }) {
  const ctx = useOutletContext();
  const supplier = ctx?.supplier;
  const api = scope === 'admin' ? adminApi.offers : supplierApi.offers;
  const base = scope === 'admin' ? '/admin/offers' : '/supplier/offers';
  const lockedScope = supplier ? (supplier.kind === 'airline' ? 'flights' : 'hotels') : null;
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Create offer' : 'Edit offer');
  const navigate = useNavigate();
  const [values, setValues] = useState(isNew ? blank(lockedScope || 'both') : null);
  const [redemptions, setRedemptions] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [save, setSave] = useState({ busy: false, errors: null });

  useEffect(() => {
    if (isNew) return;
    api
      .get(id)
      .then(({ offer }) => {
        setRedemptions(offer.redemptions);
        setValues({
          ...blank(offer.scope),
          ...offer,
          code: offer.code || '',
          maxDiscount: offer.maxDiscount ?? 1000,
          redemptionLimit: offer.redemptionLimit ?? '',
          description: offer.description || '',
        });
      })
      .catch(setLoadError);
  }, [api, id, isNew]);

  if (loadError) return <ErrorState error={loadError} />;
  if (!values) return <Spinner />;
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSave({ busy: true, errors: null });
    const body = {
      title: values.title.trim(),
      summary: values.summary.trim(),
      description: values.description.trim(),
      image: values.image,
      auto: values.auto,
      code: values.auto ? null : values.code.trim().toUpperCase(),
      scope: lockedScope || values.scope,
      discountType: values.discountType,
      value: Number(values.value),
      maxDiscount: values.discountType === 'percent' ? Number(values.maxDiscount) : null,
      minSpend: Number(values.minSpend) || 0,
      validFrom: values.validFrom,
      validTo: values.validTo,
      redemptionLimit: values.redemptionLimit === '' ? null : Number(values.redemptionLimit),
      firstBookingsOnly: values.firstBookingsOnly,
    };
    try {
      if (isNew) await api.create(body);
      else await api.update(id, body);
      navigate(base);
    } catch (err) {
      setSave({ busy: false, errors: errorLines(err) });
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <div className="narrow-console">
      <Link to={base} className="btn-text back-link">
        ← All offers
      </Link>
      <h1 className="console-h1">{isNew ? (scope === 'admin' ? 'Create a platform offer' : 'Create an offer') : `Edit ${values.title}`}</h1>
      <p className="muted small">
        {scope === 'admin' ? 'Funded by Atlas.' : `Funded by ${supplier?.name}.`} Edits apply to future bookings only{redemptions ? ` — ${redemptions} bookings already used this offer and keep their discount` : ''}.
      </p>
      {save.errors && (
        <Banner tone="error">
          <p>Please fix the following:</p>
          <ul>
            {save.errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Banner>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        <section className="card">
          <h2 className="h3">What travellers see</h2>
          <Field label="Title" maxLength={80} value={values.title} onChange={set('title')} />
          <Field label="One-line summary" maxLength={140} value={values.summary} onChange={set('summary')} hint="e.g. 10% off stays, up to ₹1,500" />
          <Field as="textarea" label="Description" optional rows={3} maxLength={600} value={values.description} onChange={set('description')} />
          <fieldset className="check-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
            <legend className="field-label">Image</legend>
            {IMAGES.map((src) => (
              <button key={src} type="button" className={`gallery-option ${values.image === src ? 'is-picked' : ''}`} aria-pressed={values.image === src} aria-label={`Use image ${src.split('/').pop()}`} onClick={() => setValues((v) => ({ ...v, image: src }))}>
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </fieldset>
        </section>

        <section className="card">
          <h2 className="h3">How it applies</h2>
          <div className="form-grid cols-2">
            <Field as="select" label="Applied" value={values.auto ? 'auto' : 'code'} onChange={(e) => setValues((v) => ({ ...v, auto: e.target.value === 'auto' }))}>
              <option value="code">With a code</option>
              <option value="auto">Automatically</option>
            </Field>
            {!values.auto && <Field label="Code" value={values.code} maxLength={16} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))} hint="4–16 letters and digits" />}
            {!lockedScope && (
              <Field as="select" label="Products" value={values.scope} onChange={set('scope')}>
                <option value="both">Flights and hotels</option>
                <option value="flights">Flights</option>
                <option value="hotels">Hotels</option>
              </Field>
            )}
            <Field as="select" label="Discount" value={values.discountType} onChange={set('discountType')}>
              <option value="percent">Percent off</option>
              <option value="flat">Flat amount off</option>
            </Field>
            <Field label={values.discountType === 'percent' ? 'Percent' : 'Amount (₹)'} type="number" min="1" value={values.value} onChange={set('value')} />
            {values.discountType === 'percent' && <Field label="Maximum discount (₹)" type="number" min="1" value={values.maxDiscount} onChange={set('maxDiscount')} />}
            <Field label="Minimum spend (₹)" type="number" min="0" value={values.minSpend} onChange={set('minSpend')} hint="On the base fare or room charges" />
            <Field label="Valid from (booking date)" type="date" value={values.validFrom} onChange={set('validFrom')} />
            <Field label="Valid to (booking date)" type="date" value={values.validTo} onChange={set('validTo')} />
            <Field label="Redemption limit" optional type="number" min="1" value={values.redemptionLimit} onChange={set('redemptionLimit')} hint="Leave empty for no limit" />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={values.firstBookingsOnly} onChange={set('firstBookingsOnly')} /> Only for a traveller’s first 3 bookings on Atlas
          </label>
          <p className="small muted">The discount applies to the base fare or room charges only — never taxes, seats, meals, infant fees or breakfast — and never more than that amount.</p>
        </section>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={save.busy} aria-busy={save.busy || undefined}>
            {save.busy ? 'Saving…' : isNew ? 'Create offer' : 'Save changes'}
          </button>
          <Link to={base} className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
