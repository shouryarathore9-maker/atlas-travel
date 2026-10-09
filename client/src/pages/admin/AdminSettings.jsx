import { useEffect, useState } from 'react';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

function TemplateRow({ template, onSaved }) {
  const [form, setForm] = useState({
    name: template.name,
    window: template.freeWindow?.value ?? '',
    fee: template.fee.amount ?? 0,
  });
  const [state, setState] = useState({ busy: false, error: null });
  const unit = template.kind === 'flight' ? 'hours' : 'days';
  async function save() {
    setState({ busy: true, error: null });
    try {
      const { template: saved } = await adminApi.saveTemplate(template.key, {
        name: form.name.trim(),
        freeWindow: form.window === '' || Number(form.window) === 0 ? null : { unit, value: Number(form.window) },
        feeAmount: template.fee.type === 'flat' ? Number(form.fee) : undefined,
      });
      onSaved(saved);
      setState({ busy: false, error: null });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }
  return (
    <tr>
      <th scope="row">
        <input className="input" aria-label={`${template.key} name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <span className="block small muted">
          {template.key} · {template.kind}
        </span>
      </th>
      <td>
        {template.fee.type === 'all' ? (
          <span className="small muted">none</span>
        ) : (
          <input className="input input-sm" type="number" min="0" aria-label={`${template.key} free window in ${unit}`} value={form.window} onChange={(e) => setForm({ ...form, window: e.target.value })} />
        )}
        <span className="small muted"> {template.fee.type === 'all' ? '' : unit}</span>
      </td>
      <td>
        {template.fee.type === 'flat' ? (
          <input className="input input-sm" type="number" min="0" aria-label={`${template.key} fee`} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
        ) : (
          <span className="small">{template.fee.type === 'oneNight' ? 'One night (one room)' : 'Whole amount (no refund)'}</span>
        )}
      </td>
      <td className="small">{template.terms}</td>
      <td>
        <button type="button" className="btn btn-secondary btn-sm" onClick={save} disabled={state.busy}>
          {state.busy ? 'Saving…' : 'Save'}
        </button>
        {state.error && <p className="field-error small">{state.error}</p>}
      </td>
    </tr>
  );
}

const LIMIT_FIELDS = [
  { path: ['maxMultiplier'], label: 'Highest multiplier (×)', step: '0.1', min: 1.2, max: 3 },
  { path: ['flightFare', 'min'], label: 'Lowest flight fare (₹)', step: '50' },
  { path: ['flightFare', 'max'], label: 'Highest flight fare (₹)', step: '50' },
  { path: ['hotelNight', 'min'], label: 'Lowest room night (₹)', step: '50' },
  { path: ['hotelNight', 'max'], label: 'Highest room night (₹)', step: '50' },
];
const getAt = (obj, [a, b]) => (b ? obj[a][b] : obj[a]);
const setAt = (obj, [a, b], v) => (b ? { ...obj, [a]: { ...obj[a], [b]: v } } : { ...obj, [a]: v });

// Platform-wide limits on supplier pricing inputs (prd.md → Admin console → Pricing limits).
function PricingLimits({ onSaved }) {
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, errors: {}, message: null });
  useEffect(() => {
    adminApi
      .pricingLimits()
      .then(({ limits }) => setForm(limits))
      .catch((e) => setState((s) => ({ ...s, message: e.message })));
  }, []);
  if (!form) return state.message ? <p className="field-error">{state.message}</p> : <Spinner />;

  async function save(e) {
    e.preventDefault();
    setState({ busy: true, errors: {}, message: null });
    const numeric = LIMIT_FIELDS.reduce((acc, f) => setAt(acc, f.path, Number(getAt(form, f.path))), form);
    try {
      const { limits } = await adminApi.savePricingLimits(numeric);
      setForm(limits);
      setState({ busy: false, errors: {}, message: null });
      onSaved();
    } catch (err) {
      const errors = Object.fromEntries((err.details || []).map((d) => [d.path, d.message]));
      setState({ busy: false, errors, message: err.details?.length ? null : err.message });
    }
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h2 className="h4">Pricing limits</h2>
      <p className="small muted">
        Guard rails for every supplier’s rate card, so a typo can’t produce an absurd price. Rate cards outside them can’t be saved, and the engine holds any price at the
        limit straight away — even for cards saved before a change.
      </p>
      <div className="limits-grid">
        {LIMIT_FIELDS.map((f) => (
          <Field
            key={f.path.join('.')}
            label={f.label}
            type="number"
            step={f.step}
            min={f.min}
            max={f.max}
            value={getAt(form, f.path)}
            onChange={(e) => setForm(setAt(form, f.path, e.target.value))}
            error={state.errors[f.path.join('.')]}
          />
        ))}
      </div>
      {state.message && <p className="field-error small">{state.message}</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy}>
        {state.busy ? 'Saving…' : 'Save limits'}
      </button>
    </form>
  );
}

const toPct = (rate) => String(Math.round(rate * 1000) / 10);

// What a product default is now, and what it becomes from next month if admin changed it.
function RateNote({ view }) {
  return (
    <p className="small muted">
      Now {toPct(view.current)}%{view.upcoming && ` · ${toPct(view.upcoming.rate)}% from 1 ${view.upcoming.label}`}
    </p>
  );
}

// Commission defaults, pricing limits and platform cancellation templates (prd.md → Workflows 26 and 32).
export default function AdminSettings() {
  useDocumentTitle('Admin · Settings');
  const [commission, setCommission] = useState(null);
  const [rates, setRates] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [state, setState] = useState({ busy: false, error: null, fields: {} });

  const showCommission = (c) => {
    setCommission(c);
    setRates({ flight: toPct(c.flight.upcoming?.rate ?? c.flight.current), hotel: toPct(c.hotel.upcoming?.rate ?? c.hotel.current) });
  };

  useEffect(() => {
    Promise.all([adminApi.commission(), adminApi.templates()])
      .then(([c, t]) => {
        showCommission(c);
        setTemplates(t.templates);
      })
      .catch(setLoadError);
  }, []);

  if (loadError) return <ErrorState error={loadError} />;
  if (rates === null) return <Spinner />;

  const max = toPct(commission.limits.max);
  const fieldError = (v) => (v === '' || Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > Number(max) ? `Between 0% and ${max}%` : null);

  async function saveRate(e) {
    e.preventDefault();
    const fields = { flight: fieldError(rates.flight), hotel: fieldError(rates.hotel) };
    if (fields.flight || fields.hotel) return setState({ busy: false, error: null, fields });
    setState({ busy: true, error: null, fields: {} });
    try {
      const saved = await adminApi.saveCommission({ flight: Number(rates.flight) / 100, hotel: Number(rates.hotel) / 100 });
      showCommission(saved);
      setNotice(`Commission saved. Changes apply from 1 ${saved.appliesFrom.label}; statements already issued don’t change.`);
      setState({ busy: false, error: null, fields: {} });
    } catch (err) {
      setState({ busy: false, error: err.message, fields: {} });
    }
  }

  return (
    <div className="stack">
      <h1 className="console-h1">Settings</h1>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      <form className="card" onSubmit={saveRate} noValidate>
        <h2 className="h4">Commission</h2>
        <p className="small muted">
          A default rate for all airlines and one for all hotels. A different rate for one supplier is set on the Suppliers page. Changes apply from 1 {commission.appliesFrom.label}; each statement stores the rate it used, so history never changes.
        </p>
        {state.error && <p className="field-error" role="alert">{state.error}</p>}
        <div className="row filter-row">
          <div>
            <Field label="Airlines (%)" type="number" step="0.1" min="0" max={max} value={rates.flight} onChange={(e) => setRates((r) => ({ ...r, flight: e.target.value }))} error={state.fields.flight} />
            <RateNote view={commission.flight} />
          </div>
          <div>
            <Field label="Hotels (%)" type="number" step="0.1" min="0" max={max} value={rates.hotel} onChange={(e) => setRates((r) => ({ ...r, hotel: e.target.value }))} error={state.fields.hotel} />
            <RateNote view={commission.hotel} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy} aria-busy={state.busy || undefined}>
            {state.busy ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      </form>
      <PricingLimits onSaved={() => setNotice('Pricing limits saved. Search prices follow them straight away.')} />
      <section className="card">
        <h2 className="h4">Cancellation templates</h2>
        <p className="small muted">Suppliers pick from these for each fare tier or rate plan. Edits apply to future bookings only — booked trips keep the terms they agreed to.</p>
        <div className="table-wrap">
          <table className="admin-table tier-table">
            <thead>
              <tr>
                <th scope="col">Template</th>
                <th scope="col">Free window</th>
                <th scope="col">Fee after</th>
                <th scope="col">Shown to travellers</th>
                <th scope="col">
                  <span className="sr-only">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <TemplateRow
                  key={t.key}
                  template={t}
                  onSaved={(saved) => {
                    setTemplates((list) => list.map((x) => (x.key === saved.key ? saved : x)));
                    setNotice(`${saved.name} saved: “${saved.terms}”`);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
