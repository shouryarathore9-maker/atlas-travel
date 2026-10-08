// Web check-in window (prd.md → Web check-in): from 48 hours to 60 minutes before departure.
export const CHECK_IN_OPENS_MS = 48 * 3600e3;
export const CHECK_IN_CLOSES_MS = 60 * 60e3;

export function checkInState(booking, now = Date.now()) {
  if (booking.type !== 'flight' || booking.status !== 'confirmed') return null;
  const dep = new Date(booking.travelDates.start).getTime();
  if (booking.checkIn) return 'done';
  if (now < dep - CHECK_IN_OPENS_MS) return 'soon';
  if (now < dep - CHECK_IN_CLOSES_MS) return 'open';
  return dep > now ? 'closed' : null;
}

export const checkInOpensAt = (booking) => new Date(new Date(booking.travelDates.start).getTime() - CHECK_IN_OPENS_MS);
