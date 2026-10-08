import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { humanizePath } from '../../lib/consoleForm.js';
import { addDays, todayIst } from '../../lib/dates.js';
import { formatDateString, formatPrice } from '../../lib/format.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = (v) => (v === '' ? '' : Number(v));
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};

// Server validation messages, keyed by path ("demand.bands.1.from").
function useErrors(details) {
  const map = Object.fromEntries((details || []).map((d) => [d.path, d.message]));
  return (path) => map[path];
}

function RuleCard({ title, hint, rule, onToggle, children }) {
  const switchable = rule && 'enabled' in rule;
  return (
    <section className={`card rule-card ${switchable && !rule.enabled ? 'is-off' : ''}`}>
      <div className="spread">
        <h2 className="h4">{title}</h2>
        {switchable && (
          <label className="switch">
            <input type="checkbox" role="switch" checked={rule.enabled} onChange={(e) => onToggle(e.target.checked)} />
            <span>{rule.enabled ? 'On' : 'Off'}</span>
          </label>
        )}
      </div>
      {hint && <p className="small muted">{hint}</p>}
      {switchable && !rule.enabled && <p className="small muted">Off — counts as ×1.0. Its entries are kept for when you switch it back on.</p>}
      <fieldset disabled={switchable && !rule.enabled} className="rule-body">
        {children}
      </fieldset>
    </section>
  );
}

