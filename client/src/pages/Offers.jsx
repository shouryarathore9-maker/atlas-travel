import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import OfferCard, { SCOPE_LABEL } from '../components/OfferCard.jsx';
import Reveal from '../components/Reveal.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../components/States.jsx';
import { offersApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatDateString, formatPrice } from '../lib/format.js';

const CHIPS = [
  { key: '', label: 'All' },
  { key: 'flights', label: 'Flights' },
  { key: 'hotels', label: 'Hotels' },
];

export function OffersPage() {
  useDocumentTitle('Offers');
  const [product, setProduct] = useState('');
  const { data, error, reload } = useAsync((signal) => offersApi.list(product ? { product } : {}, { signal }), [product]);
  return (
    <main id="main" className="container page">
      <h1>Offers</h1>
      <p className="muted">Every offer that’s live today. One offer per booking; the discount appears as its own line before you pay.</p>
      <div className="row chip-row" role="group" aria-label="Filter offers">
        {CHIPS.map((c) => (
          <button key={c.label} type="button" className="chip-check" aria-pressed={product === c.key} onClick={() => setProduct(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={3} height={260} />}
      {data && data.offers.length === 0 && <EmptyState title="No offers right now">Check back soon — prices are fair without them too.</EmptyState>}
      {data && data.offers.length > 0 && (
        <ul className="offer-grid offer-grid--page">
          {data.offers.map((o) => (
            <Reveal as="li" key={o._id}>
              <OfferCard offer={o} />
            </Reveal>
          ))}
        </ul>
      )}
    </main>
  );
}

export function OfferDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { data, error, reload } = useAsync((signal) => offersApi.get(slug, { signal }), [slug]);
  const [copied, setCopied] = useState(false);
  useDocumentTitle(data?.offer.title || 'Offer');

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Offer not found' : undefined} />
      </main>
    );
  }
  if (!data) {
    return (
      <main id="main" className="container page">
        <SkeletonList count={1} height={360} />
      </main>
    );
  }
  const o = data.offer;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(o.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const searches = o.scope === 'both' ? ['flights', 'hotels'] : [o.scope];
  return (
    <main id="main" className="container page">
      <nav className="small breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <Link to="/offers">Offers</Link> / <span aria-current="page">{o.title}</span>
      </nav>
      <div className="offer-detail">
        <aside className="card offer-summary">
          <SmartImage src={o.image} alt="" caption={o.title} className="offer-summary-image" sizes="360px" eager />
          <span className="badge badge-olive">{SCOPE_LABEL[o.scope]}</span>
          <h1 className="offer-title">{o.title}</h1>
          <dl className="offer-table">
            <div>
              <dt>Category</dt>
              <dd>{o.supplierName ? `${o.supplierName} · ${SCOPE_LABEL[o.scope]}` : `${SCOPE_LABEL[o.scope]} on Atlas`}</dd>
            </div>
            <div>
              <dt>Expires on</dt>
              <dd>{formatDateString(o.validTo, { year: 'numeric' })}</dd>
            </div>
          </dl>
          {!o.live ? (
            <p className="notice-sand">This offer has ended.</p>
          ) : o.firstBookingsOnly && !user ? (
            <div className="stack">
              <p className="small">For your first 3 bookings on Atlas.</p>
              <Link to={`/login?next=${encodeURIComponent(`/offers/${o.slug}`)}`} className="btn btn-primary btn-block">
                Sign in to use this offer
              </Link>
            </div>
          ) : (
            <>
              <div className="code-row">
                {o.code ? (
                  <>
                    <span>
                      Use code: <strong>{o.code}</strong>
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <span>Applied automatically at checkout</span>
                )}
              </div>
              {o.firstBookingsOnly && <p className="small muted">For your first 3 bookings on Atlas.</p>}
              {searches.map((s, i) => (
                <Link key={s} to={s === 'flights' ? '/?tab=flights' : '/?tab=hotels'} className={`btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} btn-block`}>
                  Search {s}
                </Link>
              ))}
            </>
          )}
        </aside>
        <div className="offer-body">
          <section>
            <h2>About the offer</h2>
            <ul>
              <li>{o.discount[0].toUpperCase() + o.discount.slice(1)} the {o.scope === 'hotels' ? 'room charges' : o.scope === 'flights' ? 'base fare' : 'base fare or room charges'}.</li>
              {o.minSpend > 0 && <li>Minimum spend {formatPrice(o.minSpend)}.</li>}
              {o.supplierName && <li>Only for {o.supplierName}.</li>}
              <li>
                For bookings made {formatDateString(o.validFrom, { year: 'numeric' })} to {formatDateString(o.validTo, { year: 'numeric' })}.
              </li>
              {o.description && <li>{o.description}</li>}
            </ul>
          </section>
          <section>
            <h2>How to use it</h2>
            <ol>
              <li>Search for {o.scope === 'both' ? 'a flight or a stay' : o.scope === 'flights' ? 'a flight' : 'a stay'}.</li>
              <li>Choose your {o.scope === 'hotels' ? 'room' : 'fare'} and enter the traveller details.</li>
              <li>{o.code ? `On the review step, open “Have a code?” and enter ${o.code}.` : 'On the review step, the offer is applied for you.'}</li>
            </ol>
          </section>
          <section>
            <h2>Terms &amp; conditions</h2>
            <ul className="small">
              {o.terms.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
