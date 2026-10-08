// Helpers shared by console forms.

// "roomTypes.0.price" -> "room types › #1 › price"
export function humanizePath(path) {
  return path
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? `#${Number(part) + 1}` : part.replace(/([A-Z])/g, ' $1').toLowerCase()))
    .join(' › ');
}

// Turns an API error into a list of readable lines for a form banner.
export function errorLines(err) {
  return err.details?.length ? err.details.map((d) => `${humanizePath(d.path)}: ${d.message}`) : [err.message];
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function daysLabel(days) {
  if (days.length === 7) return 'Daily';
  if (days.join() === '1,2,3,4,5') return 'Mon–Fri';
  return days.map((d) => WEEKDAYS[d]).join(', ');
}

// 555 -> "09:15"
export const minuteToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function changeLabel(current, previous) {
  if (!previous) return current ? 'New this period' : 'No change';
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% vs previous 30 days`;
}
