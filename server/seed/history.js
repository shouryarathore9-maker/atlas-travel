// Six months of synthetic booking history (prd.md → Decisions 12; architecture.md §7), so settlement
// statements and the analytics dashboard are never empty. Deterministic (seeded PRNG), every document
// flagged `isSynthetic`. Past trips never touch live inventory; bookings already made for trips in the
// next 45 days sit on seats the seeded departures count as sold and take rooms off the live counters.
export const FUTURE_DAYS = 45;
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AIRCRAFT, cabinSeats } from '../services/aircraft.js';
import { finalize, generatePnr, generateReference, generateTransactionId } from '../services/bookingService.js';
import { discountFor } from '../services/offers.js';
import { ENGINE_VERSION, FLIGHT_TAX_RATE, flightFare, hotelStay, INFANT_FEE } from '../services/pricing.js';
import { policySnapshot } from '../services/templates.js';
import { addDays, DAY_MS, istMidnight, todayIstString } from '../utils/dates.js';
import { createRng } from './generate.js';

export const HISTORY_DAYS = 183;
const FIRST = ['Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Meera', 'Arjun', 'Kavya', 'Siddharth', 'Nisha', 'Karan', 'Ishita', 'Farhan', 'Lakshmi', 'Devika', 'Kabir', 'Sana', 'Aditya', 'Neha', 'Rahul'];
const LAST = ['Sharma', 'Iyer', 'Mehta', 'Reddy', 'Banerjee', 'Kapoor', 'Nair', 'Gupta', 'Khan', 'Desai', 'Menon', 'Joshi', 'Pillai', 'Bose', 'Rao'];
const REQUESTS = {
  flight: [
    ['Window seat together for two of us, please.', 'accepted', 'Seated together in row 14.'],
    ['Travelling with an infant — a bassinet seat if possible.', 'cannot', 'The bassinet seats are taken, sorry — we’ve seated you near the front.'],
  ],
  hotel: [
    ['Late check-in around 11 pm.', 'accepted', 'Noted — the front desk will expect you.'],
    ['Could we have a cot in the room for our toddler?', 'accepted', 'A cot will be ready on arrival.'],
    ['Early check-in at 8 am if possible.', 'cannot', 'We are full the night before, sorry — luggage storage is free.'],
  ],
};export const HISTORY_EMAIL_DOMAIN = 'history.atlas.invalid';

