// Makes sure every real supplier account has something on each console page (prd.md → Seed data):
// upcoming bookings, a few recent trips, a special request waiting for a reply and an answered one,
// and an offer of its own. The seeded six-month history spreads ~900 bookings over 52 suppliers, so
// some hotels end up with only a handful. Adds data only where something is missing (safe to re-run;
// never deletes or changes real bookings). Runs at the end of `npm run seed`, or alone:
// `npm run top-up` (server folder).
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Offer from '../models/Offer.js';
import Payment from '../models/Payment.js';
import Service from '../models/Service.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import { DEFAULT_TEMPLATES, loadTemplates } from '../services/templates.js';
import { addDays, nightsBetween, todayIstString } from '../utils/dates.js';
import { runWithContext } from '../utils/context.js';
import { createRng } from './generate.js';
import { generateHistory, HISTORY_EMAIL_DOMAIN } from './history.js';

export const MINIMUMS = { upcoming: 4, recent: 25 }; // confirmed upcoming trips; bookings made in the last 60 days

const REQUESTS = {
  flight: { open: 'Travelling with my grandmother — could we sit together near the front?', answered: ['Could you note a wheelchair at the gate, please?', 'Arranged — staff will meet you at the gate.'] },
  hotel: { open: 'Could we have a quiet room away from the lift?', answered: ['We arrive around midnight — please hold the room.', 'Noted — your room is held for late arrival.'] },
};
const OFFER_ART = { airline: '/images/seed/offers/wing-sunset.jpg', hotel: '/images/seed/offers/breakfast-tray.jpg' };

