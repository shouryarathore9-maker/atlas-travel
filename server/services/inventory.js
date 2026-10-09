// Date-aware hotel inventory (prd.md → Hotel inventory). Every room type has a RoomInventory document:
// rooms booked per night and nights stopped by the hotel. Availability for a stay is the fewest free
// rooms on any of its nights; occupancy for a night (booked ÷ rooms) feeds the pricing engine.
import Hotel from '../models/Hotel.js';
import RoomInventory from '../models/RoomInventory.js';
import { addDays, IST_OFFSET_MS, nightsBetween, todayIstString } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';

const istDate = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** The nights of a stay: check-in up to the night before check-out. */
export function stayNights(checkIn, checkOut) {
  return Array.from({ length: Math.max(0, nightsBetween(checkIn, checkOut)) }, (_, i) => addDays(checkIn, i));
}
export const bookingNights = (b) => stayNights(istDate(b.travelDates.start), istDate(b.travelDates.end));

/** { [hotelId]: { [roomTypeName]: inventory doc } } for some hotels. */
export async function inventoryFor(hotels) {
  const docs = await RoomInventory.find({ hotelId: { $in: hotels.map((h) => h._id) } }).lean();
  const out = {};
  for (const d of docs) (out[String(d.hotelId)] ||= {})[d.roomTypeName] = d;
  return out;
}

/**
 * A room type over some nights: rooms free on the tightest night, whether any night is stopped, and the
 * occupancy (0–1) of each night before a new booking.
 */
export function roomAvailability(room, inv, nights) {
  const total = room.roomsTotal ?? inv?.total ?? 0;
  let free = total;
  let stopped = Boolean(room.salesStopped);
  const occupancy = {};
  for (const date of nights) {
    const booked = inv?.booked?.[date] || 0;
    free = Math.min(free, total - booked);
    if (inv?.stopSell?.[date]) stopped = true;
    occupancy[date] = total ? Math.min(1, booked / total) : 1;
  }
  return { free: Math.max(0, free), stopped, occupancy };
}

