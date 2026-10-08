import { useRef, useState } from 'react';
import { formatPrice } from '../lib/format.js';
import { SEAT_KIND_LABEL, seatKind } from '../lib/pricing.js';

// The seat map of one cabin of the flight's aircraft configuration (prd.md → Workflow 15).
// Keyboard: one seat is in the tab order at a time; arrow keys move between seats (roving tabindex).
// Each seat announces its number, position, price and availability.
export default function SeatMap({ seatMap, cabin, assigned, onSelect }) {
  const { rows, layout, extraLegroomRows, unavailableSeats, fees } = seatMap;
  const letters = layout.filter(Boolean);
  const unavailable = new Set(unavailableSeats);
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const refs = useRef({});
  const business = cabin === 'business';

  function move(e, r, c) {
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = { row: Math.min(rows.length - 1, Math.max(0, r + delta[0])), col: Math.min(letters.length - 1, Math.max(0, c + delta[1])) };
    setFocus(next);
    refs.current[`${rows[next.row]}${letters[next.col]}`]?.focus();
  }

  const fee = (kind) => (fees?.[kind] ? formatPrice(fees[kind]) : 'free');
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
        {extraLegroomRows.length > 0 && (
          <li>
            <span className="seat-swatch is-legroom" /> Extra legroom
          </li>
        )}
        <li>{business ? 'Business seats are included in your fare' : `Window ${fee('window')} · Aisle ${fee('aisle')} · Middle ${fee('middle')}${extraLegroomRows.length ? ` · Extra legroom ${fee('extraLegroom')}` : ''}`}</li>
      </ul>
      <div className={`seat-map ${business ? 'is-business' : ''}`} role="grid" aria-label={`${business ? 'Business' : 'Economy'} cabin seat map. Use arrow keys to move between seats.`}>
        <div className="seat-row seat-row--head" role="row">
          {layout.map((l, i) =>
            l ? (
              <span key={l} className="seat-letter" role="columnheader">
                {l}
              </span>
            ) : (
              <span key={`aisle-${i}`} className="seat-aisle" aria-hidden="true" />
            ),
          )}
        </div>
        {rows.map((row, r) => {
          let col = -1;
          return (
            <div className={`seat-row ${extraLegroomRows.includes(row) ? 'is-legroom-row' : ''}`} role="row" key={row}>
              {layout.map((letter, i) => {
                if (!letter) {
                  return (
                    <span key={`aisle-${i}`} className="seat-aisle seat-row-num" role="rowheader">
                      {row}
                    </span>
                  );
                }
                col += 1;
                const c = col;
                const label = `${row}${letter}`;
                const kind = seatKind(layout, extraLegroomRows, label);
                const taken = unavailable.has(label);
                const owner = assigned.indexOf(label);
                const price = fees?.[kind] || 0;
                return (
                  <span role="gridcell" key={label}>
                    <button
                      ref={(el) => (refs.current[label] = el)}
                      type="button"
                      className={`seat ${taken ? 'is-unavailable' : ''} ${owner >= 0 ? 'is-selected' : ''} ${kind === 'extraLegroom' ? 'is-legroom' : ''}`}
                      disabled={taken}
                      tabIndex={focus.row === r && focus.col === c ? 0 : -1}
                      aria-pressed={owner >= 0}
                      aria-label={`Seat ${label}, ${SEAT_KIND_LABEL[kind]}, ${price ? formatPrice(price) : business ? 'included' : 'free'}, ${
                        taken ? 'unavailable' : owner >= 0 ? `selected for traveller ${owner + 1}` : 'available'
                      }`}
                      onClick={() => {
                        setFocus({ row: r, col: c });
                        onSelect(label);
                      }}
                      onKeyDown={(e) => move(e, r, c)}
                      onFocus={() => setFocus({ row: r, col: c })}
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
