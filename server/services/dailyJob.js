// The daily maintenance job (prd.md → Workflow 35): one Vercel Cron call a day runs every scheduled
// step in order. Each step is idempotent and repairs a missed day by itself; the run stops starting
// new steps when the function's time budget is nearly used, and the next run picks up the rest.
import Booking from '../models/Booking.js';
import Hotel from '../models/Hotel.js';
import { acquireLock, releaseLock } from '../models/JobLock.js';
import { sweepUnusedPhotos } from '../controllers/photoController.js';
import { trimNotifications } from './notify.js';
import { closeStatements } from './settlement.js';
import { sweepSandboxes } from './sandbox.js';
import { runWithContext } from '../utils/context.js';
import { rollUpEvents } from './analytics.js';
import { expireOffers } from './offers.js';
import { closeRescheduleWindows, resumeCancellations } from './supplierCancellation.js';
import { materialiseDepartures, pruneDepartures, WINDOW_DAYS } from './schedule.js';

const LOCK = 'daily-job';
const BUDGET_MS = 240 * 1000; // Vercel Hobby functions stop at 300 s
export const MAX_NEW_DAYS_PER_RUN = 10;

// Hotel rooms are a simple counter (architecture.md → Deviations #6): give rooms back once a
// stay's check-out has passed. Each booking is claimed first, so rooms are returned exactly once.
export async function returnHotelRooms({ now = Date.now(), limit = 500 } = {}) {
  const due = await Booking.find(
    { type: 'hotel', status: 'confirmed', roomsReturned: { $ne: true }, 'travelDates.end': { $lte: new Date(now) } },
    { _id: 1 },
  )
    .limit(limit)
    .lean();
  let returned = 0;
  for (const { _id } of due) {
    const booking = await Booking.findOneAndUpdate({ _id, roomsReturned: { $ne: true } }, { $set: { roomsReturned: true } }).lean();
    if (!booking) continue; // another run got it
    await Hotel.updateOne(
      { _id: booking.itemId },
      { $inc: { 'roomTypes.$[room].roomsAvailable': booking.selection.rooms } },
      { arrayFilters: [{ 'room.name': booking.selection.roomTypeName }] },
    );
    returned += 1;
  }
  return returned;
}

export const STEPS = [
  ['departures', ({ now }) => materialiseDepartures({ days: WINDOW_DAYS, now, maxNewDays: MAX_NEW_DAYS_PER_RUN })],
  ['prune', ({ now }) => pruneDepartures({ now })],
  ['hotelRooms', ({ now }) => returnHotelRooms({ now })],
  ['offers', ({ now }) => expireOffers({ now })],
  ['cancellations', () => resumeCancellations()],
  ['statements', ({ now }) => closeStatements({ now })],
  ['rescheduleWindows', ({ now }) => closeRescheduleWindows({ now })],
  ['notifications', () => trimNotifications()],
  ['funnel', ({ now }) => rollUpEvents({ now })],
  ['unusedPhotos', ({ now }) => sweepUnusedPhotos({ now })],
  // The only step that works across sandboxes: it deletes ended ones (see below).
  ['sandboxes', ({ now }) => sweepSandboxes({ now })],
];

export async function runDailyJob({ now = Date.now(), budgetMs = BUDGET_MS } = {}) {
  const startedAt = Date.now();
  if (!(await acquireLock(LOCK, budgetMs + 60 * 1000, new Date(now)))) {
    return { skipped: true, reason: 'another run is in progress' };
  }
  const results = {};
  try {
    for (const [name, step] of STEPS) {
      if (Date.now() - startedAt > budgetMs) {
        results[name] = 'deferred to the next run';
        continue;
      }
      // Every step except the sweep sees real data only — a sandbox's copied services must never
      // grow real departures, close real statements or return real rooms.
      results[name] = name === 'sandboxes' ? await step({ now }) : await runWithContext({ sandboxId: null }, () => step({ now }));
    }
    return { skipped: false, results };
  } finally {
    await releaseLock(LOCK);
  }
}
