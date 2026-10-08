// Small hand-written SVG charts for the analytics dashboard (no chart library). Every chart is a
// <figure> with a visible caption and a "Show data" table, so it has a text equivalent (prd.md → Accessibility).
import { useId } from 'react';

function DataTable({ columns, rows }) {
  return (
    <details className="chart-data">
      <summary>Show data</summary>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : undefined}>
                    {c.format ? c.format(r[c.key], r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Lines over time. `lines`: [{ key, label, color, dashed }]; `points`: [{ label, [key]: number }]. */
export function LineChart({ title, points, lines, format = String, labelOf = (p) => p.label, actions }) {
  const id = useId();
  const W = 640;
  const H = 240;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const max = niceMax(Math.max(1, ...points.flatMap((p) => lines.map((l) => p[l.key] || 0))));
  const x = (i) => pad.l + (points.length < 2 ? 0 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.max(1, Math.ceil(points.length / 7));
  return (
    <figure className="chart">
      <div className="chart-head">
        <figcaption id={id} className="chart-title">
          {title}
        </figcaption>
        {actions}
      </div>
      <div className="chart-legend">
        {lines.map((l) => (
          <span key={l.key}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dashed ? '4 3' : undefined} />
            </svg>{' '}
            {l.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-labelledby={id}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
              {format(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis">
              {labelOf(p)}
            </text>
          ) : null,
        )}
        {lines.map((l) => (
          <polyline
            key={l.key}
            fill="none"
            stroke={l.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray={l.dashed ? '5 4' : undefined}
            points={points.map((p, i) => `${x(i)},${y(p[l.key] || 0)}`).join(' ')}
          />
        ))}
      </svg>
      <DataTable
        columns={[{ key: 'label', label: 'Period' }, ...lines.map((l) => ({ key: l.key, label: l.label, num: true, format }))]}
        rows={points.map((p) => ({ ...p, label: labelOf(p) }))}
      />
    </figure>
  );
}

/** Horizontal bars with the value at the end. `rows`: [{ label, value, note? }]. */
export function BarList({ title, rows, format = String, color = 'var(--color-primary)', empty = 'Nothing in this period.' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      {rows.length === 0 && <p className="small muted">{empty}</p>}
      <ul className="bar-list">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
            </span>
            <span className="bar-value">
              {format(r.value)}
              {r.note && <span className="muted"> · {r.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Vertical bars, one per band. `rows`: [{ label, value }]. */
export function ColumnChart({ title, rows, format = String, colors = [] }) {
  const id = useId();
  const W = 420;
  const H = 220;
  const pad = { l: 12, r: 12, t: 24, b: 30 };
  const max = niceMax(Math.max(...rows.map((r) => r.value), 0.0001));
  const slot = (W - pad.l - pad.r) / rows.length;
  const h = (v) => (v / max) * (H - pad.t - pad.b);
  return (
    <figure className="chart">
      <figcaption id={id} className="chart-title">
        {title}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-labelledby={id}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="chart-grid" />
        {rows.map((r, i) => {
          const bx = pad.l + i * slot + slot * 0.2;
          const bh = h(r.value);
          return (
            <g key={r.label}>
              <rect x={bx} y={H - pad.b - bh} width={slot * 0.6} height={bh} rx="3" fill={colors[i] || 'var(--color-primary)'} />
              <text x={bx + slot * 0.3} y={H - pad.b - bh - 6} textAnchor="middle" className="chart-value">
                {format(r.value)}
              </text>
              <text x={bx + slot * 0.3} y={H - 10} textAnchor="middle" className="chart-axis">
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
      <DataTable
        columns={[
          { key: 'label', label: 'Band' },
          { key: 'value', label: title, num: true, format },
        ]}
        rows={rows}
      />
    </figure>
  );
}

/** The conversion funnel as horizontal steps with step conversion. `steps`: [{ label, value }]. */
export function Funnel({ title, steps }) {
  const max = Math.max(1, steps[0]?.value || 0);
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <ol className="funnel">
        {steps.map((s, i) => (
          <li key={s.label}>
            <span className="bar-label">{s.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%` }} />
            </span>
            <span className="bar-value">
              {s.value.toLocaleString('en-IN')}
              {i > 0 && <span className="muted"> · {steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 1000) / 10 : 0}%</span>}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
