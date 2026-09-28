import { formatPrice } from '../lib/format.js';

// Sticky side panel on desktop; on phones it sticks to the bottom showing only total + CTA.
export default function PriceSummary({ title = 'Price summary', lines, total, note, action }) {
  return (
    <aside className="price-summary" aria-label={title}>
      <div className="card price-summary-card">
        <h2 className="price-summary-title">{title}</h2>
        <dl className="price-lines">
          {lines.filter(Boolean).map((line) => (
            <div key={line.label} className="price-line">
              <dt>{line.label}</dt>
              <dd>{line.amount === 0 && line.freeLabel ? line.freeLabel : formatPrice(line.amount)}</dd>
            </div>
          ))}
          <div className="price-line price-total">
            <dt>Total</dt>
            <dd>{formatPrice(total)}</dd>
          </div>
        </dl>
        {note && <p className="small muted">{note}</p>}
        <div className="price-summary-action">{action}</div>
      </div>
    </aside>
  );
}
