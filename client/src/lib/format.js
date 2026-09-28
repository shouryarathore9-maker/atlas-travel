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
