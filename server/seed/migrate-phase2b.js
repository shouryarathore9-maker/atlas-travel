// One-off, idempotent migration for per-night hotel inventory, hotel occupancy pricing and per-product
// commission (prd.md → Decisions & Defaults #33–#35). Safe to run more than once; never touches bookings
// beyond removing the retired `roomsReturned` flag. `npm run migrate:phase2b`
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import Adjustment from '../models/Adjustment.js';
import Booking from '../models/Booking.js';
import Hotel from '../models/Hotel.js';
import RoomInventory from '../models/RoomInventory.js';
import Sandbox from '../models/Sandbox.js';
import Supplier from '../models/Supplier.js';
import { ensureCommissionSchedule, INITIAL_DEFAULTS } from '../services/commission.js';
import { rebuildInventory } from '../services/inventory.js';
import { DEFAULT_HOTEL_OCCUPANCY } from '../services/pricing.js';
import { runWithContext } from '../utils/context.js';

async function migrateScope(now) {
  const out = { hotels: 0, roomTypes: 0, rateCards: 0 };
  // 1. Room counts: every room type needs roomsTotal (older ones only had the counter).
  const hotels = await Hotel.find({}).lean();
  for (const hotel of hotels) {
    let changed = false;
    const roomTypes = [];
    for (const room of hotel.roomTypes) {
      let total = room.roomsTotal;
      if (total === null || total === undefined) {
        const held = await Booking.aggregate([
          { $match: { type: 'hotel', status: 'confirmed', itemId: hotel._id, 'selection.roomTypeName': room.name, 'travelDates.end': { $gt: new Date(now) } } },
          { $group: { _id: null, n: { $sum: '$selection.rooms' } } },
        ]);
        total = (room.roomsAvailable || 0) + (held[0]?.n || 0);
        changed = true;
      }
      if ('roomsAvailable' in room) changed = true;
      const { roomsAvailable: _old, ...rest } = room;
      roomTypes.push({ ...rest, roomsTotal: total });
    }
    if (changed) {
      await Hotel.collection.updateOne({ _id: hotel._id, sandboxId: hotel.sandboxId ?? null }, { $set: { roomTypes } });
      out.hotels += 1;
    }
  }
  // 2. Rooms booked per night, rebuilt from confirmed stays.
  out.roomTypes = await rebuildInventory({ Booking, hotels: await Hotel.find({}).lean() });
  // 3. Hotel rate cards get the occupancy rule (on, with the default bands).
  const cards = await Supplier.find({ kind: 'hotel', 'rateCard.kind': 'hotel', 'rateCard.occupancy': { $exists: false } }, { rateCard: 1 }).lean();
  for (const s of cards) {
    await Supplier.updateOne({ _id: s._id }, { $set: { 'rateCard.occupancy': DEFAULT_HOTEL_OCCUPANCY }, $inc: { 'rateCard.version': 1 } });
    out.rateCards += 1;
  }
  // 4. Commission: per-product defaults from next month (the old single rate stays until then).
  out.commission = await ensureCommissionSchedule({ ...INITIAL_DEFAULTS, now });
  return out;
}

export async function migratePhase2b({ now = Date.now() } = {}) {
  const real = await runWithContext({ sandboxId: null }, () => migrateScope(now));
  // The retired daily-job flag.
  await Booking.collection.updateMany({ roomsReturned: { $exists: true } }, { $unset: { roomsReturned: '' } });
  // Demo sandboxes that are still open get the same treatment inside their own scope.
  const sandboxes = await Sandbox.find({ expiresAt: { $gt: new Date(now) } }, { _id: 1, expiresAt: 1 }).lean();
  for (const s of sandboxes) await runWithContext({ sandboxId: s._id, sandboxExpiresAt: s.expiresAt }, () => migrateScope(now));
  return { real, sandboxes: sandboxes.length, inventoryDocs: await RoomInventory.countDocuments({}) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await connectDb(process.env.MONGODB_URI);
    console.log(`Connected to "${mongoose.connection.name}"`);
    await Promise.all([RoomInventory.createIndexes(), Adjustment.createIndexes()]);
    console.log(JSON.stringify(await migratePhase2b()));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
