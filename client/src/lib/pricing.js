// Display-side mirror of the server's price lines. The server's pricing engine sets every price
// (search, details, checkout quote) and re-prices at payment; these helpers only add up what it sent.

// Seat kind from the cabin layout: letters with '' marking the aisle (server/services/aircraft.js).
export function seatKind(layout, extraLegroomRows, label) {
  const m = /^(\d{1,2})([A-Z])$/.exec(label || '');
  if (!m) return null;
  const letters = layout.filter(Boolean);
  const i = layout.indexOf(m[2]);
  if (extraLegroomRows.includes(Number(m[1]))) return 'extraLegroom';
  if (m[2] === letters[0] || m[2] === letters[letters.length - 1]) return 'window';
  if (layout[i - 1] === '' || layout[i + 1] === '') return 'aisle';
  return 'middle';
}

export const SEAT_KIND_LABEL = { window: 'window', aisle: 'aisle', middle: 'middle', extraLegroom: 'extra legroom' };

export function seatPrice(seatMap, label) {
  if (!label || !seatMap) return 0;
  return seatMap.fees?.[seatKind(seatMap.layout, seatMap.extraLegroomRows, label)] || 0;
}

/** Price lines for the flight page summary. travellers: [{ ageCategory, seat, meal }] */
export function flightBreakdown({ tier, travellers, seatMap, meals, taxRate, infantFee }) {
  if (!tier) return null;
  const paying = travellers.filter((t) => t.ageCategory !== 'infant').length;
  const infants = travellers.length - paying;
  const base = tier.price * paying;
  const seats = travellers.reduce((sum, t) => sum + seatPrice(seatMap, t.seat), 0);
  const mealCost = travellers.reduce((sum, t) => sum + (meals.find((m) => m.name === t.meal)?.price || 0), 0);
  const taxes = Math.round(base * taxRate);
  const infantFees = infants * infantFee;
  return { base, paying, infants, infantFees, taxes, seats, meals: mealCost, total: base + infantFees + taxes + seats + mealCost };
}

/** Price lines for a hotel rate plan: plan from the API (perRoom for the stay), rooms, nights, guests. */
export function hotelBreakdown({ plan, room, rooms, nights, breakfast, breakfastPerGuest, guests }) {
  if (!plan || nights < 1) return null;
  const base = plan.perRoom * rooms;
  const breakfastCost = breakfast && !room.breakfastIncluded ? breakfastPerGuest * guests * nights : 0;
  const taxes = room.taxesAndFees * rooms * nights;
  return { base, breakfast: breakfastCost, taxes, total: base + breakfastCost + taxes };
}

// Same rule as the server's roomFits()
export function roomFits(room, { adults, children, rooms }) {
  return room.occupancy.adults * rooms >= adults && (room.occupancy.adults + room.occupancy.children) * rooms >= adults + children;
}

// ---------- The flight party ----------

// Reads adults/children/infants from search params; `travellers` is the Phase 1 name for adults.
export function readParty(params) {
  const get = (k) => (typeof params.get === 'function' ? params.get(k) : params[k]);
  const adults = Math.min(9, Math.max(1, Number(get('adults') ?? get('travellers')) || 1));
  const children = Math.min(9 - adults, Math.max(0, Number(get('children')) || 0));
  const infants = Math.min(adults, Math.max(0, Number(get('infants')) || 0));
  return { adults, children, infants };
}

export function partyLabel({ adults, children, infants }) {
  const parts = [`${adults} adult${adults > 1 ? 's' : ''}`];
  if (children) parts.push(`${children} child${children > 1 ? 'ren' : ''}`);
  if (infants) parts.push(`${infants} infant${infants > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// One traveller slot per person: adults first, then children, then infants.
export function partySlots({ adults, children, infants }) {
  return [
    ...Array.from({ length: adults }, (_, i) => ({ ageCategory: 'adult', label: `Adult ${i + 1}` })),
    ...Array.from({ length: children }, (_, i) => ({ ageCategory: 'child', label: `Child ${i + 1}` })),
    ...Array.from({ length: infants }, (_, i) => ({ ageCategory: 'infant', label: `Infant ${i + 1}`, withAdult: i + 1 })),
  ];
}
