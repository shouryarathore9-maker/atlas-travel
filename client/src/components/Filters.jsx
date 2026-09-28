import { useEffect, useId, useState } from 'react';
import { formatPrice } from '../lib/format.js';

export function CheckboxGroup({ legend, options, selected, onChange }) {
  const toggle = (value) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <fieldset className="filter-group">
      <legend>{legend}</legend>
      {options.map((opt) => (
        <label key={opt.value} className="checkbox">
          <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} />
          <span>{opt.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function RadioGroup({ legend, name, options, value, onChange }) {
  const uid = useId();
  return (
    <fieldset className="filter-group">
      <legend>{legend}</legend>
      {options.map((opt) => (
        <label key={opt.value} className="checkbox">
          <input type="radio" name={`${name}-${uid}`} checked={value === opt.value} onChange={() => onChange(opt.value)} />
          <span>{opt.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Range slider that commits to the URL after the user pauses, not on every pixel.
export function MaxPriceFilter({ min, max, value, onChange, label = 'Maximum price' }) {
  const ceiling = Math.max(max, min + 100);
  const [local, setLocal] = useState(value ?? ceiling);
  const id = useId();

  useEffect(() => {
    setLocal(value ?? ceiling);
  }, [value, ceiling]);

  useEffect(() => {
    const current = value ?? ceiling;
    if (local === current) return undefined;
    const t = setTimeout(() => onChange(local >= ceiling ? undefined : local), 300);
    return () => clearTimeout(t);
  }, [local, value, ceiling, onChange]);

  return (
    <div className="filter-group">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={ceiling}
        step={100}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        aria-valuetext={formatPrice(local)}
      />
      <div className="spread small muted">
        <span>{formatPrice(min)}</span>
        <span aria-hidden="true">Up to {formatPrice(local)}</span>
      </div>
    </div>
  );
}
