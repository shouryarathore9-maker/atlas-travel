// Mirrors server/services/bookingService.js for display. The server always re-prices on payment.
export const FLIGHT_TAX_RATE = 0.12;
export const SEAT_LETTERS = 'ABCDEFGHJK';

export function seatType(col, columns) {
  if (col === 0 || col === columns - 1) return 'window';
  if (columns === 6 && (col === 2 || col === 3)) return 'aisle';
  return 'middle';
}

export function seatPrice(label, seatMap) {
  if (!label) return 0;
  const col = SEAT_LETTERS.indexOf(label.slice(-1));
  return seatMap.seatPricing?.[seatType(col, seatMap.columns)] || 0;
}

export function flightBreakdown(flight, fareType, travellers) {
  const fare = flight.fareOptions.find((f) => f.type === fareType);
  if (!fare) return null;
  const base = fare.price * travellers.length;
  const seats = travellers.reduce((sum, t) => sum + seatPrice(t.seat, flight.seatMap), 0);
  const meals = travellers.reduce((sum, t) => sum + (flight.mealOptions.find((m) => m.name === t.meal)?.price || 0), 0);
  const taxes = Math.round(base * FLIGHT_TAX_RATE);
  return { base, taxes, seats, meals, addons: seats + meals, total: base + taxes + seats + meals };
}

export function hotelBreakdown(room, rooms, nights) {
  if (!room || nights < 1) return null;
  const base = room.price * rooms * nights;
  const taxes = room.taxesAndFees * rooms * nights;
  return { base, taxes, addons: 0, total: base + taxes };
}

// Same rule as the server's roomFits()
export function roomFits(room, { adults, children, rooms }) {
  return (
    room.occupancy.adults * rooms >= adults &&
    (room.occupancy.adults + room.occupancy.children) * rooms >= adults + children
  );
}