export async function topUpSuppliers({ now = Date.now(), log = () => {} } = {}) {
  // Real data only, whatever context this is called from.
  return runWithContext({ sandboxId: null }, async () => {
    const today = todayIstString(now);
    const users = await User.find({ email: new RegExp(`@${HISTORY_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`) }).lean();
    if (!users.length) return { skipped: 'no synthetic history accounts — run the seed first' };
    const templatesByKey = { ...Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.key, t])), ...(await loadTemplates()) };
    const offers = await Offer.find({ status: 'active' }).lean();
    const suppliers = await Supplier.find({}).lean();
    const summary = { bookings: 0, requests: 0, offers: 0, suppliers: 0 };
    let seed = 1;

    for (const supplier of suppliers) {
      const nowDate = new Date(now);
      const upcoming = await Booking.countDocuments({ supplierId: supplier._id, status: 'confirmed', 'travelDates.end': { $gt: nowDate } });
      const recent = await Booking.countDocuments({ supplierId: supplier._id, createdAt: { $gte: new Date(now - 60 * 864e5) } });
      let added = 0;

      // Small hotels can't always reach the upcoming minimum (rooms run out), so only a shortage of
      // recent bookings triggers a top-up — that keeps re-runs from piling on more.
      if (recent < MINIMUMS.recent || (upcoming < MINIMUMS.upcoming && recent < MINIMUMS.recent * 2)) {
        const isAirline = supplier.kind === 'airline';
        const services = isAirline ? await Service.find({ supplierId: supplier._id, status: 'active' }).lean() : [];
        const flights = isAirline ? await Flight.find({ supplierId: supplier._id, status: 'scheduled', departureTime: { $gt: nowDate } }).lean() : [];
        const hotel = isAirline ? null : await Hotel.findById(supplier.hotelId).lean();
        // Seats already held by synthetic bookings stay theirs.
        const seatsTaken = new Map();
        if (flights.length) {
          const held = await Booking.find({ itemId: { $in: flights.map((f) => f._id) } }, { itemId: 1, travellers: 1 }).lean();
          for (const b of held) {
            const set = seatsTaken.get(String(b.itemId)) || new Set();
            b.travellers.forEach((t) => t.seat && set.add(t.seat));
            seatsTaken.set(String(b.itemId), set);
          }
        }
        // Trips that ended earlier this month (they settle on next month's statement, like any trip),
        // plus bookings already made for the coming weeks.
        const sinceMonthStart = nightsBetween(`${today.slice(0, 7)}-01`, today);
        const result = generateHistory({
          airlineSuppliers: isAirline ? [supplier] : [],
          hotelSuppliers: isAirline ? [] : [supplier],
          services,
          hotels: hotel ? [hotel] : [],
          offers,
          templates: templatesByKey,
          flights,
          today,
          now,
          rng: createRng(1000 + seed++),
          users,
          seatsTaken,
          historyDays: Math.max(0, sinceMonthStart),
          futureDays: 30,
          rate: isAirline ? 0.25 : 0.45,
        });

        // Upcoming stays only where rooms are really free (never below one room left).
        let { bookings } = result;
        if (hotel) {
          const free = Object.fromEntries(hotel.roomTypes.map((r) => [r.name, r.roomsAvailable]));
          bookings = bookings.filter((b) => {
            if (b.status !== 'confirmed' || b.roomsReturned) return true;
            const name = b.selection.roomTypeName;
            if (free[name] - b.selection.rooms < 1) return false;
            free[name] -= b.selection.rooms;
            return true;
          });
          for (const room of hotel.roomTypes) {
            const taken = room.roomsAvailable - free[room.name];
            if (taken > 0) await Hotel.updateOne({ _id: hotel._id }, { $inc: { 'roomTypes.$[r].roomsAvailable': -taken } }, { arrayFilters: [{ 'r.name': room.name }] });
          }
        }
        const kept = new Set(bookings.map((b) => String(b.paymentId)));
        if (bookings.length) {
          await Booking.insertMany(bookings, { ordered: false, timestamps: false });
          await Payment.insertMany(result.payments.filter((p) => !p.bookingId || kept.has(String(p._id))), { ordered: false });
          for (const [offerId, used] of Object.entries(result.offerUse)) await Offer.updateOne({ _id: offerId, status: 'active' }, { $inc: { redemptions: used } });
        }
        added = bookings.length;
        summary.bookings += added;
      }

      // A special request waiting for a reply, and an answered one.
      const kind = supplier.kind === 'airline' ? 'flight' : 'hotel';
      const hasOpen = await Booking.exists({ supplierId: supplier._id, status: 'confirmed', 'travelDates.end': { $gt: nowDate }, 'specialRequest.text': { $exists: true }, 'specialRequest.reply.status': { $exists: false } });
      if (!hasOpen) {
        const b = await Booking.findOne({ supplierId: supplier._id, isSynthetic: true, status: 'confirmed', 'travelDates.start': { $gt: nowDate }, 'specialRequest.text': { $exists: false } }).sort({ 'travelDates.start': 1 });
        if (b) {
          await Booking.updateOne({ _id: b._id }, { $set: { specialRequest: { text: REQUESTS[kind].open } } });
          summary.requests += 1;
        }
      }
      const hasAnswered = await Booking.exists({ supplierId: supplier._id, 'specialRequest.reply.status': { $exists: true } });
      if (!hasAnswered) {
        const b = await Booking.findOne({ supplierId: supplier._id, isSynthetic: true, status: 'confirmed', 'specialRequest.text': { $exists: false } }).sort({ createdAt: -1 });
        if (b) {
          const [text, comment] = REQUESTS[kind].answered;
          await Booking.updateOne({ _id: b._id }, { $set: { specialRequest: { text, reply: { status: 'accepted', comment, at: new Date(b.createdAt.getTime() + 5 * 3600e3), by: supplier.name } } } });
          summary.requests += 1;
        }
      }

      // An offer of its own, paused, so the Offers page shows one to edit or resume without adding
      // 52 live deals to the public Offers page.
      if (!(await Offer.exists({ supplierId: supplier._id }))) {
        const isAirline = supplier.kind === 'airline';
        await Offer.create({
          slug: `${supplier.slug}-weekday-saver`,
          code: isAirline ? `${(supplier.code || 'AIR').replace(/[^A-Z0-9]/g, '')}SAVER` : null,
          auto: !isAirline,
          title: `${supplier.name} weekday saver`,
          summary: isAirline ? '5% off, up to ₹600' : '10% off stays of two nights or more, up to ₹1,500',
          description: `Funded by ${supplier.name}.`,
          image: OFFER_ART[supplier.kind],
          funder: 'supplier',
          supplierId: supplier._id,
          supplierName: supplier.name,
          scope: isAirline ? 'flights' : 'hotels',
          discountType: 'percent',
          value: isAirline ? 5 : 10,
          maxDiscount: isAirline ? 600 : 1500,
          minSpend: isAirline ? 2500 : 4000,
          validFrom: today,
          validTo: addDays(today, 60),
          status: 'paused',
        });
        summary.offers += 1;
      }
      if (added) summary.suppliers += 1;
      log(`${supplier.name}: +${added} bookings`);
    }
    return summary;
  });
}

// `npm run top-up`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await connectDb(process.env.MONGODB_URI);
    console.log(`Connected to "${mongoose.connection.name}"`);
    console.log(JSON.stringify(await topUpSuppliers()));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
