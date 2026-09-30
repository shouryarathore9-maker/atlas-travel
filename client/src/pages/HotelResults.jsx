import { useCallback, useState } from 'react';
import HotelCard from '../components/HotelCard.jsx';
import HotelSearchForm from '../components/HotelSearchForm.jsx';
import { CheckboxGroup, MaxPriceFilter, RadioGroup } from '../components/Filters.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../components/States.jsx';
import { hotelsApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useResultParams } from '../hooks/useResultParams.js';
import { formatDateString, pluralize } from '../lib/format.js';

const SORTS = [
  { value: 'relevance', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Guest rating' },
];

const RATING_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '3.5', label: '3.5 and above' },
  { value: '4', label: '4.0 and above' },
  { value: '4.5', label: '4.5 and above' },
];

export default function HotelResults() {
  const [q, update] = useResultParams(['stars', 'amenities']);
  const [editing, setEditing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useDocumentTitle(`Stays in ${q.city || 'India'}`);

  const queryKey = JSON.stringify(q);
  const { data, error, loading, reload } = useAsync(
    (signal) =>
      hotelsApi.search(
        {
          city: q.city,
          checkIn: q.checkIn,
          checkOut: q.checkOut,
          adults: q.adults,
          children: q.children,
          rooms: q.rooms,
          stars: q.stars,
          minRating: q.minRating,
          amenities: q.amenities,
          maxPrice: q.maxPrice,
          sort: q.sort,
          page: q.page,
        },
        { signal },
      ),
    [queryKey],
  );

  const stayQuery = new URLSearchParams({
    checkIn: q.checkIn || '',
    checkOut: q.checkOut || '',
    adults: q.adults || 2,
    children: q.children || 0,
    rooms: q.rooms || 1,
  }).toString();

  const setMaxPrice = useCallback((v) => update({ maxPrice: v }), [update]);
  const activeFilters = q.stars.length || q.amenities.length || q.minRating || q.maxPrice;
  const clearFilters = () => update({ stars: [], amenities: [], minRating: undefined, maxPrice: undefined });

  // Nothing to filter (no results at all, e.g. past dates) → no filter panel or Filters button.
  const filters = data && data.unfilteredTotal > 0 && (
    <div className="filters">
      <div className="spread">
        <h2 className="filters-title">Filters</h2>
        {activeFilters ? (
          <button type="button" className="btn-text" onClick={clearFilters}>
            Clear all
          </button>
        ) : null}
      </div>
      {data.facets.maxPrice > data.facets.minPrice && (
        <MaxPriceFilter
          min={data.facets.minPrice}
          max={data.facets.maxPrice}
          value={q.maxPrice ? Number(q.maxPrice) : undefined}
          onChange={setMaxPrice}
          label="Maximum price per night"
        />
      )}
      <CheckboxGroup
        legend="Star rating"
        options={[5, 4, 3].filter((s) => data.facets.stars.includes(s)).map((s) => ({ value: String(s), label: `${s} stars` }))}
        selected={q.stars}
        onChange={(v) => update({ stars: v })}
      />
      <RadioGroup
        legend="Guest rating"
        name="minRating"
        options={RATING_OPTIONS}
        value={q.minRating || ''}
        onChange={(v) => update({ minRating: v })}
      />
      <CheckboxGroup
        legend="Amenities"
        options={data.facets.amenities.map((a) => ({ value: a, label: a }))}
        selected={q.amenities}
        onChange={(v) => update({ amenities: v })}
      />
    </div>
  );

  const guests = Number(q.adults || 2) + Number(q.children || 0);

  return (
    <main id="main">
      <div className="summary-bar">
        <div className="container spread">
          <div>
            <p className="summary-route">{q.city}</p>
            <p className="small muted">
              {q.checkIn && formatDateString(q.checkIn, { year: undefined })} – {q.checkOut && formatDateString(q.checkOut, { year: undefined })} ·{' '}
              {pluralize(guests, 'guest')} · {pluralize(Number(q.rooms) || 1, 'room')}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            {editing ? 'Close' : 'Modify search'}
          </button>
        </div>
        {editing && (
          <div className="container summary-edit">
            <HotelSearchForm key={queryKey} initial={q} compact />
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
              {data ? pluralize(data.total, 'stay') : 'Searching stays…'}
            </h1>
            <div className="row">
              {filters && (
              <button type="button" className="btn btn-secondary btn-sm filters-toggle" onClick={() => setFiltersOpen(true)}>
                <Icon name="filter" size={18} /> Filters
              </button>
              )}
              <label className="sort-control">
                <span className="small">Sort</span>
                <select className="select" value={q.sort || 'relevance'} onChange={(e) => update({ sort: e.target.value })}>
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
          {!error && !data && <SkeletonList height={200} />}
          {data && (
            <div className={loading ? 'results-list is-loading' : 'results-list'}>
              {data.results.length === 0 &&
                (data.pastDates ? (
                  <EmptyState
                    title="Those dates have already passed"
                    icon="calendar"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                        Pick new dates
                      </button>
                    }
                  >
                    Choose a check-in date from today onwards to see available stays.
                  </EmptyState>
                ) : data.unfilteredTotal === 0 ? (
                  <EmptyState
                    title="No stays available for those dates"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                        Modify search
                      </button>
                    }
                  >
                    Try different dates, fewer guests per room, or another city.
                  </EmptyState>
                ) : (
                  <EmptyState
                    title="No stays match your filters"
                    icon="filter"
                    action={
                      <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                        Clear filters
                      </button>
                    }
                  >
                    Loosen a filter or two to see more places.
                  </EmptyState>
                ))}
              {data.results.map((hotel) => (
                <HotelCard key={hotel._id} hotel={hotel} stayQuery={stayQuery} />
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
              Show {data ? pluralize(data.total, 'stay') : 'stays'}
            </button>
          }
        >
          {filters}
        </Modal>
      )}
    </main>
  );
}
