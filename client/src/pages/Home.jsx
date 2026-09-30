import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import BestHotels from '../components/BestHotels.jsx';
import Icon from '../components/Icon.jsx';
import Nav from '../components/Nav.jsx';
import SearchCard from '../components/SearchCard.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { Banner } from '../components/States.jsx';
import { CITIES } from '../lib/cities.js';
import { addDays, todayIst } from '../lib/dates.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const FEATURED_FIRST = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai'];
const ORDERED_CITIES = [
  ...FEATURED_FIRST.map((name) => CITIES.find((c) => c.city === name)),
  ...CITIES.filter((c) => !FEATURED_FIRST.includes(c.city)),
];

const PROMISES = [
  { icon: 'location', title: 'Handpicked stays', text: 'In India’s eight great cities' },
  { icon: 'check', title: 'One honest price', text: 'Taxes shown before you pay' },
  { icon: 'compass', title: 'No upsell detours', text: 'Nothing you didn’t ask for' },
];

export default function Home() {
  useDocumentTitle();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [showAll, setShowAll] = useState(false);
  const tab = params.get('tab') === 'hotels' ? 'hotels' : 'flights';
  const checkIn = addDays(todayIst(), 7);
  // Default stay for homepage cards: a week out, two nights, two adults, one room.
  const defaultStay = { checkIn, checkOut: addDays(checkIn, 2), adults: 2, children: 0, rooms: 1 };

  // Nav links point at /#destinations and /#best-hotels; scroll there once the page has rendered.
  useEffect(() => {
    if (!location.hash) return;
    // Instant jump when arriving from another page (smooth scrolling is kept for same-page clicks in Nav).
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [location.hash, location.search]);

  function setTab(next) {
    setParams(next === 'flights' ? {} : { tab: next }, { replace: true });
  }

  const cities = showAll ? ORDERED_CITIES : ORDERED_CITIES.slice(0, 4);

  return (
    <div className="home">
      <Nav />
      <main id="main">
        {/* Redirect notices (e.g. "admins only") sit above the hero so they're seen immediately. */}
        {location.state?.notice && (
          <div className="container home-notice">
            <Banner tone="error">
              <p>{location.state.notice}</p>
            </Banner>
          </div>
        )}
        <section className="hero" aria-labelledby="hero-heading">
          <picture className="hero-image">
            <source media="(max-width: 767px)" srcSet="/images/seed/hero-mobile.webp" />
            <img src="/images/seed/hero-laptop.webp" alt="" fetchPriority="high" decoding="async" />
          </picture>
          <div className="hero-scrim" aria-hidden="true" />
          <div className="container hero-content">
            <p className="hero-eyebrow">Flights &amp; stays across India</p>
            <h1 id="hero-heading">
              Travel,
              <br />
              thoughtfully.
            </h1>
            <p className="hero-sub">
              One clear choice at a time. No pop-ups, no countdown timers — just the flight or the room you came for.
            </p>
          </div>
          <div className="container hero-search" id="search">
            <SearchCard tab={tab} onTabChange={setTab} />
          </div>
        </section>

        <div className="container">

          <section className="section" id="destinations" aria-labelledby="featured-heading">
            <div className="spread section-head">
              <h2 id="featured-heading">Featured destinations</h2>
              <button type="button" className="btn-text view-all" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
                {showAll ? 'Show fewer' : 'View all'} <Icon name="arrowRight" size={16} />
              </button>
            </div>
            <ul className="destination-grid">
              {cities.map((city) => (
                <li key={city.code}>
                  <Link
                    to={`/hotels?${new URLSearchParams({ city: city.city, ...defaultStay })}`}
                    className="destination-card"
                  >
                    <SmartImage
                      src={city.image}
                      alt=""
                      caption={city.city}
                      className="destination-image"
                      sizes="(min-width: 1280px) 300px, (min-width: 768px) 50vw, 100vw"
                    />
                    <span className="destination-name">{city.city}</span>
                    <span className="destination-blurb">{city.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <BestHotels stayQuery={new URLSearchParams(defaultStay).toString()} />

          <section className="quote-strip" aria-label="Our promise">
            <SmartImage src="/images/seed/quote-terrace.webp" alt="" className="quote-strip-image" />
            <figure className="quote-strip-card">
              <blockquote>
                <p>“The best journeys begin quietly — with a clear price, an honest policy, and nothing you didn’t ask for.”</p>
              </blockquote>
              <span className="quote-rule" aria-hidden="true" />
            </figure>
          </section>

          <ul className="promise-row">
            {PROMISES.map((p) => (
              <li key={p.title}>
                <Icon name={p.icon} size={22} />
                <span>
                  <strong>{p.title}</strong>
                  <span className="small muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
