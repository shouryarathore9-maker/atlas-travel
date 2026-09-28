// All inventory is Indian domestic, so calendar days are interpreted in IST (UTC+05:30).
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-01" -> UTC instant of 00:00 IST on that day
export function istMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

export function istDayRange(dateStr) {
  const start = istMidnight(dateStr);
  return [start, new Date(start.getTime() + DAY_MS)];
}

export function todayIstString(now = Date.now()) {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  return new Date(istMidnight(dateStr).getTime() + days * DAY_MS + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((istMidnight(checkOut) - istMidnight(checkIn)) / DAY_MS);
}
