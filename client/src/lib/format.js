const TZ = 'Asia/Kolkata';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatPrice = (amount) => inr.format(Math.round(amount || 0));

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

export const formatDate = (date, opts = {}) =>
  new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ, ...opts });

export const formatDay = (date) => formatDate(date, { weekday: 'short', year: undefined });

export const formatDateTime = (date) => `${formatDay(date)}, ${formatTime(date)}`;

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export const pluralize = (n, word, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;

export const stopsLabel = (stops) => (stops === 0 ? 'Non-stop' : pluralize(stops, 'stop'));

// "YYYY-MM-DD" -> formatted without timezone drift
export function formatDateString(dateStr, opts) {
  return formatDate(`${dateStr}T12:00:00+05:30`, opts);
}

// "5 min ago", "3 h ago", "yesterday"
export function timeAgo(date, now = Date.now()) {
  const minutes = Math.round((now - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
