const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// <input type="datetime-local"> values are treated as IST wall-clock time.
export const toIstInput = (date) => (date ? new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16) : '');
export const fromIstInput = (value) => (value ? new Date(`${value}:00+05:30`).toISOString() : '');

export const splitList = (text) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// "fareOptions.0.price" -> "Fare option 1 › price"
export function humanizePath(path) {
  return path
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? `#${Number(part) + 1}` : part.replace(/([A-Z])/g, ' $1').toLowerCase()))
    .join(' › ');
}
