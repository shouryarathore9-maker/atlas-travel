import { useRef, useState } from 'react';
import { SEAT_LETTERS, seatType } from '../lib/pricing.js';
import { formatPrice } from '../lib/format.js';

// Keyboard: one seat is in the tab order at a time; arrow keys move between seats (roving tabindex).
// Each seat announces its number, position, price and availability.
export default function SeatMap({ seatMap, assigned, onSelect }) {
  const { rows, columns, unavailableSeats, seatPricing } = seatMap;
  const letters = SEAT_LETTERS.slice(0, columns).split('');
  const unavailable = new Set(unavailableSeats);
  const aisleAfter = Math.floor(columns / 2) - 1;
  const [focus, setFocus] = useState({ row: 1, col: 0 });
  const refs = useRef({});

  function move(e, row, col) {
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = { row: Math.min(rows, Math.max(1, row + delta[0])), col: Math.min(columns - 1, Math.max(0, col + delta[1])) };
    setFocus(next);
    refs.current[`${next.row}${letters[next.col]}`]?.focus();
  }

  return (
    <div className="seat-map-wrap">
      <ul className="seat-legend small" aria-label="Seat legend">
        <li>
          <span className="seat-swatch" /> Available
        </li>
        <li>
          <span className="seat-swatch is-selected" /> Selected
        </li>
        <li>
          <span className="seat-swatch is-unavailable" /> Unavailable
        </li>
        <li>Window {formatPrice(seatPricing.window)} · Aisle {formatPrice(seatPricing.aisle)} · Middle {seatPricing.middle ? formatPrice(seatPricing.middle) : 'free'}</li>
      </ul>
      <div className="seat-map" role="grid" aria-label="Seat map. Use arrow keys to move between seats." style={{ '--cols': columns }}>
        <div className="seat-row seat-row--head" role="row">
          <span className="seat-row-num" aria-hidden="true" />
          {letters.map((l, i) => (
            <span key={l} className={`seat-letter ${i === aisleAfter ? 'aisle-gap' : ''}`} role="columnheader">
              {l}
            </span>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => {
          const row = r + 1;
          return (
            <div className="seat-row" role="row" key={row}>
              <span className="seat-row-num" role="rowheader">
                {row}
              </span>
              {letters.map((letter, col) => {
                const label = `${row}${letter}`;
                const type = seatType(col, columns);
                const taken = unavailable.has(label);
                const owner = assigned.indexOf(label);
                const price = seatPricing[type] || 0;
                return (
                  <span role="gridcell" key={label} className={col === aisleAfter ? 'aisle-gap' : ''}>
                    <button
                      ref={(el) => (refs.current[label] = el)}
                      type="button"
                      className={`seat ${taken ? 'is-unavailable' : ''} ${owner >= 0 ? 'is-selected' : ''}`}
                      disabled={taken}
                      tabIndex={focus.row === row && focus.col === col ? 0 : -1}
                      aria-pressed={owner >= 0}
                      aria-label={`Seat ${label}, ${type}, ${price ? formatPrice(price) : 'free'}, ${
                        taken ? 'unavailable' : owner >= 0 ? `selected for traveller ${owner + 1}` : 'available'
                      }`}
                      onClick={() => {
                        setFocus({ row, col });
                        onSelect(label);
                      }}
                      onKeyDown={(e) => move(e, row, col)}
                      onFocus={() => setFocus({ row, col })}
                    >
                      {owner >= 0 ? owner + 1 : ''}
                    </button>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
