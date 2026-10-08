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
            {/* Nothing chosen yet (e.g. no room selected) → a dash, not a misleading ₹0 */}
            <dd>{lines.some(Boolean) ? formatPrice(total) : <span aria-label="Not yet calculated">—</span>}</dd>
          </div>
        </dl>
        {note && <div className="small muted price-note">{note}</div>}
        <div className="price-summary-action">{action}</div>
      </div>
    </aside>
  );
}