// Banded rule: rows of from–to with a multiplier; add/remove rows; the server checks there are no gaps.
function Bands({ rule, onChange, path, err, kind, max }) {
  const fmt = kind === 'time' ? toTime : (v) => v;
  const parse = kind === 'time' ? fromTime : num;
  const set = (i, key, value) => onChange({ ...rule, bands: rule.bands.map((b, j) => (j === i ? { ...b, [key]: value } : b)) });
  const unit = kind === 'time' ? '' : kind === 'days' ? ' days' : '%';
  return (
    <div className="band-list">
      {rule.bands.map((b, i) => (
        <div key={i} className="band-row">
          <Field label="From" type={kind === 'time' ? 'time' : 'number'} value={fmt(b.from)} onChange={(e) => set(i, 'from', parse(e.target.value))} error={err(`${path}.bands.${i}.from`)} hint={unit.trim() || undefined} />
          <Field label="To" type={kind === 'time' ? 'time' : 'number'} value={fmt(b.to)} onChange={(e) => set(i, 'to', parse(e.target.value))} error={err(`${path}.bands.${i}.to`)} />
          <Field label="×" type="number" step="0.01" min="0.5" max="3" value={b.x} onChange={(e) => set(i, 'x', num(e.target.value))} error={err(`${path}.bands.${i}.x`)} />
          <button type="button" className="icon-btn remove-row" aria-label={`Remove band ${i + 1}`} disabled={rule.bands.length <= 1} onClick={() => onChange({ ...rule, bands: rule.bands.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-text small"
        disabled={rule.bands.length >= 10}
        onClick={() => {
          const last = rule.bands[rule.bands.length - 1];
          const mid = Math.floor((last.from + max) / 2);
          onChange({ ...rule, bands: [...rule.bands.slice(0, -1), { ...last, to: mid }, { from: mid + 1, to: max, x: 1 }] });
        }}
      >
        Add band
      </button>
      {err(`${path}.bands`) && <p className="field-error small">{err(`${path}.bands`)}</p>}
    </div>
  );
}

function Seasons({ rule, onChange, path, err }) {
  const set = (i, key, value) => onChange({ ...rule, list: rule.list.map((s, j) => (j === i ? { ...s, [key]: value } : s)) });
  return (
    <div className="band-list">
      {rule.list.length === 0 && <p className="small muted">No seasons yet.</p>}
      {rule.list.map((s, i) => (
        <div key={i} className="band-row band-row--season">
          <Field label="Name" value={s.name} maxLength={40} onChange={(e) => set(i, 'name', e.target.value)} error={err(`${path}.list.${i}.name`)} />
          <Field label="From" type="date" value={s.from} onChange={(e) => set(i, 'from', e.target.value)} error={err(`${path}.list.${i}.from`)} />
          <Field label="To" type="date" value={s.to} onChange={(e) => set(i, 'to', e.target.value)} error={err(`${path}.list.${i}.to`)} />
          <Field label="×" type="number" step="0.01" value={s.x} onChange={(e) => set(i, 'x', num(e.target.value))} error={err(`${path}.list.${i}.x`)} />
          <button type="button" className="icon-btn remove-row" aria-label={`Remove ${s.name || `season ${i + 1}`}`} onClick={() => onChange({ ...rule, list: rule.list.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-text small"
        disabled={rule.list.length >= 30}
        onClick={() => onChange({ ...rule, list: [...rule.list, { name: 'New season', from: addDays(todayIst(), 30), to: addDays(todayIst(), 33), x: 1.2 }] })}
      >
        Add season
      </button>
    </div>
  );
}

function Variable({ label, value, onChange, path, err }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  return (
    <div className="form-grid cols-4">
      <Field as="select" label={`${label} — kind`} value={value.mode} onChange={(e) => set('mode', e.target.value)}>
        <option value="growing">Grows</option>
        <option value="manual">Manual</option>
      </Field>
      <Field label={`${label} (₹)`} type="number" step="0.01" value={value.value} onChange={(e) => set('value', num(e.target.value))} error={err(`${path}.value`)} />
      <Field label="From date" type="date" value={value.since} disabled={value.mode !== 'growing'} onChange={(e) => set('since', e.target.value)} />
      <Field label="Growth % / year" type="number" step="0.1" value={value.growthPctPerYear} disabled={value.mode !== 'growing'} onChange={(e) => set('growthPctPerYear', num(e.target.value))} error={err(`${path}.growthPctPerYear`)} />
    </div>
  );
}

export default function Pricing() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Pricing`);
  const isAirline = supplier.kind === 'airline';
  const [card, setCard] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [save, setSave] = useState({ busy: false, error: null, details: null, saved: false });
  const [sample, setSample] = useState(null);
  const [preview, setPreview] = useState({ busy: false, result: null, error: null });
  const err = useErrors(save.details);

  useEffect(() => {
    supplierApi
      .rateCard()
      .then((res) => {
        setCard(res.rateCard);
        setMeta(res);
        const date = addDays(todayIst(), 14);
        setSample(
          res.rateCard.kind === 'airline'
            ? { origin: 'DEL', destination: 'BOM', date, time: '09:00', tier: 'Saver', loadPct: 30 }
            : { roomTypeName: Object.keys(res.rateCard.baseRates)[0], checkIn: date, nights: 2, ratePlan: 'flexible' },
        );
      })
      .catch(setLoadError);
  }, []);

  if (loadError) return <ErrorState error={loadError} />;
  if (!card || !sample) return <Spinner />;

  const set = (key, value) => setCard((c) => ({ ...c, [key]: value }));
  const toggle = (key) => (on) => setCard((c) => ({ ...c, [key]: { ...c[key], enabled: on } }));

  async function saveCard() {
    setSave({ busy: true, error: null, details: null, saved: false });
    try {
      const { rateCard } = await supplierApi.saveRateCard(card);
      setCard(rateCard);
      setSave({ busy: false, error: null, details: null, saved: true });
    } catch (e) {
      setSave({ busy: false, error: e.details?.length ? e.details.map((d) => `${humanizePath(d.path)}: ${d.message}`) : [e.message], details: e.details, saved: false });
    }
    window.scrollTo({ top: 0 });
  }

  async function runPreview() {
    setPreview({ busy: true, result: null, error: null });
    try {
      const body = isAirline ? { ...sample, loadPct: Number(sample.loadPct) } : { ...sample, nights: Number(sample.nights) };
      setPreview({ busy: false, result: await supplierApi.previewRateCard(card, body), error: null });
    } catch (e) {
      setPreview({ busy: false, result: null, error: e.message });
    }
  }

  return (
    <div className="pricing-page">
      <div className="pricing-main">
        <h1 className="console-h1">Pricing</h1>
        <p className="muted">
          Your rate card. Atlas’s pricing engine turns these rules into every price travellers see — prices are never typed in one by one. Changes apply to new bookings straight away;
          existing bookings keep what they paid. Version {card.version || 1}.
        </p>
        {meta.limits && (
          <p className="small muted">
            Atlas limits: each multiplier at most ×{meta.limits.maxMultiplier}; fares {formatPrice(meta.limits.flightFare.min)}–{formatPrice(meta.limits.flightFare.max)} per traveller; hotel nights{' '}
            {formatPrice(meta.limits.hotelNight.min)}–{formatPrice(meta.limits.hotelNight.max)} a room. Prices outside them are held at the limit.
          </p>
        )}
        {save.saved && (
          <Banner tone="success">
            <p>Saved. Search prices now follow your new rate card.</p>
          </Banner>
        )}
        {save.error && (
          <Banner tone="error">
            <p>Please fix the following:</p>
            <ul>
              {save.error.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Banner>
        )}

        {isAirline ? (
          <>
            <RuleCard title="Base rate (economy)" hint="A fixed part plus a part per kilometre. Business is economy × the business multiplier.">
              <Variable label="Fixed" value={card.base.fixed} path="base.fixed" err={err} onChange={(v) => set('base', { ...card.base, fixed: v })} />
              <Variable label="Per km" value={card.base.perKm} path="base.perKm" err={err} onChange={(v) => set('base', { ...card.base, perKm: v })} />
              <div className="form-grid cols-4">
                <Field label="Airline factor ×" type="number" step="0.01" value={card.base.airlineFactor} onChange={(e) => set('base', { ...card.base, airlineFactor: num(e.target.value) })} error={err('base.airlineFactor')} />
                <Field label="Business multiplier ×" type="number" step="0.1" value={card.base.businessMultiplier} onChange={(e) => set('base', { ...card.base, businessMultiplier: num(e.target.value) })} error={err('base.businessMultiplier')} />
              </div>
            </RuleCard>
            <RuleCard title="Fare tiers" hint="The tiers are fixed. Each picks one of Atlas’s cancellation templates.">
              <div className="table-wrap">
                <table className="admin-table tier-table">
                  <thead>
                    <tr>
                      <th scope="col">Tier</th>
                      <th scope="col">×</th>
                      <th scope="col">Cabin bag (kg)</th>
                      <th scope="col">Check-in (kg)</th>
                      <th scope="col">Cancellation template</th>
                      <th scope="col">Date change (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.tiers.map((t, i) => {
                      const setTier = (key, v) => set('tiers', card.tiers.map((x, j) => (j === i ? { ...x, [key]: v } : x)));
                      return (
                        <tr key={t.name}>
                          <th scope="row">
                            {t.name} <span className="small muted">({t.cabin})</span>
                          </th>
                          <td>
                            <input className="input input-sm" aria-label={`${t.name} multiplier`} type="number" step="0.01" value={t.x} onChange={(e) => setTier('x', num(e.target.value))} />
                          </td>
                          <td>
                            <input className="input input-sm" aria-label={`${t.name} cabin baggage`} type="number" value={t.cabinBaggageKg} onChange={(e) => setTier('cabinBaggageKg', num(e.target.value))} />
                          </td>
                          <td>
                            <input className="input input-sm" aria-label={`${t.name} check-in baggage`} type="number" value={t.checkinBaggageKg} onChange={(e) => setTier('checkinBaggageKg', num(e.target.value))} />
                          </td>
                          <td>
                            <select className="select" aria-label={`${t.name} cancellation template`} value={t.templateKey} onChange={(e) => setTier('templateKey', e.target.value)}>
                              {meta.templates.map((tpl) => (
                                <option key={tpl.key} value={tpl.key}>
                                  {tpl.name} — {tpl.terms}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="input input-sm" aria-label={`${t.name} date change fee`} type="number" value={t.dateChangeFee} onChange={(e) => setTier('dateChangeFee', num(e.target.value))} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </RuleCard>
            <RuleCard title="Seat fees (economy)" hint="Business seats are always included in the fare.">
              <div className="form-grid cols-4">
                {['window', 'aisle', 'middle', 'extraLegroom'].map((k) => (
                  <Field key={k} label={`${k === 'extraLegroom' ? 'Extra legroom' : k[0].toUpperCase() + k.slice(1)} (₹)`} type="number" value={card.seatFees[k]} onChange={(e) => set('seatFees', { ...card.seatFees, [k]: num(e.target.value) })} error={err(`seatFees.${k}`)} />
                ))}
              </div>
            </RuleCard>
            <RuleCard title="Time of day" hint="By departure time (IST)." rule={card.timeOfDay} onToggle={toggle('timeOfDay')}>
              <Bands rule={card.timeOfDay} onChange={(r) => set('timeOfDay', r)} path="timeOfDay" err={err} kind="time" max={1439} />
            </RuleCard>
            <RuleCard title="Day of week" hint="Replaced by the season factor on season dates." rule={card.dayOfWeek} onToggle={toggle('dayOfWeek')}>
              <DayFactors rule={card.dayOfWeek} onChange={(r) => set('dayOfWeek', r)} />
            </RuleCard>
            <RuleCard title="Days to departure" hint="Days between booking and departure, 0–60." rule={card.daysToDeparture} onToggle={toggle('daysToDeparture')}>
              <Bands rule={card.daysToDeparture} onChange={(r) => set('daysToDeparture', r)} path="daysToDeparture" err={err} kind="days" max={60} />
            </RuleCard>
            <RuleCard title="Demand" hint="Percent of the cabin’s seats already sold." rule={card.demand} onToggle={toggle('demand')}>
              <Bands rule={card.demand} onChange={(r) => set('demand', r)} path="demand" err={err} kind="pct" max={100} />
            </RuleCard>
            <RuleCard title="Seasons and events" hint="Date ranges that can’t overlap. A season replaces the day-of-week factor." rule={card.seasons} onToggle={toggle('seasons')}>
              <Seasons rule={card.seasons} onChange={(r) => set('seasons', r)} path="seasons" err={err} />
            </RuleCard>
            <RuleCard title="Route overrides" hint="A multiplier, or a fixed economy base, for one direction of a route." rule={card.routeOverrides} onToggle={toggle('routeOverrides')}>
              <RouteOverrides rule={card.routeOverrides} airports={meta.airports} onChange={(r) => set('routeOverrides', r)} err={err} />
            </RuleCard>
          </>
        ) : (
          <>
            <RuleCard title="Base rates" hint="Per room, per night, before taxes. Room types are managed under Property & rooms.">
              <div className="form-grid cols-3">
                {Object.entries(card.baseRates).map(([room, rate]) => (
                  <Field key={room} label={`${room} (₹)`} type="number" value={rate} onChange={(e) => set('baseRates', { ...card.baseRates, [room]: num(e.target.value) })} error={err(`baseRates.${room}`)} />
                ))}
              </div>
            </RuleCard>
            <RuleCard title="Rate plans" hint="Flexible picks a cancellation template; Non-refundable always refunds nothing.">
              <div className="form-grid cols-3">
                <Field label="Flexible ×" type="number" step="0.01" value={card.ratePlans[0].x} onChange={(e) => set('ratePlans', [{ ...card.ratePlans[0], x: num(e.target.value) }, card.ratePlans[1]])} />
                <Field as="select" label="Flexible cancellation" value={card.ratePlans[0].templateKey} onChange={(e) => set('ratePlans', [{ ...card.ratePlans[0], templateKey: e.target.value }, card.ratePlans[1]])}>
                  {meta.templates
                    .filter((t) => t.key !== 'H-NONREF')
                    .map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                </Field>
                <Field label="Non-refundable ×" type="number" step="0.01" value={card.ratePlans[1].x} onChange={(e) => set('ratePlans', [card.ratePlans[0], { ...card.ratePlans[1], x: num(e.target.value) }])} />
              </div>
              <Field label="Breakfast add-on (₹ per guest per night)" type="number" value={card.breakfastPerGuest} onChange={(e) => set('breakfastPerGuest', num(e.target.value))} error={err('breakfastPerGuest')} />
            </RuleCard>
            <RuleCard title="Day of week" hint="By the night’s date. Replaced by the season factor on season dates." rule={card.dayOfWeek} onToggle={toggle('dayOfWeek')}>
              <DayFactors rule={card.dayOfWeek} onChange={(r) => set('dayOfWeek', r)} />
            </RuleCard>
            <RuleCard title="Seasons and events" hint="Peak, festival and off-season ranges; they can’t overlap." rule={card.seasons} onToggle={toggle('seasons')}>
              <Seasons rule={card.seasons} onChange={(r) => set('seasons', r)} path="seasons" err={err} />
            </RuleCard>
            <RuleCard title="Lead time" hint="Days from booking to check-in, 0–60." rule={card.leadTime} onToggle={toggle('leadTime')}>
              <Bands rule={card.leadTime} onChange={(r) => set('leadTime', r)} path="leadTime" err={err} kind="days" max={60} />
            </RuleCard>
          </>
        )}

        <RuleCard title="Guard rails" hint="No price goes below the floor or above the ceiling, as multiples of the base.">
          <div className="form-grid cols-4">
            <Field label="Floor ×" type="number" step="0.05" value={card.guardRails.floor} onChange={(e) => set('guardRails', { ...card.guardRails, floor: num(e.target.value) })} error={err('guardRails.floor')} />
            <Field label="Ceiling ×" type="number" step="0.05" value={card.guardRails.ceiling} onChange={(e) => set('guardRails', { ...card.guardRails, ceiling: num(e.target.value) })} error={err('guardRails.ceiling')} />
          </div>
        </RuleCard>

        <div className="row">
          <button type="button" className="btn btn-primary" onClick={saveCard} disabled={save.busy}>
            {save.busy ? 'Saving…' : 'Save rate card'}
          </button>
        </div>
      </div>

      <aside className="pricing-preview card" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="h4">
          Price preview
        </h2>
        <p className="small muted">Try your unsaved changes on a sample.</p>
        {isAirline ? (
          <div className="stack-tight">
            <div className="form-grid cols-2">
              <Field as="select" label="From" value={sample.origin} onChange={(e) => setSample({ ...sample, origin: e.target.value })}>
                {meta.airports.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code}
                  </option>
                ))}
              </Field>
              <Field as="select" label="To" value={sample.destination} onChange={(e) => setSample({ ...sample, destination: e.target.value })}>
                {meta.airports.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code}
                  </option>
                ))}
              </Field>
            </div>
            <Field label="Date" type="date" value={sample.date} onChange={(e) => setSample({ ...sample, date: e.target.value })} />
            <Field label="Time" type="time" value={sample.time} onChange={(e) => setSample({ ...sample, time: e.target.value })} />
            <Field as="select" label="Tier" value={sample.tier} onChange={(e) => setSample({ ...sample, tier: e.target.value })}>
              {card.tiers.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </Field>
            <Field label="Seats sold (%)" type="number" min="0" max="100" value={sample.loadPct} onChange={(e) => setSample({ ...sample, loadPct: e.target.value })} />
          </div>
        ) : (
          <div className="stack-tight">
            <Field as="select" label="Room" value={sample.roomTypeName} onChange={(e) => setSample({ ...sample, roomTypeName: e.target.value })}>
              {Object.keys(card.baseRates).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Field>
            <Field label="Check-in" type="date" value={sample.checkIn} onChange={(e) => setSample({ ...sample, checkIn: e.target.value })} />
            <Field label="Nights" type="number" min="1" max="30" value={sample.nights} onChange={(e) => setSample({ ...sample, nights: e.target.value })} />
            <Field as="select" label="Rate plan" value={sample.ratePlan} onChange={(e) => setSample({ ...sample, ratePlan: e.target.value })}>
              <option value="flexible">Flexible</option>
              <option value="nonrefundable">Non-refundable</option>
            </Field>
          </div>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={runPreview} disabled={preview.busy}>
          {preview.busy ? 'Pricing…' : 'Preview price'}
        </button>
        {preview.error && <p className="field-error small">{preview.error}</p>}
        {preview.result && isAirline && (
          <div className="preview-result" aria-live="polite">
            <p className="price">{formatPrice(preview.result.price)}</p>
            <p className="small muted">
              per traveller · base {formatPrice(preview.result.cabinBase)} · {preview.result.km} km
              {preview.result.limited && ` · held at Atlas’s ${preview.result.limited === 'max' ? 'highest' : 'lowest'} fare`}
            </p>
            <ul className="small">
              {preview.result.factors.map((f) => (
                <li key={f.rule}>
                  {f.rule}: ×{f.x}
                  {f.capped && ' (Atlas’s limit)'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {preview.result && !isAirline && (
          <div className="preview-result" aria-live="polite">
            <p className="price">{formatPrice(preview.result.avgNightly)}</p>
            <p className="small muted">avg per night · {formatPrice(preview.result.perRoom)} per room for the stay</p>
            <ul className="small">
              {preview.result.nights.map((n) => (
                <li key={n.date}>
                  {formatDateString(n.date, { weekday: 'short', year: undefined })}: {formatPrice(n.price)}
                  {n.limited && ` (held at Atlas’s ${n.limited === 'max' ? 'highest' : 'lowest'} price)`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function DayFactors({ rule, onChange }) {
  return (
    <div className="day-factors">
      {DAYS.map((d, i) => (
        <Field key={d} label={d} type="number" step="0.01" value={rule.x[i]} onChange={(e) => onChange({ ...rule, x: rule.x.map((v, j) => (j === i ? num(e.target.value) : v)) })} />
      ))}
    </div>
  );
}

function RouteOverrides({ rule, airports, onChange, err }) {
  const set = (i, patch) => onChange({ ...rule, list: rule.list.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <div className="band-list">
      {rule.list.length === 0 && <p className="small muted">No overrides — every route uses the base rate.</p>}
      {rule.list.map((o, i) => (
        <div key={i} className="band-row band-row--route">
          <Field as="select" label="From" value={o.origin} onChange={(e) => set(i, { origin: e.target.value })}>
            {airports.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code}
              </option>
            ))}
          </Field>
          <Field as="select" label="To" value={o.destination} onChange={(e) => set(i, { destination: e.target.value })} error={err(`routeOverrides.list.${i}.destination`)}>
            {airports.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code}
              </option>
            ))}
          </Field>
          <Field label="× (optional)" type="number" step="0.01" value={o.multiplier ?? ''} onChange={(e) => set(i, { multiplier: e.target.value === '' ? undefined : Number(e.target.value) })} error={err(`routeOverrides.list.${i}.multiplier`)} />
          <Field label="Fixed base ₹ (optional)" type="number" value={o.fixedBase ?? ''} onChange={(e) => set(i, { fixedBase: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <button type="button" className="icon-btn remove-row" aria-label={`Remove override ${o.origin}–${o.destination}`} onClick={() => onChange({ ...rule, list: rule.list.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn-text small" disabled={rule.list.length >= 50} onClick={() => onChange({ ...rule, list: [...rule.list, { origin: 'DEL', destination: 'BOM', multiplier: 1.1 }] })}>
        Add route override
      </button>
      {err('routeOverrides.list') && <p className="field-error small">{err('routeOverrides.list')}</p>}
    </div>
  );
}
