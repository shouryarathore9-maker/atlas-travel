// Keeps the rolling flight window full (run daily by Vercel Cron; `npm run extend-flights` locally).
// Idempotent and self-healing: it fills EVERY day in the window that has no flights, so a missed
// or late run is repaired by the next one, and running it twice changes nothing.
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import { acquireLock, releaseLock } from '../models/JobLock.js';
import Review from '../models/Review.js';
import { generateFlights, generateReviews } from '../seed/generate.js';
import { addDays, DAY_MS, IST_OFFSET_MS, istMidnight, todayIstString } from '../utils/dates.js';

export const WINDOW_DAYS = Number(process.env.SEED_DAYS) || 21;
const LOCK = 'extend-flights';
const istDate = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

async function insertInChunks(Model, docs, size = 500) {
  for (let i = 0; i < docs.length; i += size) await Model.insertMany(docs.slice(i, i + size), { ordered: true });
}

export async function extendFlightWindow({ days = WINDOW_DAYS, now = Date.now() } = {}) {
  if (!(await acquireLock(LOCK, 5 * 60 * 1000, new Date(now)))) {
    return { skipped: true, reason: 'another run is in progress' };
  }
  try {
    // 1. Which days in the window already have flights? (IST calendar days)
    const today = todayIstString(now);
    const start = istMidnight(today);
    const end = istMidnight(addDays(today, days));
    const perDay = await Flight.aggregate([
      { $match: { departureTime: { $gte: start, $lt: end } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$departureTime', timezone: '+05:30' } } } },
    ]);
    const covered = new Set(perDay.map((d) => d._id));

    // 2. Generate the standard timetable and keep only the days that are missing.
    //    Existing flights, bookings and admin edits are never touched.
    const missingFlights = generateFlights({ days, now }).filter((f) => !covered.has(istDate(f.departureTime)));
    const reviews = generateReviews(missingFlights, [], { now });
    await insertInChunks(Flight, missingFlights);
    await insertInChunks(Review, reviews, 1000);

    // 3. Prune departures older than a day that nobody booked (keeps the free-tier database small).
    const booked = await Booking.distinct('itemId', { type: 'flight' });
    const stale = await Flight.find({ departureTime: { $lt: new Date(now - DAY_MS) }, _id: { $nin: booked } }, { _id: 1 }).lean();
    const staleIds = stale.map((f) => f._id);
    if (staleIds.length) {
      await Review.deleteMany({ itemType: 'flight', itemId: { $in: staleIds } });
      await Flight.deleteMany({ _id: { $in: staleIds } });
    }

    return {
      skipped: false,
      window: `${today} … ${addDays(today, days - 1)}`,
      daysFilled: [...new Set(missingFlights.map((f) => istDate(f.departureTime)))].sort(),
      flightsAdded: missingFlights.length,
      flightsPruned: staleIds.length,
    };
  } finally {
    await releaseLock(LOCK);
  }
}
