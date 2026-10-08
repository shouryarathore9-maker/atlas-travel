// Turns recurring services into dated departures inside the booking window (60 days by default).
// Idempotent: a departure is unique per (service, date), existing departures are never touched,
// and a missed day is filled by the next run.
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Service from '../models/Service.js';
import Supplier from '../models/Supplier.js';
import { departureFor, operatesOn } from '../seed/generate.js';
import { addDays, DAY_MS, todayIstString } from '../utils/dates.js';

export const WINDOW_DAYS = Number(process.env.SEED_DAYS) || 60;

async function insertIgnoringDuplicates(docs) {
  for (let i = 0; i < docs.length; i += 500) {
    try {
      await Flight.insertMany(docs.slice(i, i + 500), { ordered: false });
    } catch (err) {
      // A concurrent run inserted some of the same (service, date) pairs — that's fine.
      const errors = err.writeErrors || [];
      const onlyDuplicates = errors.length ? errors.every((e) => (e.code ?? e.err?.code) === 11000) : err.code === 11000;
      if (!onlyDuplicates) throw err;
    }
  }
}

/**
 * Creates missing departures for active services.
 * @param maxNewDays cap on how many distinct dates get new departures in one run, so the first
 *                   catch-up after a long gap never bursts past the database's operations limit.
 * @param serviceIds limit the run to these services (after a service is added or edited).
 */
export async function materialiseDepartures({ days = WINDOW_DAYS, now = Date.now(), maxNewDays = Infinity, serviceIds } = {}) {
  const today = todayIstString(now);
  const last = addDays(today, days - 1);
  const services = await Service.find({ status: 'active', ...(serviceIds && { _id: { $in: serviceIds } }) }).lean();
  if (!services.length) return { daysFilled: [], flightsAdded: 0 };

  const existing = await Flight.find(
    { serviceId: { $in: services.map((s) => s._id) }, date: { $gte: today, $lte: last } },
    { serviceId: 1, date: 1 },
  ).lean();
  const have = new Set(existing.map((f) => `${f.serviceId}|${f.date}`));
  const suppliers = await Supplier.find({ _id: { $in: [...new Set(services.map((s) => String(s.supplierId)))] } }, { policies: 1 }).lean();
  const blockedBySupplier = Object.fromEntries(suppliers.map((s) => [String(s._id), s.policies?.blockedSeats || {}]));
  const blockedFor = (service) => blockedBySupplier[String(service.supplierId)]?.[service.aircraftConfig] || [];

  const docs = [];
  const daysFilled = [];
  for (let day = 0; day < days && daysFilled.length < maxNewDays; day++) {
    const dateStr = addDays(today, day);
    let added = false;
    for (const service of services) {
      if (have.has(`${service._id}|${dateStr}`) || !operatesOn(service, dateStr)) continue;
      const flight = departureFor(service, dateStr, { now, blocked: blockedFor(service) });
      if (!flight) continue;
      docs.push(flight);
      added = true;
    }
    if (added) daysFilled.push(dateStr);
  }
  await insertIgnoringDuplicates(docs);
  return { daysFilled, flightsAdded: docs.length };
}

// Departures that left more than a day ago and that nobody booked are deleted to keep the
// free-tier database small. Booked departures stay (bookings, statements and analytics need them).
export async function pruneDepartures({ now = Date.now() } = {}) {
  const stale = await Flight.find({ departureTime: { $lt: new Date(now - DAY_MS) } }, { _id: 1 }).lean();
  if (!stale.length) return 0;
  const booked = new Set((await Booking.distinct('itemId', { type: 'flight', itemId: { $in: stale.map((f) => f._id) } })).map(String));
  const ids = stale.map((f) => f._id).filter((id) => !booked.has(String(id)));
  if (ids.length) await Flight.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

// After a service is edited: future departures nobody has booked are rebuilt from the new
// details; booked departures keep their times (the manager reschedules those one by one).
// Returns the booked future departures that still follow the old details.
export async function rebuildServiceDepartures(serviceId, { now = Date.now() } = {}) {
  const future = await Flight.find({ serviceId, departureTime: { $gt: new Date(now) } }, { _id: 1, date: 1, departureTime: 1 }).lean();
  const booked = new Set(
    (await Booking.distinct('itemId', { type: 'flight', itemId: { $in: future.map((f) => f._id) } })).map(String),
  );
  const unbooked = future.filter((f) => !booked.has(String(f._id))).map((f) => f._id);
  if (unbooked.length) await Flight.deleteMany({ _id: { $in: unbooked } });
  const result = await materialiseDepartures({ now, serviceIds: [serviceId] });
  return { ...result, keptBooked: future.filter((f) => booked.has(String(f._id))) };
}
