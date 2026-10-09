import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import MockPayment from '../components/MockPayment.jsx';
import { Banner, EmptyState, Spinner } from '../components/States.jsx';
import { meApi, paymentsApi } from '../api/resources.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { clearDraft, loadDraft, updateDraft } from '../lib/checkoutDraft.js';
import { formatDateTime, formatPrice } from '../lib/format.js';
import { NAME_PART_MAX, validateDetails } from '../lib/validation.js';

const TYPE_LABEL = { adult: 'Adult (12+)', child: 'Child (2–11)', infant: 'Infant (under 2)' };

function splitName(full = '') {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] } : { firstName: parts[0] || '', lastName: '' };
}

function initialDetails(draft, user) {
  if (draft.details) return draft.details;
  const slots = draft.type === 'flight' ? draft.travellers : [{ ageCategory: 'adult', label: 'Lead guest' }];
  const people = slots.map((slot, i) => ({ ...(i === 0 ? splitName(user?.name) : { firstName: '', lastName: '' }), ageCategory: slot.ageCategory, label: slot.label }));
  return { people, email: user?.email || '', phone: user?.phone || '', specialRequest: '', saveTravellers: false };
}

function bookingFrom(draft, details) {
  const specialRequest = details.specialRequest.trim();
  if (draft.type === 'flight') {
    return {
      type: 'flight',
      itemId: draft.itemId,
      fareType: draft.fareType,
      travellers: draft.travellers.map((t, i) => ({
        firstName: details.people[i].firstName.trim(),
        lastName: details.people[i].lastName.trim(),
        ageCategory: t.ageCategory,
        seat: t.seat || '',
        meal: t.meal || '',
      })),
      specialRequest,
    };
  }
  return {
    type: 'hotel',
    itemId: draft.itemId,
    roomTypeName: draft.roomTypeName,
    ratePlan: draft.ratePlan,
    breakfast: Boolean(draft.breakfast),
    rooms: Number(draft.rooms),
    checkIn: draft.checkIn,
    checkOut: draft.checkOut,
    adults: Number(draft.adults),
    children: Number(draft.children),
    guests: [{ firstName: details.people[0].firstName.trim(), lastName: details.people[0].lastName.trim() }],
    specialRequest,
  };
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
  const [saved, setSaved] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [offerCode, setOfferCode] = useState(draft?.offerCode || '');
  const [codeOpen, setCodeOpen] = useState(Boolean(draft?.offerCode));
  const [codeInput, setCodeInput] = useState(draft?.offerCode || '');
  const [priceChange, setPriceChange] = useState(null);
  const [applying, setApplying] = useState(false);
  const paying = useRef(false); // ignores a second click before React re-renders

  useEffect(() => {
    meApi
      .travellers()
      .then(({ travellers }) => setSaved(travellers))
      .catch(() => {});
  }, []);

  const isFlight = draft?.type === 'flight';
  const loadQuote = useCallback(
    async (code) => {
      setQuoteError(null);
      try {
        const q = await paymentsApi.quote({ booking: bookingFrom(draft, details), offerCode: code || undefined });
        setQuote(q);
        return q;
      } catch (err) {
        setQuoteError(err);
        return null;
      }
    },
    [draft, details],
  );

  useEffect(() => {
    if (step === 'pay' && draft && !quote && !quoteError) loadQuote(offerCode);
  }, [step, draft, quote, quoteError, loadQuote, offerCode]);

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
  const valid = (key) => Boolean(touched[key] && !errors[key]);
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const setPerson = (i, key) => (e) => setDetails((d) => ({ ...d, people: d.people.map((p, j) => (j === i ? { ...p, [key]: e.target.value } : p)) }));
  const setField = (key) => (e) => setDetails((d) => ({ ...d, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const pickSaved = (i, id) => {
    const t = saved.find((s) => s._id === id);
    if (t) setDetails((d) => ({ ...d, people: d.people.map((p, j) => (j === i ? { ...p, firstName: t.firstName, lastName: t.lastName } : p)) }));
  };

  function continueToPay(e) {
    e.preventDefault();
    const all = Object.fromEntries(Object.keys(errors).map((k) => [k, true]));
    setTouched((t) => ({ ...t, ...all, email: true, phone: true }));
    if (Object.keys(errors).length) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    updateDraft({ details });
    setQuote(null);
    setQuoteError(null);
    setPriceChange(null);
    setStep('pay');
    window.scrollTo({ top: 0 });
  }

  async function applyCode(e) {
    e.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (applying) return;
    setApplying(true);
    const q = await loadQuote(code);
    setApplying(false);
    if (q && !q.codeError) {
      setOfferCode(code);
      updateDraft({ offerCode: code });
    }
  }

  async function removeCode() {
    setOfferCode('');
    setCodeInput('');
    updateDraft({ offerCode: '' });
    await loadQuote('');
  }

  async function pay(choice) {
    if (paying.current || !quote) return;
    paying.current = true;
    setStatus({ state: 'processing', method: choice.method });
    setPriceChange(null);
    // A short, honest pause so the "waiting for payment" state is perceivable.
    await new Promise((r) => setTimeout(r, choice.method === 'upi' ? 1500 : 900));
    try {
      const { booking } = await paymentsApi.mock({
        idempotencyKey: draft.idempotencyKey,
        method: choice.method,
        simulateFailure: choice.simulateFailure,
        expectedTotal: quote.fareBreakdown.total,
        offerCode: quote.offer?.how === 'code' ? quote.offer.code : undefined,
        saveTravellers: details.saveTravellers,
        booking: { ...bookingFrom(draft, details), contact: { email: details.email.trim(), phone: details.phone.trim() } },
      });
      clearDraft();
      navigate(`/bookings/${booking.bookingReference}/confirmation`, { replace: true });
    } catch (err) {
      if (err.code === 'PRICE_CHANGED' && err.body?.quote) {
        // Nothing was charged: show the new total and let the traveller pay again.
        setPriceChange({ from: quote.fareBreakdown.total, to: err.body.quote.fareBreakdown.total, reason: err.body.error.reason });
        setQuote(err.body.quote);
        if (err.body.quote.offer?.how !== 'code') setOfferCode('');
        setStatus({ state: 'idle' });
      } else {
        setStatus({ state: err.code === 'PAYMENT_FAILED' ? 'failed' : 'error', error: err });
      }
    } finally {
      paying.current = false;
    }
  }

  const party = draft.party;
  const backToItem = isFlight
    ? `/flights/${draft.itemId}?${new URLSearchParams({ ...(party || { adults: draft.travellers.length }), cabin: draft.cabin || 'economy' })}`
    : `/hotels/${draft.itemId}?${new URLSearchParams({ checkIn: draft.checkIn, checkOut: draft.checkOut, adults: draft.adults, children: draft.children, rooms: draft.rooms })}`;
  const total = quote?.fareBreakdown.total ?? draft.display.estimate;
  const f = quote?.fareBreakdown;

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
                <p className="small muted">Names must match the traveller’s Aadhaar ID. Atlas doesn’t check this.</p>
                <div className="stack">
                  {details.people.map((p, i) => {
                    const options = saved.filter((s) => !isFlight || s.ageCategory === p.ageCategory);
                    return (
                      <fieldset key={i} className="traveller-row">
                        <legend>
                          {p.label}
                          {isFlight && <span className="small muted"> · {TYPE_LABEL[p.ageCategory]}</span>}
                          {p.ageCategory === 'infant' && <span className="small muted"> — travels with Adult {details.people.slice(0, i + 1).filter((x) => x.ageCategory === 'infant').length}</span>}
                        </legend>
                        {options.length > 0 && (
                          <div className="field saved-picker">
                            <label htmlFor={`saved-${i}`} className="small">
                              Choose a saved traveller
                            </label>
                            <select id={`saved-${i}`} className="select" value="" onChange={(e) => pickSaved(i, e.target.value)}>
                              <option value="">—</option>
                              {options.map((s) => (
                                <option key={s._id} value={s._id}>
                                  {s.firstName} {s.lastName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="form-grid cols-2">
                          <Field
                            label="First name"
                            maxLength={NAME_PART_MAX}
                            autoComplete={i === 0 ? 'given-name' : 'off'}
                            value={p.firstName}
                            onChange={setPerson(i, 'firstName')}
                            onBlur={touch(`people.${i}.firstName`)}
                            error={shown(`people.${i}.firstName`)}
                            valid={valid(`people.${i}.firstName`)}
                          />
                          <Field
                            label="Last name"
                            maxLength={NAME_PART_MAX}
                            autoComplete={i === 0 ? 'family-name' : 'off'}
                            value={p.lastName}
                            onChange={setPerson(i, 'lastName')}
                            onBlur={touch(`people.${i}.lastName`)}
                            error={shown(`people.${i}.lastName`)}
                            valid={valid(`people.${i}.lastName`)}
                          />
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
                <label className="checkbox small" style={{ marginTop: 'var(--space-3)' }}>
                  <input type="checkbox" checked={details.saveTravellers} onChange={setField('saveTravellers')} /> Save {isFlight && details.people.length > 1 ? 'these travellers' : 'this traveller'} to my account
                </label>
              </section>

              <section className="card">
                <h2 className="h3">Contact details</h2>
                <p className="small muted">We’ll send the confirmation here.</p>
                <div className="form-grid cols-2">
                  <Field label="Email" type="email" autoComplete="email" value={details.email} onChange={setField('email')} onBlur={touch('email')} error={shown('email')} valid={valid('email')} />
                  <Field
                    label="Mobile number"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={details.phone}
                    onChange={setField('phone')}
                    onBlur={touch('phone')}
                    error={shown('phone')}
                    valid={valid('phone')}
                    hint="10 digits, without +91"
                  />
                </div>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <Field
                    as="textarea"
                    label="Special requests"
                    optional
                    maxLength={500}
                    value={details.specialRequest}
                    onChange={setField('specialRequest')}
                    error={shown('specialRequest')}
                    hint={`${isFlight ? 'Wheelchair at arrival, a bassinet…' : 'Late check-in, a quiet room…'} The ${isFlight ? 'airline' : 'hotel'} will reply; requests aren’t guaranteed. ${500 - details.specialRequest.length} characters left.`}
                  />
                </div>
              </section>

              <button type="submit" className="btn btn-primary">
                Continue to review
              </button>
            </form>
          ) : (
            <>
              {priceChange && (
                <div className="notice-sand" role="status">
                  <p>
                    <strong>
                      The price changed from {formatPrice(priceChange.from)} to {formatPrice(priceChange.to)}.
                    </strong>
                  </p>
                  <p className="small">{priceChange.reason} No payment was taken — check the new total and pay again.</p>
                </div>
              )}
              {status.state === 'failed' && (
                <Banner tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus({ state: 'idle' })}>Try again</button>}>
                  <p>{status.error.message}</p>
                </Banner>
              )}
              {status.state === 'error' && (
                <Banner
                  tone="error"
                  action={
                    status.error.code === 'VALIDATION_ERROR' || status.error.code === 'DUPLICATE_NAMES' ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setStatus({ state: 'idle' }); setStep('details'); }}>
                        Edit details
                      </button>
                    ) : status.error.code === 'STAY_LIMIT' ? (
                      <Link to="/bookings" className="btn btn-secondary btn-sm">
                        View my trips
                      </Link>
                    ) : ['NETWORK', 'SERVER_ERROR', 'RATE_LIMITED'].includes(status.error.code) ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus({ state: 'idle' })}>
                        Try again
                      </button>
                    ) : (
                      <Link to={backToItem} className="btn btn-secondary btn-sm">
                        Choose again
                      </Link>
                    )
                  }
                >
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
                      {p.firstName} {p.lastName}
                      {isFlight && (
                        <span className="muted small">
                          {' '}
                          · {TYPE_LABEL[p.ageCategory]}
                          {draft.travellers[i].seat && ` · seat ${draft.travellers[i].seat}`}
                          {draft.travellers[i].meal && ` · ${draft.travellers[i].meal}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {details.specialRequest.trim() && <p className="small">Special request: {details.specialRequest.trim()}</p>}
                <p className="small muted">
                  {details.email} · {details.phone}
                </p>
              </section>

              {quoteError && (
                <Banner tone="error" action={<Link to={backToItem} className="btn btn-secondary btn-sm">Choose again</Link>}>
                  <p>{quoteError.message}</p>
                </Banner>
              )}
              {!quote && !quoteError && <Spinner label="Checking the latest price…" />}

              {quote && (
                <section className="card offer-box" aria-labelledby="offer-heading">
                  <h2 id="offer-heading" className="h4">
                    Offer
                  </h2>
                  {quote.offer ? (
                    <div className="offer-applied">
                      <Icon name="check" size={18} />
                      <p>
                        <strong>{quote.offer.code || quote.offer.title}</strong> · {quote.offer.summary} · −{formatPrice(quote.offer.amount)}
                        <span className="small muted"> {quote.offer.how === 'auto' ? '(applied automatically)' : ''}</span>
                      </p>
                      {quote.offer.how === 'code' && (
                        <button type="button" className="btn-text small" onClick={removeCode} disabled={status.state === 'processing'}>
                          Remove
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="small muted">No offer applies to this booking.</p>
                  )}
                  <details className="code-disclosure" open={codeOpen} onToggle={(e) => setCodeOpen(e.currentTarget.open)}>
                    <summary>Have a code?</summary>
                    <form className="row code-form" onSubmit={applyCode} noValidate>
                      <label htmlFor="offer-code" className="sr-only">
                        Offer code
                      </label>
                      <input
                        id="offer-code"
                        className="input"
                        value={codeInput}
                        maxLength={20}
                        autoComplete="off"
                        placeholder="e.g. WELCOME10"
                        onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                        aria-invalid={quote.codeError ? 'true' : undefined}
                        aria-describedby={quote.codeError ? 'offer-code-error' : undefined}
                      />
                      <button type="submit" className="btn btn-secondary btn-sm" disabled={!codeInput.trim() || applying || status.state === 'processing'} aria-busy={applying || undefined}>
                        Apply
                      </button>
                    </form>
                    {quote.codeError && (
                      <p id="offer-code-error" className="field-error small">
                        {quote.codeError}
                      </p>
                    )}
                  </details>
                </section>
              )}

              {status.state === 'processing' && (
                <div className="card">
                  <Spinner label={status.method === 'upi' ? 'Waiting for payment…' : 'Processing payment…'} />
                </div>
              )}
              {/* Kept mounted while processing so a declined card keeps its method and details for the retry.
                  Hidden after an availability error: the only way forward is to choose again. */}
              {quote && status.state !== 'error' && (
                <div hidden={status.state === 'processing'}>
                  <MockPayment amount={quote.fareBreakdown.total} busy={status.state === 'processing'} onPay={pay} />
                </div>
              )}
            </>
          )}
        </div>

        <aside className="price-summary" aria-label="Booking summary">
          <div className="card price-summary-card">
            <h2 className="price-summary-title">{draft.display.title}</h2>
            <p className="small">{draft.display.subtitle}</p>
            <p className="small muted">{draft.display.when}</p>
            {draft.display.party && <p className="small muted">{draft.display.party}</p>}
            {f ? (
              <dl className="price-lines">
                <div className="price-line">
                  <dt>{isFlight ? 'Base fare' : 'Room charges'}</dt>
                  <dd>{formatPrice(f.base)}</dd>
                </div>
                {f.discounts > 0 && (
                  <div className="price-line price-line-offer">
                    <dt>{quote.offer?.code || quote.offer?.title}</dt>
                    <dd>−{formatPrice(f.discounts)}</dd>
                  </div>
                )}
                {f.infantFees > 0 && (
                  <div className="price-line">
                    <dt>Infant fees</dt>
                    <dd>{formatPrice(f.infantFees)}</dd>
                  </div>
                )}
                {f.seatCharges + f.mealCharges > 0 && (
                  <div className="price-line">
                    <dt>Seats &amp; meals</dt>
                    <dd>{formatPrice(f.seatCharges + f.mealCharges)}</dd>
                  </div>
                )}
                {f.breakfast > 0 && (
                  <div className="price-line">
                    <dt>Breakfast</dt>
                    <dd>{formatPrice(f.breakfast)}</dd>
                  </div>
                )}
                <div className="price-line">
                  <dt>Taxes</dt>
                  <dd>{formatPrice(f.taxes)}</dd>
                </div>
                <div className="price-line price-total">
                  <dt>Total</dt>
                  <dd>
                    {formatPrice(f.total)}
                  </dd>
                </div>
              </dl>
            ) : (
              <dl className="price-lines">
                <div className="price-line price-total">
                  <dt>Estimated total</dt>
                  <dd>{total ? formatPrice(total) : '—'}</dd>
                </div>
              </dl>
            )}
            <p className="small muted">{quote?.policy.terms || draft.display.policy}</p>
            {quote?.policy.freeUntil && <p className="small muted">Free cancellation until {formatDateTime(quote.policy.freeUntil)}.</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}
