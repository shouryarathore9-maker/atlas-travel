const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const todayIst = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / DAY_MS);
}

// Flights and stays can be booked up to 60 days ahead (prd.md → Booking limits); today is day 1.
export const BOOKING_HORIZON_DAYS = 60;
export const lastBookableDate = () => addDays(todayIst(), BOOKING_HORIZON_DAYS - 1);

export const isDateString = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
