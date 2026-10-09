import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { errorLines } from '../../lib/consoleForm.js';
import { formatPrice } from '../../lib/format.js';

const parseSeats = (text) => [...new Set(text.toUpperCase().split(/[\s,]+/).filter(Boolean))];

function MenuEditor({ cabin, menu, defaults, onChange }) {
  const own = menu !== null;
  const rows = own ? menu : defaults;
  const set = (i, patch) => onChange(rows.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <section className="card rule-card">
      <div className="spread">
        <h2 className="h4">{cabin === 'business' ? 'Business' : 'Economy'} meals</h2>
        <label className="switch">
          <input type="checkbox" role="switch" checked={own} onChange={(e) => onChange(e.target.checked ? defaults.map((m) => ({ ...m })) : null)} />
          <span>{own ? 'Your own menu' : 'Atlas default'}</span>
        </label>
      </div>
      {!own ? (
        <ul className="small">
          {defaults.map((m) => (
            <li key={m.name}>
              {m.name} ({m.isVeg ? 'veg' : 'non-veg'}) — {m.price ? formatPrice(m.price) : 'included'}
            </li>
          ))}
        </ul>
      ) : (
        <div className="band-list">
          {rows.map((m, i) => (
            <div key={i} className="band-row band-row--meal">
              <Field label="Meal" value={m.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} />
              <Field label="Price (₹)" type="number" min="0" value={m.price} onChange={(e) => set(i, { price: e.target.value === '' ? '' : Number(e.target.value) })} />
              <label className="checkbox small">
                <input type="checkbox" checked={m.isVeg} onChange={(e) => set(i, { isVeg: e.target.checked })} /> Veg
              </label>
              <button type="button" className="icon-btn remove-row" aria-label={`Remove ${m.name || 'meal'}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn-text small" disabled={rows.length >= 12} onClick={() => onChange([...rows, { name: '', price: 0, isVeg: true }])}>
            Add meal
          </button>
        </div>
      )}
    </section>
  );
}

// Airline policies (prd.md → Supplier console → Policies): meals per cabin and blocked seats.
// Baggage, fare tiers and cancellation templates are on the Pricing page with the rate card.
export default function Policies() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Policies`);
  const [data, setData] = useState(null);
  const [meals, setMeals] = useState(null);
  const [blocked, setBlocked] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [save, setSave] = useState({ busy: false, errors: null, saved: null });

  useEffect(() => {
    supplierApi
      .policies()
      .then((res) => {
        setData(res);
        setMeals(res.policies.mealsByCabin);
        setBlocked(Object.fromEntries(res.aircraft.map((a) => [a.key, (res.policies.blockedSeats[a.key] || []).join(', ')])));
      })
      .catch(setLoadError);
  }, []);

  if (loadError) return <ErrorState error={loadError} />;
  if (!data) return <Spinner />;
  const hasBusiness = data.aircraft.some((a) => a.cabins.business);

  async function submit() {
    setSave({ busy: true, errors: null, saved: null });
    try {
      const blockedSeats = Object.fromEntries(Object.entries(blocked).map(([k, v]) => [k, parseSeats(v)]).filter(([, v]) => v.length));
      const res = await supplierApi.savePolicies({ mealsByCabin: meals, blockedSeats });
      setSave({ busy: false, errors: null, saved: res.departuresRebuilt ? `Saved. ${res.departuresRebuilt} un-booked future departures were rebuilt with the new blocked seats.` : 'Saved.' });
    } catch (err) {
      setSave({ busy: false, errors: errorLines(err), saved: null });
    }
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="narrow-console stack">
      <h1 className="console-h1">Policies</h1>
      <p className="muted">Meals per cabin and seats you keep off sale. Changes apply to future bookings only.</p>
      {save.saved && (
        <Banner tone="success">
          <p>{save.saved}</p>
        </Banner>
      )}
      {save.errors && (
        <Banner tone="error">
          <ul>
            {save.errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Banner>
      )}
      <MenuEditor cabin="economy" menu={meals.economy} defaults={data.defaults.economy} onChange={(m) => setMeals({ ...meals, economy: m })} />
      {hasBusiness && <MenuEditor cabin="business" menu={meals.business} defaults={data.defaults.business} onChange={(m) => setMeals({ ...meals, business: m })} />}
      <section className="card">
        <h2 className="h4">Blocked seats</h2>
        <p className="small muted">
          Seats you never sell (crew rest, a broken recline). The layout itself belongs to the aircraft and is the same for every airline. Up to 20 per aircraft. Departures that already have
          bookings keep their seats.
        </p>
        {data.aircraft.map((a) => (
          <Field
            key={a.key}
            label={a.label}
            value={blocked[a.key] || ''}
            onChange={(e) => setBlocked({ ...blocked, [a.key]: e.target.value })}
            hint={`Rows ${Object.values(a.cabins)
              .map((c) => `${c.rows[0]}–${c.rows[c.rows.length - 1]}`)
              .join(', ')} · e.g. 12C, 12D`}
          />
        ))}
      </section>
      <div>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={save.busy} aria-busy={save.busy || undefined}>
          {save.busy ? 'Saving…' : 'Save policies'}
        </button>
      </div>
    </div>
  );
}
