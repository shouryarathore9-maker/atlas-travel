import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import MockPayment from '../components/MockPayment.jsx';
import { Banner, EmptyState, Spinner } from '../components/States.jsx';
import { paymentsApi } from '../api/resources.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { clearDraft, loadDraft, updateDraft } from '../lib/checkoutDraft.js';
import { formatPrice } from '../lib/format.js';
import { validateDetails } from '../lib/validation.js';

function initialDetails(draft, user) {
  if (draft.details) return draft.details;
  const people =
    draft.type === 'flight'
      ? draft.travellers.map((_, i) => ({ name: i === 0 ? user?.name || '' : '', ageCategory: 'adult' }))
      : [{ name: user?.name || '', ageCategory: 'adult' }];
  return { people, email: user?.email || '', phone: user?.phone || '', specialRequests: '' };
}

export default function Checkout() {
  useDocumentTitle('Checkout');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [draft] = useState(loadDraft);
  const [details, setDetails] = useState(() => (draft ? initialDetails(draft, user) : null));
  const [touched, setTouched] = useState({});
  const [step, setStep] = useState(draft?.details ? 'pay' : 'details');
  const [status, setStatus] = useState({ state: 'idle' }); // idle | processing | failed | error

  if (!draft) {
    return (
      <main id="main" className="container page">
        <EmptyState title="Nothing to check out yet" action={<Link to="/" className="btn btn-secondary">Start a search</Link>}>
          Choose a flight or a room first, and we’ll bring you back here.
        </EmptyState>
      </main>
    );
  }

  const errors = validateDetails(details);
  const shown = (key) => (touched[key] ? errors[key] : undefined);
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const setPerson = (i, key) => (e) =>
    setDetails((d) => ({ ...d, people: d.people.map((p, j) => (j === i ? { ...p, [key]: e.target.value } : p)) }));
  const setField = (key) => (e) => setDetails((d) => ({ ...d, [key]: e.target.value }));
  const total = draft.display.breakdown.total;
  const isFlight = draft.type === 'flight';

  function continueToPay(e) {
    e.preventDefault();
    const all = Object.fromEntries(Object.keys(errors).map((k) => [k, true]));
    setTouched((t) => ({ ...t, ...all, email: true, phone: true }));
    if (Object.keys(errors).length) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    updateDraft({ details });
    setStep('pay');
    window.scrollTo({ top: 0 });
  }

  function buildPayload({ method, simulateFailure }) {
    const contact = { email: details.email.trim(), phone: details.phone.trim() };
    const booking = isFlight
      ? {
          type: 'flight',
          itemId: draft.itemId,
          fareType: draft.fareType,
          travellers: draft.travellers.map((t, i) => ({ ...details.people[i], name: details.people[i].name.trim(), seat: t.seat, meal: t.meal })),
          contact,
        }
      : {
          type: 'hotel',
          itemId: draft.itemId,
          roomTypeName: draft.roomTypeName,
          rooms: Number(draft.rooms),
          checkIn: draft.checkIn,
          checkOut: draft.checkOut,
          adults: Number(draft.adults),
          children: Number(draft.children),
          guests: details.people.map((p) => ({ ...p, name: p.name.trim() })),
          specialRequests: details.specialRequests.trim(),
          contact,
        };
    return { idempotencyKey: draft.idempotencyKey, method, simulateFailure, booking };
  }

  async function pay(choice) {
    setStatus({ state: 'processing', method: choice.method });
    // A short, honest pause so the "waiting for payment" state is perceivable.
    await new Promise((r) => setTimeout(r, choice.method === 'upi' ? 1500 : 900));
    try {
      const { booking } = await paymentsApi.mock(buildPayload(choice));
      clearDraft();
      navigate(`/bookings/${booking.bookingReference}/confirmation`, { replace: true });
    } catch (err) {
      setStatus({ state: err.code === 'PAYMENT_FAILED' ? 'failed' : 'error', error: err });
    }
  }

  const backToItem = isFlight ? `/flights/${draft.itemId}?travellers=${draft.travellers.length}` : `/hotels/${draft.itemId}`;

  return (
    <main id="main" className="container page">
      <p className="eyebrow">Step {step === 'details' ? '1' : '2'} of 2</p>
      <h1>{step === 'details' ? (isFlight ? 'Who’s travelling?' : 'Who’s staying?') : 'Review and pay'}</h1>

      <div className="detail-layout">
        <div className="detail-main stack">
          {step === 'details' ? (
            <form onSubmit={continueToPay} noValidate className="stack">
              <section className="card">
                <h2 className="h3">{isFlight ? 'Travellers' : 'Lead guest'}</h2>
                <p className="small muted">Names must match government ID.</p>
                <div className="stack">
                  {details.people.map((p, i) => (
                    <fieldset key={i} className="form-grid cols-2">
                      {details.people.length > 1 && <legend>Traveller {i + 1}</legend>}
                      <Field
                        label="Full name"
                        autoComplete={i === 0 ? 'name' : 'off'}
                        value={p.name}
                        onChange={setPerson(i, 'name')}
                        onBlur={touch(`people.${i}.name`)}
                        error={shown(`people.${i}.name`)}
                      />
                      {isFlight && (
                        <Field as="select" label="Age group" value={p.ageCategory} onChange={setPerson(i, 'ageCategory')}>
                          <option value="adult">Adult (12+)</option>
                          <option value="child">Child (2–11)</option>
                        </Field>
                      )}
                    </fieldset>
                  ))}
                </div>
              </section>

              <section className="card">
                <h2 className="h3">Contact details</h2>
                <p className="small muted">We’ll send the confirmation here.</p>
                <div className="form-grid cols-2">
                  <Field label="Email" type="email" autoComplete="email" value={details.email} onChange={setField('email')} onBlur={touch('email')} error={shown('email')} />
                  <Field
                    label="Mobile number"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={details.phone}
                    onChange={setField('phone')}
                    onBlur={touch('phone')}
                    error={shown('phone')}
                    hint="10 digits, without +91"
                  />
                </div>
                {!isFlight && (
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <Field
                      as="textarea"
                      label="Special requests"
                      optional
                      maxLength={500}
                      value={details.specialRequests}
                      onChange={setField('specialRequests')}
                      hint="Early check-in, a quiet room… The hotel will do its best."
                    />
                  </div>
                )}
              </section>

              <button type="submit" className="btn btn-primary">
                Continue to payment
              </button>
            </form>
          ) : (
            <>
              {status.state === 'failed' && (
                <Banner tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus({ state: 'idle' })}>Try again</button>}>
                  <p>{status.error.message}</p>
                </Banner>
              )}
              {status.state === 'error' && (
                <Banner tone="error" action={<Link to={backToItem} className="btn btn-secondary btn-sm">Choose again</Link>}>
                  <p>{status.error.message}</p>
                </Banner>
              )}

              <section className="card">
                <div className="spread">
                  <h2 className="h3">{isFlight ? 'Travellers' : 'Guest'}</h2>
                  <button type="button" className="btn-text small" onClick={() => setStep('details')} disabled={status.state === 'processing'}>
                    Edit
                  </button>
                </div>
                <ul className="plain-list">
                  {details.people.map((p, i) => (
                    <li key={i}>
                      {p.name}
                      {isFlight && (
                        <span className="muted small">
                          {' '}
                          · {p.ageCategory}
                          {draft.travellers[i].seat && ` · seat ${draft.travellers[i].seat}`}
                          {draft.travellers[i].meal && ` · ${draft.travellers[i].meal}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="small muted">
                  {details.email} · {details.phone}
                </p>
              </section>

              {status.state === 'processing' ? (
                <div className="card">
                  <Spinner label={status.method === 'upi' ? 'Waiting for payment…' : 'Processing payment…'} />
                </div>
              ) : (
                <MockPayment amount={total} busy={status.state === 'processing'} onPay={pay} />
              )}
            </>
          )}
        </div>

        <aside className="price-summary" aria-label="Booking summary">
          <div className="card price-summary-card">
            <h2 className="price-summary-title">{draft.display.title}</h2>
            <p className="small">{draft.display.subtitle}</p>
            <p className="small muted">{draft.display.when}</p>
            <dl className="price-lines">
              <div className="price-line">
                <dt>Base</dt>
                <dd>{formatPrice(draft.display.breakdown.base)}</dd>
              </div>
              <div className="price-line">
                <dt>Taxes &amp; fees</dt>
                <dd>{formatPrice(draft.display.breakdown.taxes)}</dd>
              </div>
              {draft.display.breakdown.addons > 0 && (
                <div className="price-line">
                  <dt>Seats &amp; meals</dt>
                  <dd>{formatPrice(draft.display.breakdown.addons)}</dd>
                </div>
              )}
              <div className="price-line price-total">
                <dt>Total</dt>
                <dd>{formatPrice(total)}</dd>
              </div>
            </dl>
            {draft.display.policy && <p className="small muted">{draft.display.policy}</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}
