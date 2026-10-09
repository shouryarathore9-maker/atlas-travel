import Icon from './Icon.jsx';

// Branded loader: a flight path being drawn between two airports, with the status text under it.
// Same API as before ({ label }); under reduced motion the route simply shows complete.
export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-block" role="status" aria-live="polite">
      <svg className="route-loader" viewBox="0 0 96 40" width="96" height="40" aria-hidden="true" focusable="false">
        <path className="route-loader-track" d="M8 32 Q48 -6 88 32" />
        <path className="route-loader-line" d="M8 32 Q48 -6 88 32" pathLength="100" />
        <circle className="route-loader-stop" cx="8" cy="32" r="3.5" />
        <circle className="route-loader-stop route-loader-stop--end" cx="88" cy="32" r="3.5" />
      </svg>
      <p className="muted">{label}</p>
    </div>
  );
}

export function SkeletonList({ count = 4, height }) {
  return (
    <div aria-busy="true" aria-label="Loading results">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-card" style={height ? { height } : undefined} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action, icon = 'compass' }) {
  return (
    <div className="empty-state fade-in">
      <Icon name={icon} size={40} />
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'That didn’t load' }) {
  return (
    <div className="empty-state" role="alert">
      <Icon name="alert" size={40} />
      <h2>{title}</h2>
      <p className="muted">{error?.message || 'Something went wrong. Please try again.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Banner({ tone = 'info', children, action }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'success' ? 'check' : 'alert'} />
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}
