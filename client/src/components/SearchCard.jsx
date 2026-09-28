import { useRef } from 'react';
import Icon from './Icon.jsx';
import FlightSearchForm from './FlightSearchForm.jsx';
import HotelSearchForm from './HotelSearchForm.jsx';

const TABS = [
  { id: 'flights', label: 'Flights', icon: 'plane' },
  { id: 'hotels', label: 'Hotels', icon: 'bed' },
];

// Flights / Hotels switcher inside the hero card (design.md decision #1). Flights is the default.
export default function SearchCard({ tab, onTabChange }) {
  const tabRefs = useRef({});

  function onKeyDown(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const index = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(index + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    onTabChange(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className="search-card">
      <div className="tabs" role="tablist" aria-label="What would you like to book?" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => (tabRefs.current[t.id] = el)}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => onTabChange(t.id)}
          >
            <Icon name={t.icon} size={18} /> {t.label}
          </button>
        ))}
      </div>
      {/* Both panels stay mounted so switching tabs never loses what the user typed. */}
      <div role="tabpanel" id="panel-flights" aria-labelledby="tab-flights" className="search-panel" hidden={tab !== 'flights'}>
        <FlightSearchForm />
      </div>
      <div role="tabpanel" id="panel-hotels" aria-labelledby="tab-hotels" className="search-panel" hidden={tab !== 'hotels'}>
        <HotelSearchForm />
      </div>
    </div>
  );
}