// Creates the document the first time a room type is booked or edited.
async function ensure(hotelId, roomTypeName, total) {
  try {
    await RoomInventory.updateOne({ hotelId, roomTypeName }, { $setOnInsert: { total, booked: {}, stopSell: {} } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err; // a parallel request created it
  }
}

const freeOn = (nights, rooms) => ({
  $expr: { $and: nights.map((d) => ({ $lte: [{ $add: [{ $ifNull: [`$booked.${d}`, 0] }, rooms] }, '$total'] })) },
  ...Object.fromEntries(nights.map((d) => [`stopSell.${d}`, { $ne: true }])),
});

/** Takes the rooms for every night of a booking at once, or throws INVENTORY_CHANGED. */
export async function reserveRooms(booking) {
  const { roomTypeName, rooms } = booking.selection;
  const nights = bookingNights(booking);
  const hotel = await Hotel.findOne({ _id: booking.itemId, 'roomTypes.name': roomTypeName }, { 'roomTypes.$': 1 }).lean();
  const room = hotel?.roomTypes?.[0];
  if (!room || room.salesStopped) throw new HttpError(409, 'Those rooms were just booked. Please choose again.', 'INVENTORY_CHANGED');
  await ensure(booking.itemId, roomTypeName, room.roomsTotal);
  const result = await RoomInventory.updateOne(
    { hotelId: booking.itemId, roomTypeName, ...freeOn(nights, rooms) },
    { $inc: Object.fromEntries(nights.map((d) => [`booked.${d}`, rooms])) },
  );
  if (!result.modifiedCount) throw new HttpError(409, 'Those rooms were just booked. Please choose again.', 'INVENTORY_CHANGED');
}

/** Gives a cancelled (or unpaid) booking's nights back. */
export async function releaseRooms(booking) {
  const { roomTypeName, rooms } = booking.selection;
  const nights = bookingNights(booking);
  if (!nights.length) return;
  await RoomInventory.updateOne({ hotelId: booking.itemId, roomTypeName }, { $inc: Object.fromEntries(nights.map((d) => [`booked.${d}`, -rooms])) });
}

/** The busiest upcoming night of a room type: { date, booked } (null if nothing is booked). */
export function peakBooked(inv, from = todayIstString()) {
  let peak = null;
  for (const [date, booked] of Object.entries(inv?.booked || {})) {
    if (date >= from && booked > 0 && (!peak || booked > peak.booked)) peak = { date, booked };
  }
  return peak;
}

/**
 * Keeps inventory in step with a hotel edit: a new room count can't go below what is already booked on
 * any upcoming night; renamed types (only possible without bookings) move their document; removed
 * ones lose it. Call before saving the hotel.
 */
export async function syncRoomTypes(hotelId, before, after) {
  const inv = (await inventoryFor([{ _id: hotelId }]))[String(hotelId)] || {};
  for (const room of after) {
    const name = room.originalName || room.name;
    const peak = peakBooked(inv[name]);
    if (peak && room.roomsTotal < peak.booked) {
      const when = new Date(`${peak.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      throw new HttpError(409, `You have ${peak.booked} “${room.name}” room${peak.booked === 1 ? '' : 's'} booked on ${when}. Cancel reservations first or keep at least ${peak.booked}.`, 'ROOMS_BOOKED');
    }
  }
  const kept = new Set(after.map((r) => r.originalName).filter(Boolean));
  return async function apply() {
    for (const name of before.map((r) => r.name).filter((n) => !kept.has(n))) await RoomInventory.deleteOne({ hotelId, roomTypeName: name });
    for (const room of after) {
      if (room.originalName && room.originalName !== room.name) await RoomInventory.updateOne({ hotelId, roomTypeName: room.originalName }, { $set: { roomTypeName: room.name } });
      await ensure(hotelId, room.name, room.roomsTotal);
      await RoomInventory.updateOne({ hotelId, roomTypeName: room.name }, { $set: { total: room.roomsTotal } });
    }
  };
}

/** Stops (or resumes) sales of some room types for a date range. Existing bookings are kept. */
export async function setStopSell(hotel, roomTypeNames, from, to, stopped) {
  const nights = stayNights(from, addDays(to, 1));
  const update = stopped
    ? { $set: Object.fromEntries(nights.map((d) => [`stopSell.${d}`, true])) }
    : { $unset: Object.fromEntries(nights.map((d) => [`stopSell.${d}`, ''])) };
  for (const name of roomTypeNames) {
    const room = hotel.roomTypes.find((r) => r.name === name);
    await ensure(hotel._id, name, room.roomsTotal);
    await RoomInventory.updateOne({ hotelId: hotel._id, roomTypeName: name }, update);
  }
  return nights.length;
}

/** Upcoming stopped nights per room type, grouped into date ranges. */
export function stoppedRanges(inv, from = todayIstString()) {
  const dates = Object.keys(inv?.stopSell || {})
    .filter((d) => d >= from && inv.stopSell[d])
    .sort();
  const ranges = [];
  for (const d of dates) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.to, 1) === d) last.to = d;
    else ranges.push({ from: d, to: d });
  }
  return ranges;
}

// Rooms booked per night per room type, from confirmed hotel bookings: { 'hotelId|room': { date: n } }.
function countNights(bookings, counts = {}) {
  for (const b of bookings) {
    if (b.type !== 'hotel' || b.status !== 'confirmed') continue;
    const map = (counts[`${b.itemId}|${b.selection.roomTypeName}`] ||= {});
    for (const d of bookingNights(b)) map[d] = (map[d] || 0) + b.selection.rooms;
  }
  return counts;
}

/** Plain RoomInventory documents for hotels and their bookings (a new demo sandbox). */
export function inventoryDocs(hotels, bookings) {
  const counts = countNights(bookings);
  return hotels.flatMap((h) => h.roomTypes.map((room) => ({ hotelId: h._id, roomTypeName: room.name, total: room.roomsTotal, booked: counts[`${h._id}|${room.name}`] || {}, stopSell: {} })));
}

/**
 * Rebuilds every room type's booked counts from confirmed hotel bookings (the one-off migration from
 * the old per-room counter, the seed and the top-up). Stop-sell marks are kept. Idempotent.
 */
export async function rebuildInventory({ Booking, hotels }) {
  const counts = {};
  const cursor = Booking.find({ type: 'hotel', status: 'confirmed', itemId: { $in: hotels.map((h) => h._id) } }, { type: 1, status: 1, itemId: 1, selection: 1, travelDates: 1 }).lean().cursor();
  const batch = [];
  for await (const b of cursor) {
    batch.push(b);
    if (batch.length >= 1000) countNights(batch.splice(0), counts);
  }
  countNights(batch, counts);
  let written = 0;
  for (const hotel of hotels) {
    for (const room of hotel.roomTypes) {
      const booked = counts[`${hotel._id}|${room.name}`] || {};
      await RoomInventory.updateOne(
        { hotelId: hotel._id, roomTypeName: room.name },
        { $set: { total: room.roomsTotal, booked }, $setOnInsert: { stopSell: {} } },
        { upsert: true },
      );
      written += 1;
    }
  }
  return written;
}
