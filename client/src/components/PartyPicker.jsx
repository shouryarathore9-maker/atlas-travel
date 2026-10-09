import { useEffect, useId, useRef, useState } from 'react';
import { partyLabel } from '../lib/pricing.js';

const ROWS = [
  { key: 'adults', label: 'Adults', hint: '12 years and over', min: 1 },
  { key: 'children', label: 'Children', hint: '2–11 years', min: 0 },
  { key: 'infants', label: 'Infants', hint: 'Under 2, on an adult’s lap', min: 0 },
];

// Travellers for a flight search: a pill button that opens three steppers.
// Adults + children ≤ 9; infants ≤ adults (each infant travels with an adult).
export default function PartyPicker({ value, onChange, id }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onClick = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const max = (key) => (key === 'infants' ? value.adults : 9 - (key === 'adults' ? value.children : value.adults));
  const set = (key, n) => {
    const next = { ...value, [key]: n };
    if (next.infants > next.adults) next.infants = next.adults;
    onChange(next);
  };

  const summary = partyLabel(value);
  // A mixed party shows as a count ("3 travellers") so it fits the field; the full summary is the
  // button's accessible name and tooltip, and the panel lists each kind. Anything still too long is
  // cut with an ellipsis rather than running into the next field.
  const total = value.adults + value.children + value.infants;
  const short = value.children || value.infants ? `${total} travellers` : summary;
  return (
    <div className="party-picker" ref={wrapRef}>
      <button type="button" id={id} className="party-toggle" title={summary} aria-label={summary} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <span className="party-toggle-text">{short}</span>
      </button>
      {open && (
        <div className="party-panel" id={panelId} role="group" aria-label="Travellers">
          {ROWS.map((row) => (
            <div className="party-row" key={row.key}>
              <div>
                <p className="party-label">{row.label}</p>
                <p className="small muted">{row.hint}</p>
              </div>
              <div className="stepper">
                <button type="button" className="icon-btn" aria-label={`Fewer ${row.label.toLowerCase()}`} disabled={value[row.key] <= row.min} onClick={() => set(row.key, value[row.key] - 1)}>
                  −
                </button>
                <span aria-live="polite" aria-label={`${value[row.key]} ${row.label.toLowerCase()}`}>
                  {value[row.key]}
                </span>
                <button type="button" className="icon-btn" aria-label={`More ${row.label.toLowerCase()}`} disabled={value[row.key] >= max(row.key)} onClick={() => set(row.key, value[row.key] + 1)}>
                  +
                </button>
              </div>
            </div>
          ))}
          <p className="small muted">Up to 9 adults and children. Each infant travels on an adult’s lap.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