const istDate = (date) => new Date(new Date(date).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

// The seeded offers that a booking made on `day` for this product and supplier could have used.
function offerOptions(offers, { day, product, supplierId }) {
  return offers.filter(
    (o) =>
      o.validFrom <= day &&
      o.validTo >= day &&
      (o.scope === 'both' || o.scope === `${product}s`) &&
      (o.funder === 'platform' || String(o.supplierId) === String(supplierId)) &&
      !o.firstBookingsOnly, // "first three bookings" depends on the account's history; keep it simple
  );
}

/**
 * @returns { users, bookings, payments, dailyStats, offerUse, roomChanges } — plain documents ready for insertMany.
 * Visitor demos reuse this for one supplier: a shorter window (`historyDays`, `futureDays`), a lower
 * daily `rate`, and their own `users` instead of the 80 history accounts.
 */
export function generateHistory({
  airlineSuppliers,
  hotelSuppliers,
  services,
  hotels,
  offers,
  templates,
  flights = [],
  today = todayIstString(),
  now = Date.now(),
  rng = createRng(97),
  historyDays = HISTORY_DAYS,
  futureDays = FUTURE_DAYS,
  rate = 1,
  users: givenUsers = null,
  seatsTaken = null, // Map: departure id → Set of seats already held by earlier synthetic bookings
}) {
  const departureOf = new Map(flights.map((f) => [`${f.serviceId}|${f.date}`, f]));
  const seatsUsed = new Map(seatsTaken || []); // departure id → seats given to synthetic bookings
  const roomsTaken = new Map(); // `${hotelId}|${room}` → rooms taken by upcoming synthetic stays
  const roomChanges = [];
  const supplierById = Object.fromEntries([...airlineSuppliers, ...hotelSuppliers].map((s) => [String(s._id), s]));
  const users = givenUsers || Array.from({ length: 80 }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    return {
      _id: new mongoose.Types.ObjectId(),
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${i}@${HISTORY_EMAIL_DOMAIN}`,
      role: 'traveler',
      // Unusable password: these accounts exist only to own history and can never sign in.
      passwordHash: `!synthetic-${crypto.randomBytes(16).toString('hex')}`,
    };
  });
  const bookings = [];
  const payments = [];
  const offerUse = {};
  const funnel = {};
  const popularHotels = hotels.filter((h) => h.starRating >= 4).concat(hotels); // better hotels twice as likely

  for (let back = historyDays; back >= -futureDays; back--) {
    if (back === 0) continue; // trips ending today are neither history nor clearly upcoming
    const travelDay = addDays(today, -back);
    const upcoming = back < 0;
    // A gentle upward trend, busier weekends: ~3–6 trips a day (upcoming ones only if already booked).
    const weekday = new Date(`${travelDay}T00:00:00Z`).getUTCDay();
    const expected = (3 + Math.min(HISTORY_DAYS, HISTORY_DAYS - back) / 80 + (weekday === 0 || weekday === 6 ? 1.2 : 0)) * (0.7 + rng.next() * 0.6) * rate;
    const n = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const user = rng.pick(users);
      const isFlight = !hotels.length || (services.length > 0 && rng.next() < 0.56);
      if (isFlight && !services.length) continue;
      const lead = rng.next() < 0.3 ? rng.int(0, 6) : rng.next() < 0.75 ? rng.int(7, 29) : rng.int(30, 58);
      let doc;
      if (isFlight) {
        const service = rng.pick(services);
        const supplier = supplierById[String(service.supplierId)];
        const card = supplier.rateCard;
        const startDay = travelDay; // short flights land the same day
        const departure = new Date(istMidnight(startDay).getTime() + service.departureMinute * 60000);
        const arrival = new Date(departure.getTime() + service.durationMinutes * 60000);
        if (!upcoming && arrival.getTime() >= istMidnight(today).getTime()) continue;
        const createdAt = new Date(departure.getTime() - lead * DAY_MS - rng.int(1, 20) * 3600e3);
        if (createdAt.getTime() >= now) continue; // not booked yet
        const flight = upcoming ? departureOf.get(`${service._id}|${travelDay}`) : null;
        if (upcoming && !flight) continue; // the service doesn't fly that day
        const business = AIRCRAFT[service.aircraftConfig].cabins.business && rng.next() < 0.08;
        const tierName = business ? 'Business' : rng.next() < 0.7 ? 'Saver' : 'Flexi';
        const tier = card.tiers.find((t) => t.name === tierName);
        const fare = flightFare(card, { origin: service.origin.code, destination: service.destination.code, cabin: tier.cabin, tier, departureTime: departure, now: createdAt.getTime(), load: 0.2 + rng.next() * 0.6 });
        const paying = rng.next() < 0.6 ? 1 : rng.int(2, 3);
        const infants = paying > 1 && rng.next() < 0.15 ? 1 : 0;
        let seats;
        if (flight) {
          // Upcoming: take seats the departure already counts as sold ("other passengers").
          const cabinSet = new Set(cabinSeats(service.aircraftConfig, tier.cabin));
          const used = seatsUsed.get(String(flight._id)) || new Set();
          const free = flight.seatMap.unavailableSeats.filter((s) => cabinSet.has(s) && !flight.seatMap.blockedSeats.includes(s) && !used.has(s));
          if (free.length < paying) continue;
          seats = rng.sample(free, paying);
          seats.forEach((s) => used.add(s));
          seatsUsed.set(String(flight._id), used);
        } else {
          seats = rng.sample(cabinSeats(service.aircraftConfig, tier.cabin), paying);
        }
        const seatCharges = tier.cabin === 'economy' ? seats.filter(() => rng.next() < 0.35).length * 350 : 0;
        const mealCharges = tier.cabin === 'economy' ? Array.from({ length: paying }).filter(() => rng.next() < 0.3).length * 300 : 0;
        const travellers = [
          ...seats.map((seat, i) => ({ firstName: i ? rng.pick(FIRST) : user.name.split(' ')[0], lastName: user.name.split(' ')[1], ageCategory: i && rng.next() < 0.3 ? 'child' : 'adult', seat })),
          ...Array.from({ length: infants }, () => ({ firstName: rng.pick(FIRST), lastName: user.name.split(' ')[1], ageCategory: 'infant', seat: '' })),
        ].map((t) => ({ ...t, name: `${t.firstName} ${t.lastName}`, meal: '' }));
        const baseAmount = fare.price * paying;
        const parts = { base: baseAmount, infantFees: INFANT_FEE * infants, seatCharges, mealCharges, breakfast: 0 };
        doc = {
          type: 'flight',
          supplier,
          itemId: flight ? flight._id : new mongoose.Types.ObjectId(), // a past departure has been pruned
          createdAt,
          start: departure,
          end: arrival,
          eligible: baseAmount,
          parts,
          taxes: (discount) => Math.round((baseAmount - discount) * FLIGHT_TAX_RATE),
          template: templates[tier.templateKey],
          oneNight: 0,
          extra: {
            pnr: generatePnr(),
            selection: { fareType: tier.name, cabin: tier.cabin },
            travellers,
            itemSummary: { title: `${service.origin.city} → ${service.destination.city}`, subtitle: `${service.airline} ${service.flightNumber} · ${tier.name}`, origin: service.origin.code, destination: service.destination.code },
            pricing: { engineVersion: ENGINE_VERSION, perTraveller: fare.price, cabinBase: fare.cabinBase, factors: fare.factors },
          },
        };
      } else {
        const hotel = rng.pick(popularHotels);
        const supplier = supplierById[String(hotel.supplierId)];
        const card = supplier.rateCard;
        const nights = rng.next() < 0.5 ? rng.int(1, 2) : rng.int(3, 5);
        const checkOut = travelDay;
        const checkIn = addDays(checkOut, -nights);
        const room = rng.pick(hotel.roomTypes);
        const plan = card.ratePlans[rng.next() < 0.75 ? 0 : 1];
        const createdAt = new Date(istMidnight(checkIn).getTime() - lead * DAY_MS + rng.int(8, 22) * 3600e3);
        if (createdAt.getTime() >= now) continue; // not booked yet
        const stay = hotelStay(card, { roomTypeName: room.name, checkIn, checkOut, now: createdAt.getTime(), ratePlan: plan });
        if (!stay) continue;
        const rooms = rng.next() < 0.85 ? 1 : 2;
        const roomKey = `${hotel._id}|${room.name}`;
        // Upcoming stays never take more than a third of a room type (on any night, roughly).
        if (upcoming && (roomsTaken.get(roomKey) || 0) + rooms > Math.floor(room.roomsTotal / 3)) continue;
        const guests = Math.min(room.occupancy.adults * rooms, rng.int(1, 3));
        const breakfast = !room.breakfastIncluded && rng.next() < 0.35 ? card.breakfastPerGuest * guests * nights : 0;
        const roomCharges = stay.perRoom * rooms;
        doc = {
          type: 'hotel',
          supplier,
          itemId: hotel._id,
          createdAt,
          start: istMidnight(checkIn),
          end: istMidnight(checkOut),
          eligible: roomCharges,
          parts: { base: roomCharges, infantFees: 0, seatCharges: 0, mealCharges: 0, breakfast },
          taxes: () => room.taxesAndFees * rooms * nights,
          template: templates[plan.templateKey],
          oneNight: stay.nights[0].price,
          extra: {
            selection: { roomTypeName: room.name, rooms, ratePlan: plan.key, breakfast: breakfast > 0, breakfastIncluded: room.breakfastIncluded },
            travellers: [{ firstName: user.name.split(' ')[0], lastName: user.name.split(' ')[1], name: user.name, ageCategory: 'adult' }],
            itemSummary: {
              title: hotel.name,
              subtitle: `${room.name} · ${plan.name} · ${rooms} room${rooms > 1 ? 's' : ''} · ${nights} night${nights > 1 ? 's' : ''}`,
              image: hotel.photos?.[0] || '',
              destination: hotel.city,
            },
            pricing: { engineVersion: ENGINE_VERSION, nights: stay.nights, avgNightly: stay.avgNightly, ratePlan: plan.key },
          },
          roomKey,
          rooms,
        };
      }

      // About a quarter used an offer that was live on the booking date.
      const bookedOn = istDate(doc.createdAt);
      const options = offerOptions(offers, { day: bookedOn, product: doc.type, supplierId: doc.supplier._id });
      const offer = options.length && rng.next() < 0.28 ? rng.pick(options) : null;
      const discount = offer && doc.eligible >= (offer.minSpend || 0) ? discountFor(offer, doc.eligible) : 0;
      const priced = { eligible: doc.eligible, parts: doc.parts, taxes: doc.taxes };
      const fareBreakdown = finalize(priced, discount);
      if (discount) offerUse[String(offer._id)] = (offerUse[String(offer._id)] || 0) + 1;

      // 82% travelled, 13% cancelled by the traveller (fee per the frozen terms), 5% by the supplier.
      // Upcoming trips are only ever cancelled by the traveller (the departures are still flying).
      const roll = rng.next();
      const snapshot = policySnapshot(doc.template, { start: doc.start, oneNight: doc.oneNight, total: fareBreakdown.total });
      let status = 'confirmed';
      let cancellation;
      const lastMoment = Math.min(doc.start.getTime(), now) - 3600e3;
      if (roll > 0.82 && lastMoment > doc.createdAt.getTime() && !(upcoming && roll > 0.95)) {
        status = 'cancelled';
        const cancelledAt = new Date(doc.createdAt.getTime() + rng.next() * (lastMoment - doc.createdAt.getTime()));
        if (roll > 0.95) {
          cancellation = { cancelledAt, by: 'supplier', reason: doc.type === 'flight' ? 'Operational reasons' : 'Overbooked on these dates', refundAmount: fareBreakdown.total, feeRetained: 0, refundStatus: 'simulated', redemptionRestored: Boolean(discount) };
        } else {
          const free = snapshot.freeUntil && cancelledAt < snapshot.freeUntil;
          const fee = snapshot.nonRefundable ? fareBreakdown.total : free ? 0 : Math.min(fareBreakdown.total, snapshot.feeAfterCutoff);
          cancellation = { cancelledAt, by: 'traveller', reason: 'Plans changed', refundAmount: fareBreakdown.total - fee, feeRetained: fee, refundStatus: 'simulated', redemptionRestored: false };
        }
        cancellation.receiptNo = `RF${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      }

      if (doc.type === 'hotel' && upcoming && status === 'confirmed') {
        roomsTaken.set(doc.roomKey, (roomsTaken.get(doc.roomKey) || 0) + doc.rooms);
        roomChanges.push({ hotelId: doc.itemId, roomTypeName: doc.extra.selection.roomTypeName, rooms: doc.rooms });
      }
      const _id = new mongoose.Types.ObjectId();
      const paymentId = new mongoose.Types.ObjectId();
      const special = rng.next() < 0.04 ? rng.pick(REQUESTS[doc.type]) : null;
      bookings.push({
        _id,
        userId: user._id,
        supplierId: doc.supplier._id,
        type: doc.type,
        itemId: doc.itemId,
        bookingReference: generateReference(),
        travelDates: { start: doc.start, end: doc.end },
        contact: { email: user.email, phone: '9000000000' },
        fareBreakdown,
        offer: discount ? { offerId: offer._id, code: offer.code, title: offer.title, amount: fareBreakdown.discounts, funder: offer.funder, supplierId: offer.supplierId } : null,
        policySnapshot: snapshot,
        status,
        cancellation,
        paymentId,
        createdAt: doc.createdAt,
        isSynthetic: true,
        settlement: null,
        ...(special && { specialRequest: { text: special[0], reply: { status: special[1], comment: special[2], at: new Date(doc.createdAt.getTime() + 6 * 3600e3), by: doc.supplier.name } } }),
        ...doc.extra,
      });
      payments.push({ _id: paymentId, bookingId: _id, userId: user._id, amount: fareBreakdown.total, method: rng.next() < 0.7 ? 'upi' : 'card', status: 'success', transactionId: generateTransactionId(), timestamp: doc.createdAt });
      // Roughly one payment in fifteen fails first and is retried.
      if (rng.next() < 0.07) {
        payments.push({ _id: new mongoose.Types.ObjectId(), bookingId: null, userId: user._id, amount: fareBreakdown.total, method: 'card', status: 'failed', transactionId: generateTransactionId(), timestamp: new Date(doc.createdAt.getTime() - 120e3) });
      }

      // The funnel this booking came out of (rolled-up daily summaries, as the daily job writes them).
      if (bookedOn >= today) continue; // today's funnel comes from live events
      const key = `${bookedOn}|${doc.type}`;
      funnel[key] = (funnel[key] || 0) + 1;
    }
  }

  // Daily funnel summaries: searches → views → checkout → payment attempts → confirmed, with the
  // proportions a travel site sees (about 2–3% of searches end in a booking).
  const dailyStats = [];
  for (let back = HISTORY_DAYS; back >= 1; back--) {
    const date = addDays(today, -back);
    for (const product of ['flight', 'hotel']) {
      const confirmed = funnel[`${date}|${product}`] || 0;
      const payAttempts = confirmed + Array.from({ length: confirmed }).filter(() => rng.next() < 0.09).length + (rng.next() < 0.3 ? 1 : 0);
      const checkoutStarts = Math.round(payAttempts * (1.8 + rng.next() * 0.6)) + rng.int(0, 2);
      const views = Math.round(checkoutStarts * (2.5 + rng.next())) + rng.int(2, 6);
      const searches = Math.round(views * (1.6 + rng.next() * 0.5)) + rng.int(5, 15);
      dailyStats.push({ date, product, searches, zeroResults: Math.round(searches * (0.03 + rng.next() * 0.04)), views, checkoutStarts, payAttempts, confirmed, isSynthetic: true });
    }
  }
  return { users, bookings, payments, dailyStats, offerUse, roomChanges };
}

// ---------- Settlement history (needs the database) ----------

/**
 * Closes every past month of the history in order, as the daily job would have, then marks all but
 * the latest month paid, resolves one query into an adjustment (carried to the latest statements)
 * and leaves one query open — so both consoles show every state.
 */
export async function seedSettlementHistory({ today = todayIstString(), Statement, Ticket, Adjustment, closeStatements, istPeriod, periodStart, shiftPeriod, periodLabel }) {
  const first = istPeriod(istMidnight(addDays(today, -HISTORY_DAYS)));
  const last = shiftPeriod(istPeriod(istMidnight(today)), -1);
  const close = (period, notify = false) => closeStatements({ now: periodStart(shiftPeriod(period, 1)).getTime() + 2 * 3600e3, notify, isSynthetic: true });

  let period = first;
  const created = {};
  while (period < last) {
    created[period] = (await close(period)).created;
    period = shiftPeriod(period, 1);
  }

  // A query on an earlier statement, resolved as an adjustment that lands on the latest statement.
  const earlier = await Statement.findOne({ period: shiftPeriod(last, -1), 'lines.kind': 'completed' }).sort({ 'totals.net': -1 }).lean();
  if (earlier) {
    const line = earlier.lines.find((l) => l.kind === 'completed');
    const isFlight = line.description.includes('→');
    const reason = isFlight ? 'Seat fee was refunded to the traveller at the airport desk.' : 'The late check-out charge was waived for the guest at the front desk.';
    const ticket = await Ticket.create({
      type: 'statement_query',
      bookingId: line.bookingId,
      bookingReference: line.bookingReference,
      supplierId: earlier.supplierId,
      statementId: earlier._id,
      subject: `${periodLabel(earlier.period)} statement · ${line.bookingReference}`,
      status: 'resolved',
      resolution: { kind: 'adjustment', amount: 450, note: reason },
      messages: [
        { authorRole: 'supplier', authorName: 'Manager', body: isFlight ? 'We refunded one seat fee to this traveller at the desk — please adjust.' : 'We waived the late check-out charge for this guest — please adjust.', at: new Date(earlier.createdAt.getTime() + 2 * DAY_MS) },
        { authorRole: 'admin', authorName: 'Atlas support', body: `Adjustment of ₹450 on your next statement: ${reason}`, at: new Date(earlier.createdAt.getTime() + 3 * DAY_MS) },
      ],
      createdAt: new Date(earlier.createdAt.getTime() + 2 * DAY_MS),
      updatedAt: new Date(earlier.createdAt.getTime() + 3 * DAY_MS),
      closedAt: new Date(earlier.createdAt.getTime() + 3 * DAY_MS),
    });
    await Adjustment.create({ supplierId: earlier.supplierId, amount: 450, note: reason, ticketId: ticket._id, bookingReference: line.bookingReference, fromStatementId: earlier._id, isSynthetic: true, createdAt: new Date(earlier.createdAt.getTime() + 3 * DAY_MS) });
  }
  created[last] = (await close(last, true)).created;

  // Everything before the latest month has been paid out (simulated references).
  const unpaid = await Statement.find({ period: { $lt: last } }, { _id: 1, period: 1, createdAt: 1 }).sort({ period: 1 }).lean();
  let n = 0;
  for (const s of unpaid) {
    n += 1;
    await Statement.updateOne(
      { _id: s._id },
      { $set: { status: 'paid', paidAt: new Date(s.createdAt.getTime() + 6 * DAY_MS), paymentRef: `ATLPAY-${s.period.replace('-', '')}-${String(n).padStart(3, '0')}`, paidBy: 'Atlas Admin' } },
    );
  }

  // One open query on a latest hotel statement.
  const latest = await Statement.find({ period: last, 'lines.kind': 'completed' }).sort({ 'totals.lines': -1 }).limit(10).lean();
  const target = latest.find((s) => s.lines.some((l) => l.description?.includes('night'))) || latest[0];
  if (target) {
    const line = target.lines.find((l) => l.kind === 'completed');
    await Ticket.create({
      type: 'statement_query',
      bookingId: line.bookingId,
      bookingReference: line.bookingReference,
      supplierId: target.supplierId,
      statementId: target._id,
      subject: `${periodLabel(target.period)} statement · ${line.bookingReference}`,
      messages: [{ authorRole: 'supplier', authorName: 'Manager', body: 'The guest added breakfast at the desk, so the breakfast on this line was charged twice. Could you check?' }],
    });
  }
  return { periods: Object.keys(created).length, statements: Object.values(created).reduce((a, b) => a + b, 0) };
}
