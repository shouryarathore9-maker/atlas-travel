import { useCallback, useState } from 'react';
import FlightCard from '../components/FlightCard.jsx';
import FlightSearchForm from '../components/FlightSearchForm.jsx';
import { CheckboxGroup, MaxPriceFilter } from '../components/Filters.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../components/States.jsx';
import { flightsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useResultParams } from '../hooks/useResultParams.js';
import { cityByCode } from '../lib/cities.js';
import { todayIst } from '../lib/dates.js';
import { formatDateString, pluralize } from '../lib/format.js';

const DEPARTURE_OPTIONS = [
  { value: 'early', label: 'Before 6 AM' },
  { value: 'morning', label: '6 AM – 12 PM' },
  { value: 'afternoon', label: '12 PM – 6 PM' },
  { value: 'evening', label: 'After 6 PM' },
];

const SORTS = [
  { value: 'price', label: 'Lowest price' },
  { value: 'duration', label: 'Shortest duration' },
  { value: 'departure', label: 'Earliest departure' },
  { value: 'rating', label: 'Highest rated' },
];

const FILTER_KEYS = ['stops', 'airlines', 'departure', 'maxPrice'];

export default function FlightResults() {
  const [q, update] = useResultParams(['stops', 'airlines', 'departure']);
  const [editing, setEditing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const from = cityByCode(q.origin)?.city || q.origin;
  const to = cityByCode(q.destination)?.city || q.destination;
  useDocumentTitle(`Flights ${from} to ${to}`);

  const queryKey = JSON.stringify(q);
  const pastDate = Boolean(q.date) && q.date < todayIst();
  const { data, error, loading, reload } = useAsync(
    (signal) =>
      // A date that has already passed can't have bookable flights — skip the request.
      pastDate
        ? Promise.resolve({ results: [], total: 0, page: 1, pages: 1, unfilteredTotal: 0, pastDates: true, facets: { airlines: [], stops: [], minPrice: 0, maxPrice: 0 } })
        : flightsApi.search(
        {
          origin: q.origin,
          destination: q.destination,
          date: q.date,
          travellers: q.travellers,
          cabin: q.cabin,
          stops: q.stops,
          airlines: q.airlines,
          departure: q.departure,
          maxPrice: q.maxPrice,
          sort: q.sort,
          page: q.page,
        },
        { signal },
      ),
    [queryKey],
  );

  const setMaxPrice = useCallback((v) => update({ maxPrice: v }), [update]);
  const activeFilters = FILTER_KEYS.some((k) => (Array.isArray(q[k]) ? q[k].length : q[k]));
  const clearFilters = () => update({ stops: [], airlines: [], departure: [], maxPrice: undefined });

  // Nothing to filter (no results at all, e.g. past dates) → no filter panel or Filters button.
  const filters = data && data.unfilteredTotal > 0 && (
    <div className="filters">
      <div className="spread">
        <h2 className="filters-title">Filters</h2>
        {activeFilters && (
          <button type="button" className="btn-text" onClick={clearFilters}>
            Clear all
          </button>
        )}
      </div>
      <CheckboxGroup
        legend="Stops"
        options={[
          { value: '0', label: 'Non-stop' },
          { value: '1', label: '1 stop or more' },
        ]}
        selected={q.stops}
        onChange={(v) => update({ stops: v })}
      />
      <CheckboxGroup
        legend="Airlines"
        options={data.facets.airlines.map((a) => ({ value: a, label: a }))}
        selected={q.airlines}
        onChange={(v) => update({ airlines: v })}
      />
      <CheckboxGroup legend="Departure time" options={DEPARTURE_OPTIONS} selected={q.departure} onChange={(v) => update({ departure: v })} />
      {data.facets.maxPrice > data.facets.minPrice && (
        <MaxPriceFilter
          min={data.facets.minPrice}
          max={data.facets.maxPrice}
          value={q.maxPrice ? Number(q.maxPrice) : undefined}
          onChange={setMaxPrice}
          label="Maximum price per traveller"
        />
      )}
    </div>
  );

  return (
    <main id="main">
      <div className="summary-bar">
        <div className="container spread">
          <div>
            <p className="summary-route">
              {from} <Icon name="arrowRight" size={16} /> {to}
            </p>
            <p className="small muted">
              {q.date && formatDateString(q.date, { weekday: 'short' })} · {pluralize(Number(q.travellers) || 1, 'traveller')} ·{' '}
              {q.cabin === 'business' ? 'Business' : 'Economy'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            {editing ? 'Close' : 'Modify search'}
          </button>
        </div>
        {editing && (
          <div className="container summary-edit">
            <FlightSearchForm key={queryKey} initial={q} compact />
          </div>
        )}
      </div>

      <div className="container results-layout">
        <aside className="results-sidebar" aria-label="Filters">
          {filters}
        </aside>

        <section className="results-main" aria-labelledby="results-heading">
          <div className="results-toolbar">
            <h1 id="results-heading" className="results-count" aria-live="polite">
              {data ? pluralize(data.total, 'flight') : 'Searching flights…'}
            </h1>
            <div className="row">
              {/* Shown while loading too (stable layout); hidden only once we know there's nothing to filter */}
              {(!data || data.unfilteredTotal > 0) && (
              <button type="button" className="btn btn-secondary btn-sm filters-toggle" disabled={!filters} onClick={() => setFiltersOpen(true)}>
                <Icon name="filter" size={18} /> Filters
              </button>
              )}
              <label className="sort-control">
                <span className="small">Sort</span>
                <select className="select" value={q.sort || 'price'} onChange={(e) => update({ sort: e.target.value })}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error && <ErrorState error={error} onRetry={reload} />}
          {!error && !data && <SkeletonList />}
          {data && (
            <div className={loading ? 'results-list is-loading' : 'results-list'}>
              {data.results.length === 0 &&
                (data.tooFar ? (
                  <EmptyState
                    title="Flights can be booked up to 60 days ahead"
                    icon="calendar"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                        Pick an earlier date
                      </button>
                    }
                  >
                    Choose a date within the next 60 days to see flights.
                  </EmptyState>
                ) : data.pastDates ? (
                  <EmptyState
                    title="That date has already passed"
                    icon="calendar"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                        Pick a new date
                      </button>
                    }
                  >
                    Choose today or a later date to see flights.
                  </EmptyState>
                ) : data.unfilteredTotal === 0 ? (
                  <EmptyState
                    title="No flights on this route that day"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                        Modify search
                      </button>
                    }
                  >
                    Try another date or a nearby city.
                  </EmptyState>
                ) : (
                  <EmptyState
                    title="No flights match your filters"
                    icon="filter"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                        Clear filters
                      </button>
                    }
                  >
                    Loosen a filter or two to see more options.
                  </EmptyState>
                ))}
              {data.results.map((flight) => (
                <FlightCard key={flight._id} flight={flight} travellers={q.travellers || 1} cabin={q.cabin || 'economy'} />
              ))}
              {data.pages > 1 && (
                <nav className="pagination" aria-label="Result pages">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 }, { keepPage: true })}>
                    Previous
                  </button>
                  <span className="small">
                    Page {data.page} of {data.pages}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={data.page >= data.pages} onClick={() => update({ page: data.page + 1 }, { keepPage: true })}>
                    Next
                  </button>
                </nav>
              )}
            </div>
          )}
        </section>
      </div>

      {filtersOpen && (
        <Modal
          title="Filters"
          onClose={() => setFiltersOpen(false)}
          footer={
            <button type="button" className="btn btn-primary btn-block" onClick={() => setFiltersOpen(false)}>
              Show {data ? pluralize(data.total, 'flight') : 'flights'}
            </button>
          }
        >
          {filters}
        </Modal>
      )}
    </main>
  );
}
