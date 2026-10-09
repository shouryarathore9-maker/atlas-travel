// Commission (prd.md → Settlement → Commission): one default rate per product (all airlines, all
// hotels) plus an optional per-supplier override, where "no override" means "use the default".
// Every change is scheduled from the 1st of the next IST month, so a month's statement always uses a
// rate that was decided before the month began, and frozen statements never change.
//
// Schedules are lists of { from: 'YYYY-MM', rate } sorted by `from`; the entry in force for a month is
// the last one starting on or before it. Product defaults live in Config 'commission'
// ({ flight: [...], hotel: [...] }); overrides live on the supplier (`commissionOverrides`, where a
// `rate` of null switches back to the default).
import Config, { DEFAULT_COMMISSION_RATE } from '../models/Config.js';
import { istPeriod, periodLabel, periodStart, shiftPeriod } from '../utils/periods.js';

export const COMMISSION_LIMITS = { min: 0, max: 0.3 };
export const PRODUCT_OF = { airline: 'flight', hotel: 'hotel' };
const EPOCH = '2000-01';

/** The entry in force for `period` (undefined when the list starts later or is empty). */
export function entryAt(list = [], period) {
  let found;
  for (const e of list) if (e.from <= period && (!found || e.from >= found.from)) found = e;
  return found;
}

export async function getCommissionSchedule() {
  const [doc, legacy] = await Promise.all([Config.findOne({ key: 'commission' }).lean(), Config.findOne({ key: 'commissionRate' }).lean()]);
  if (doc) return doc.value;
  // Before the per-product schedule existed there was one platform rate.
  const rate = legacy ? Number(legacy.value) : DEFAULT_COMMISSION_RATE;
  return { flight: [{ from: EPOCH, rate }], hotel: [{ from: EPOCH, rate }] };
}

/** The rate a supplier is charged for `period`, and whether it's their own or the product default. */
export function rateFor(schedule, supplier, period) {
  const override = entryAt(supplier?.commissionOverrides, period);
  if (override && override.rate !== null && override.rate !== undefined) return { rate: override.rate, source: 'override' };
  const product = PRODUCT_OF[supplier?.kind] || 'flight';
  return { rate: entryAt(schedule[product], period)?.rate ?? DEFAULT_COMMISSION_RATE, source: 'default' };
}

/** This month's rate, and next month's when it differs (shown as "12% from 1 Nov 2026"). */
export function commissionView(schedule, supplier, now = Date.now()) {
  const period = istPeriod(now);
  const next = shiftPeriod(period, 1);
  const current = rateFor(schedule, supplier, period);
  const upcoming = rateFor(schedule, supplier, next);
  return {
    current,
    upcoming: upcoming.rate !== current.rate || upcoming.source !== current.source ? { ...upcoming, from: next, label: periodLabel(next), startsAt: periodStart(next) } : null,
  };
}

/** The product default for this month and next. */
export function defaultView(schedule, product, now = Date.now()) {
  const period = istPeriod(now);
  const next = shiftPeriod(period, 1);
  const current = entryAt(schedule[product], period)?.rate ?? DEFAULT_COMMISSION_RATE;
  const upcoming = entryAt(schedule[product], next)?.rate ?? current;
  return { current, upcoming: upcoming !== current ? { rate: upcoming, from: next, label: periodLabel(next), startsAt: periodStart(next) } : null };
}

/**
 * Schedules `value` from next month: anything already scheduled for later is replaced, and if the
 * value equals this month's, the schedule simply stays as it is (which also cancels a pending change).
 */
export function scheduleChange(list = [], value, now = Date.now()) {
  const period = istPeriod(now);
  const next = shiftPeriod(period, 1);
  const kept = list.filter((e) => e.from < next);
  const inForce = entryAt(kept, period);
  const same = inForce ? inForce.rate === value : value === null;
  return same ? kept : [...kept, { from: next, rate: value }];
}

/**
 * First-time setup (seed and the one-off migration): turns the single legacy rate into per-product
 * schedules — the legacy rate stays in force until the end of this month, the new defaults apply from
 * the 1st of next month. Does nothing if the schedule already exists.
 */
export async function ensureCommissionSchedule({ flight, hotel, now = Date.now() }) {
  if (await Config.exists({ key: 'commission' })) return false;
  const legacy = await getCommissionSchedule();
  const value = {
    flight: scheduleChange(legacy.flight, flight, now),
    hotel: scheduleChange(legacy.hotel, hotel, now),
  };
  await Config.updateOne({ key: 'commission' }, { $setOnInsert: { value, updatedAt: new Date(now) } }, { upsert: true });
  return true;
}

export const INITIAL_DEFAULTS = { flight: 0.05, hotel: 0.15 };
