// Prices a draft booking end to end — engine price, offer, taxes, frozen terms — exactly as payment
// will. The checkout's review step shows this quote; payment re-runs it and refuses to charge if the
// total moved (prd.md → Checkout → Price changed).
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Supplier from '../models/Supplier.js';
import { istMidnight } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { finalize, priceFlight, priceHotel } from './bookingService.js';
import { inventoryFor } from './inventory.js';
import { chooseOffer } from './offers.js';
import { getPricingLimits } from './pricingLimits.js';
import { isSuspended } from './suppliers.js';
import { loadTemplates, policySnapshot } from './templates.js';

async function load(Model, id, what) {
  const doc = await Model.findById(id).lean();
  if (!doc) throw new HttpError(404, `We could not find that ${what}.`, 'NOT_FOUND');
  const supplier = doc.supplierId ? await Supplier.findById(doc.supplierId).lean() : null;
  if (!supplier?.rateCard?.kind || isSuspended(supplier)) throw new HttpError(409, `This ${what} isn’t on sale right now.`, 'NOT_ON_SALE');
  return [doc, supplier];
}

const fullName = (p) => `${p.firstName} ${p.lastName}`.replace(/\s+/g, ' ').trim();

export async function quoteBooking(input, { userId, offerCode, now = Date.now() } = {}) {
  const [templates, limits] = await Promise.all([loadTemplates(), getPricingLimits()]);
  let priced;
  let draft;
  if (input.type === 'flight') {
    const [flight, supplier] = await load(Flight, input.itemId, 'flight');
    priced = priceFlight(flight, supplier, input, { templates, now, limits });
    draft = {
      type: 'flight',
      itemId: flight._id,
      supplierId: flight.supplierId,
      selection: { fareType: input.fareType, cabin: priced.cabin },
      travelDates: { start: flight.departureTime, end: flight.arrivalTime },
      travellers: input.travellers.map((t) => ({ ...t, name: fullName(t), seat: t.seat || '', meal: t.meal || '' })),
      itemSummary: {
        title: `${flight.origin.city} → ${flight.destination.city}`,
        subtitle: `${flight.airline} ${flight.flightNumber} · ${input.fareType}`,
        origin: flight.origin.code,
        destination: flight.destination.code,
      },
      airlineCode: supplier.code,
    };
  } else {
    const [hotel, supplier] = await load(Hotel, input.itemId, 'hotel');
    const inventory = (await inventoryFor([hotel]))[String(hotel._id)] || {};
    priced = priceHotel(hotel, supplier, input, { templates, now, limits, inventory });
    draft = {
      type: 'hotel',
      itemId: hotel._id,
      supplierId: hotel.supplierId,
      selection: { roomTypeName: input.roomTypeName, rooms: input.rooms, ratePlan: priced.plan.key, breakfast: priced.breakfastAdded, breakfastIncluded: priced.room.breakfastIncluded },
      travelDates: { start: istMidnight(input.checkIn), end: istMidnight(input.checkOut) },
      travellers: input.guests.map((g) => ({ ...g, name: fullName(g), ageCategory: 'adult' })),
      itemSummary: {
        title: hotel.name,
        subtitle: `${input.roomTypeName} · ${priced.plan.name} · ${input.rooms} room${input.rooms > 1 ? 's' : ''} · ${priced.nights} night${priced.nights > 1 ? 's' : ''}`,
        image: hotel.photos?.[0] || '',
        destination: hotel.city,
      },
    };
  }

  const { applied, codeError } = await chooseOffer({
    code: offerCode,
    product: input.type,
    supplierId: draft.supplierId,
    eligible: priced.eligible,
    userId,
    now,
  });
  const fareBreakdown = finalize(priced, applied?.amount || 0);
  return {
    draft: {
      ...draft,
      fareBreakdown,
      offer: applied ? { offerId: applied.offerId, code: applied.code, title: applied.title, amount: fareBreakdown.discounts, funder: applied.funder, supplierId: applied.supplierId } : null,
      pricing: priced.pricing,
      policySnapshot: policySnapshot(priced.template, { start: priced.policyStart, oneNight: priced.oneNight, total: fareBreakdown.total }),
    },
    offer: applied,
    codeError,
  };
}

// What the client shows on the review step.
export function quoteView({ draft, offer, codeError }) {
  return {
    fareBreakdown: draft.fareBreakdown,
    offer: offer ? { ...offer, amount: draft.fareBreakdown.discounts } : null,
    codeError,
    policy: { terms: draft.policySnapshot.terms, freeUntil: draft.policySnapshot.freeUntil, nonRefundable: draft.policySnapshot.nonRefundable },
    pricing: draft.pricing,
    itemSummary: draft.itemSummary,
  };
}
