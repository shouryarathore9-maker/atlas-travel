// Settlement periods are IST calendar months, written 'YYYY-MM'.
import { IST_OFFSET_MS } from './dates.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM' of the IST month containing `now`. */
export function istPeriod(now = Date.now()) {
  return new Date(new Date(now).getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}
export function shiftPeriod(period, months) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}
/** Midnight IST on the 1st of the period. */
export const periodStart = (period) => new Date(Date.parse(`${period}-01T00:00:00Z`) - IST_OFFSET_MS);
export function periodLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
