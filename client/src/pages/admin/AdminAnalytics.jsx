import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CountUp from '../../components/CountUp.jsx';
import { BarList, ColumnChart, Funnel, LineChart } from '../../components/Charts.jsx';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatPrice } from '../../lib/format.js';

// The admin analytics dashboard (prd.md → Workflow 12; design.md → Admin analytics dashboard).
const TABS = [
  ['overview', 'Overview'],
  ['supply', 'Supply'],
  ['demand', 'Demand & offers'],
];
const RANGES = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['180', 'Last 180 days'],
  ['custom', 'Custom dates'],
];
const SERIES_COLORS = { flights: 'var(--color-primary)', hotels: 'var(--color-secondary)', previous: 'var(--color-muted)' };
const LEAD_COLORS = ['var(--color-secondary)', 'var(--color-primary)', '#c98f5f', 'var(--color-error)'];

const pct = (n, digits = 1) => `${(Math.round(n * 100 * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
function compactInr(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}
const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function change(current, previous, { points = false } = {}) {
  if (points) {
    const diff = (current - previous) * 100;
    return { text: `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)} pts`, up: diff >= 0 };
  }
  if (!previous) return { text: current ? 'new' : 'no change', up: true, neutral: !current };
  const diff = (current - previous) / previous;
  return { text: `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff * 100).toFixed(1)}%`, up: diff >= 0 };
}

// A headline number: counts up with the others when the page (or a new range) loads.
function Kpi({ label, format, decimals = 0, current, previous, days, points }) {
  const c = change(current, previous, { points });
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">
        <CountUp value={current} format={format} decimals={decimals} />
      </p>
      <p className={`kpi-change ${c.neutral ? '' : c.up ? 'is-up' : 'is-down'}`}>
        {c.text} <span className="muted">vs previous {days} days</span>
      </p>
    </div>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <p className="kpi-label">{label}</p>
      <p className="stat-value">{value}</p>
      {note && <p className="small muted">{note}</p>}
    </div>
  );
}

function Filters({ params, set, suppliers }) {
  const range = params.get('range') || '30';
  return (
    <div className="analytics-filters">
      <Field label="Date range" as="select" value={range} onChange={(e) => set({ range: e.target.value })}>
        {RANGES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Field>
      {range === 'custom' && (
        <>
          <Field label="From" type="date" value={params.get('from') || ''} onChange={(e) => set({ from: e.target.value })} />
          <Field label="To" type="date" value={params.get('to') || ''} onChange={(e) => set({ to: e.target.value })} hint="Up to 180 days" />
        </>
      )}
      <fieldset className="field">
        <legend>Product</legend>
        {[
          ['all', 'All'],
          ['flight', 'Flights'],
          ['hotel', 'Hotels'],
        ].map(([v, l]) => (
          <label key={v} className="radio-row">
            <input type="radio" name="product" value={v} checked={(params.get('product') || 'all') === v} onChange={() => set({ product: v })} /> {l}
          </label>
        ))}
      </fieldset>
      <Field label="Supplier" as="select" value={params.get('supplierId') || ''} onChange={(e) => set({ supplierId: e.target.value })}>
        <option value="">All suppliers</option>
        {suppliers?.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </Field>
      <button type="button" className="btn-text" onClick={() => set(null)}>
        Reset
      </button>
    </div>
  );
}

export default function AdminAnalytics() {
  useDocumentTitle('Admin · Analytics');
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('overview');
  const [metric, setMetric] = useState('bookings');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = Object.fromEntries([...params].filter(([k, v]) => v && k !== 'tab'));
  const { data, error, reload } = useAsync((signal) => adminApi.analytics(query, { signal }), [JSON.stringify(query)]);
  const suppliers = useAsync((signal) => adminApi.suppliers({ signal }), []);

  const set = (patch) => {
    if (!patch) return setParams({});
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && !(k === 'product' && v === 'all')) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  const filters = <Filters params={params} set={set} suppliers={suppliers.data?.suppliers} />;
  const k = data?.kpis;
  const days = data?.range.days;

  return (
    <div className="analytics">
      <div className="analytics-head">
        <div>
          <h1 className="console-h1">Analytics</h1>
          {data && (
            <p className="muted small">
              {shortDate(data.range.from)} – {shortDate(data.range.to)} · compared with {shortDate(data.range.previous.from)} – {shortDate(data.range.previous.to)}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-secondary btn-sm analytics-filter-button" onClick={() => setFiltersOpen(true)}>
          Filters
        </button>
      </div>
      <div className="row chip-row" role="tablist" aria-label="Dashboard sections">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="chip-check" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="analytics-layout">
        <div className="analytics-main">
          {error && <ErrorState error={error} onRetry={reload} />}
          {!error && !data && <SkeletonList count={4} height={120} />}
          {data && (
            <>
              <div className="kpi-strip kpi-strip-5">
                <Kpi label="Bookings" format={(n) => n.toLocaleString('en-IN')} current={k.current.bookings} previous={k.previous.bookings} days={days} />
                <Kpi label="Gross booking value" format={compactInr} current={k.current.gbv} previous={k.previous.gbv} days={days} />
                <Kpi label="Net revenue" format={compactInr} current={k.current.netRevenue} previous={k.previous.netRevenue} days={days} />
                <Kpi label="Take rate" format={pct} decimals={4} current={k.current.takeRate} previous={k.previous.takeRate} days={days} points />
                <Kpi label="Avg booking value" format={formatPrice} current={k.current.avgBookingValue} previous={k.previous.avgBookingValue} days={days} />
              </div>

              {tab === 'overview' && (
                <div className="analytics-grid">
                  <section className="card chart-card chart-wide">
                    <LineChart
                      actions={
                        <div className="row chip-row" role="group" aria-label="Measure">
                          {[
                            ['bookings', 'Bookings'],
                            ['gbv', 'Gross value'],
                          ].map(([m, l]) => (
                            <button key={m} type="button" className="chip-check" aria-pressed={metric === m} onClick={() => setMetric(m)}>
                              {l}
                            </button>
                          ))}
                        </div>
                      }
                      title={`${metric === 'bookings' ? 'Bookings' : 'Gross booking value'} by ${data.range.bucketDays === 1 ? 'day' : 'week'}, flights vs hotels`}
                      points={data.series.map((s) =>
                        metric === 'bookings'
                          ? { label: s.label, flights: s.flights, hotels: s.hotels, previous: s.previous }
                          : { label: s.label, flights: s.flightGbv, hotels: s.hotelGbv, previous: s.previousGbv },
                      )}
                      labelOf={(p) => shortDate(p.label)}
                      format={metric === 'bookings' ? (n) => String(Math.round(n)) : compactInr}
                      lines={[
                        { key: 'flights', label: 'Flights', color: SERIES_COLORS.flights },
                        { key: 'hotels', label: 'Hotels', color: SERIES_COLORS.hotels },
                        { key: 'previous', label: 'Previous period (all)', color: SERIES_COLORS.previous, dashed: true },
                      ]}
                    />
                  </section>
                  <section className="card chart-card">
                    <h2 className="chart-title">Cancellations</h2>
                    <div className="stat-grid">
                      <Stat label="Cancellation rate" value={pct(data.cancellations.rate)} note="of bookings made in the period" />
                      <Stat label="Refunds issued" value={compactInr(data.cancellations.refunds)} />
                      <Stat label="By travellers" value={pct(data.cancellations.traveller)} />
                      <Stat label="By suppliers" value={pct(data.cancellations.supplier)} />
                    </div>
                  </section>
                  <section className="card chart-card">
                    <h2 className="chart-title">Payments</h2>
                    <div className="stat-grid">
                      <Stat label="Success rate" value={pct(data.payments.successRate)} />
                      <Stat label="Failed attempts" value={data.payments.failed.toLocaleString('en-IN')} note={`of ${(data.payments.success + data.payments.failed).toLocaleString('en-IN')} attempts`} />
                    </div>
                    <p className="small muted">{data.notes.payments}</p>
                  </section>
                </div>
              )}

              {tab === 'supply' && (
                <div className="analytics-grid">
                  <section className="card chart-card">
                    <BarList title="Top routes by gross value" rows={data.supply.topRoutes.map((r) => ({ label: r.label, value: r.gbv, note: `${r.bookings} bookings` }))} format={compactInr} />
                  </section>
                  <section className="card chart-card">
                    <BarList title="Top destination cities" rows={data.supply.topCities.map((r) => ({ label: r.label, value: r.gbv, note: `${r.bookings} bookings` }))} format={compactInr} color="var(--color-secondary)" />
                  </section>
                  <section className="card chart-card chart-wide">
                    <BarList title="Top suppliers by gross value" rows={data.supply.topSuppliers.map((r) => ({ label: r.label, value: r.gbv, note: `${r.bookings} bookings` }))} format={compactInr} />
                  </section>
                  <section className="card chart-card chart-wide">
                    <h2 className="chart-title">Capacity</h2>
                    <div className="stat-grid stat-grid-3">
                      <Stat label="Seat load factor" value={data.supply.seatLoadFactor === null ? '—' : pct(data.supply.seatLoadFactor)} note={data.notes.loadFactor} />
                      <Stat label="Hotel occupancy (proxy)" value={data.supply.occupancy === null ? '—' : pct(data.supply.occupancy)} note={`${data.supply.roomNights.toLocaleString('en-IN')} room-nights booked ÷ rooms × days`} />
                      <Stat label="Average daily rate" value={data.supply.adr === null ? '—' : formatPrice(data.supply.adr)} note="room charges ÷ room-nights" />
                    </div>
                  </section>
                </div>
              )}

              {tab === 'demand' && (
                <div className="analytics-grid">
                  <section className="card chart-card">
                    <ColumnChart title="Bookings by lead time" rows={data.leadTime.map((b) => ({ label: b.label, value: b.bookings }))} colors={LEAD_COLORS} />
                  </section>
                  <section className="card chart-card">
                    <ColumnChart title="Cancellation rate by lead time" rows={data.leadTime.map((b) => ({ label: b.label, value: b.cancellationRate }))} format={(v) => pct(v, 0)} colors={LEAD_COLORS} />
                  </section>
                  <section className="card chart-card chart-wide">
                    <Funnel
                      title="Conversion funnel"
                      steps={[
                        { label: 'Searches', value: data.funnel.searches },
                        { label: 'Viewed details', value: data.funnel.views },
                        { label: 'Started checkout', value: data.funnel.checkoutStarts },
                        { label: 'Payment attempts', value: data.funnel.payAttempts },
                        { label: 'Confirmed', value: data.funnel.confirmed },
                      ]}
                    />
                    <p className="small muted">
                      Searches with no results: {data.funnel.zeroResults.toLocaleString('en-IN')} ({pct(data.funnel.searches ? data.funnel.zeroResults / data.funnel.searches : 0)}). {data.notes.payments}
                    </p>
                  </section>
                  {/* Full row: the bar chart below it is full width, so this card would otherwise sit alone. */}
                  <section className="card chart-card chart-wide">
                    <h2 className="chart-title">Offers</h2>
                    <div className="stat-grid">
                      <Stat label="Redemptions" value={data.offers.redemptions.toLocaleString('en-IN')} />
                      <Stat label="Bookings with an offer" value={pct(data.offers.share)} />
                      <Stat label="Atlas-funded discount" value={compactInr(data.offers.discountPlatform)} />
                      <Stat label="Supplier-funded discount" value={compactInr(data.offers.discountSupplier)} />
                    </div>
                  </section>
                  <section className="card chart-card">
                    <BarList title="Most-used offers (discount given)" rows={data.offers.top.map((r) => ({ label: r.label, value: r.discount, note: `${r.bookings} uses` }))} format={compactInr} color="var(--color-secondary)" />
                  </section>
                </div>
              )}
            </>
          )}
        </div>
        <aside className="analytics-aside card" aria-label="Filters">
          <h2 className="h4">Filters</h2>
          {filters}
        </aside>
      </div>

      {filtersOpen && (
        <Modal
          title="Filters"
          onClose={() => setFiltersOpen(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
              Show results
            </button>
          }
        >
          {filters}
        </Modal>
      )}
    </div>
  );
}
