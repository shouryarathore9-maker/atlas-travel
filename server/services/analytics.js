// The admin analytics dashboard (prd.md → Workflow 12; story #38). Everything is computed from bounded,
// indexed reads — bookings created in the period and the previous period of the same length (≤ 2 × 180
// days), payments, departures, hotels and the daily funnel summaries — then summarised here.
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import { getCommissionRate } from '../models/Config.js';
import DailyStat from '../models/DailyStat.js';
import Event from '../models/Event.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Payment from '../models/Payment.js';
import Statement from '../models/Statement.js';
import Supplier from '../models/Supplier.js';
import { CITIES } from '../seed/data.js';
import { currentContext } from '../utils/context.js';
import { addDays, DAY_MS, istMidnight, todayIstString } from '../utils/dates.js';
import { bookingLine } from './settlement.js';

const cityOf = Object.fromEntries(CITIES.map((c) => [c.code, c.city]));
const LEAD_BANDS = [
  { label: '0–7 days', from: 0, to: 7 },
  { label: '8–30 days', from: 8, to: 30 },
  { label: '31–60 days', from: 31, to: 60 },
  { label: '61+ days', from: 61, to: Infinity },
];

const istDay = (date) => new Date(new Date(date).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const gross = (b) => (b.fareBreakdown?.total || 0) + (b.fareBreakdown?.discounts || 0);
const ratio = (a, b) => (b ? a / b : 0);
const leadDays = (b) => Math.max(0, Math.floor((new Date(b.travelDates.start) - new Date(b.createdAt)) / DAY_MS));

/** The IST date range [from, to] (inclusive) and the previous period of the same length. */
export function periods({ from, to }) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  return {
    days,
    current: { from, to, start: istMidnight(from), end: istMidnight(addDays(to, 1)) },
    previous: { from: addDays(from, -days), to: addDays(from, -1), start: istMidnight(addDays(from, -days)), end: istMidnight(from) },
  };
}

const PROJECTION = {
  type: 1,
  supplierId: 1,
  status: 1,
  createdAt: 1,
  travelDates: 1,
  fareBreakdown: 1,
  offer: 1,
  cancellation: 1,
  settlement: 1,
  itemSummary: 1,
  selection: 1,
  itemId: 1,
  bookingReference: 1,
};

// Commission exactly as on statements: the statement's stored rate, or today's rate if not settled yet.
async function commissionFor(bookings) {
  const statementIds = [...new Set(bookings.map((b) => b.settlement?.statementId).filter(Boolean).map(String))];
  const [statements, current] = await Promise.all([Statement.find({ _id: { $in: statementIds } }, { commissionRate: 1 }).lean(), getCommissionRate()]);
  const rateOf = Object.fromEntries(statements.map((s) => [String(s._id), s.commissionRate]));
  return (b) => bookingLine(b, rateOf[String(b.settlement?.statementId)] ?? current)?.commission || 0;
}

function kpisFor(created, earned, commission) {
  const bookings = created.length;
  const gbv = created.reduce((s, b) => s + gross(b), 0);
  const completed = earned.filter((b) => b.status === 'confirmed');
  const net = earned.reduce((s, b) => s + commission(b), 0);
  const completedGross = completed.reduce((s, b) => s + gross(b), 0);
  return { bookings, gbv, netRevenue: net, takeRate: ratio(net, completedGross), avgBookingValue: ratio(gbv, bookings) };
}

// Bookings that earn revenue in a range: trips that ended in it, and fee-keeping cancellations made in it.
const earnedFilter = (start, end) => ({
  $or: [
    { status: 'confirmed', 'travelDates.end': { $gte: start, $lt: end } },
    { status: 'cancelled', 'cancellation.by': 'traveller', 'cancellation.feeRetained': { $gt: 0 }, 'cancellation.cancelledAt': { $gte: start, $lt: end } },
  ],
});

function bucketsFor({ from, to }, days) {
  const size = days <= 31 ? 1 : 7; // daily up to a month, weekly beyond
  const buckets = [];
  for (let d = from; d <= to; d = addDays(d, size)) buckets.push({ start: d, label: d });
  return { size, buckets };
}

function topBy(items, keyOf, labelOf = (k) => k, limit = 8) {
  const map = new Map();
  for (const b of items) {
    const key = keyOf(b);
    if (!key) continue;
    const row = map.get(key) || { key, label: labelOf(key, b), gbv: 0, bookings: 0 };
    row.gbv += gross(b);
    row.bookings += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.gbv - a.gbv).slice(0, limit);
}

async function funnelFor({ from, to }, product) {
  const products = product ? [product] : ['flight', 'hotel'];
  const stats = await DailyStat.find({ date: { $gte: from, $lte: to }, product: { $in: products } }).lean();
  const covered = new Set(stats.map((s) => `${s.date}|${s.product}`));
  // Days not rolled up yet (today, or yesterday before the daily job) come straight from the events.
  const live = await Event.aggregate([
    { $match: { at: { $gte: istMidnight(from), $lt: istMidnight(addDays(to, 1)) }, product: { $in: products } } },
    { $group: { _id: { day: { $dateToString: { date: '$at', format: '%Y-%m-%d', timezone: '+05:30' } }, product: '$product', type: '$type' }, n: { $sum: 1 }, zero: { $sum: { $cond: ['$zeroResults', 1, 0] } } } },
  ]);
  const total = { searches: 0, zeroResults: 0, views: 0, checkoutStarts: 0, payAttempts: 0, confirmed: 0 };
  for (const s of stats) for (const k of Object.keys(total)) total[k] += s[k] || 0;
  const field = { search: 'searches', view: 'views', checkout_start: 'checkoutStarts', pay_attempt: 'payAttempts', confirmed: 'confirmed' };
  for (const e of live) {
    if (covered.has(`${e._id.day}|${e._id.product}`)) continue;
    total[field[e._id.type]] += e.n;
    if (e._id.type === 'search') total.zeroResults += e.zero;
  }
  return total;
}

export async function analytics({ from, to, product, supplierId: id }) {
  const p = periods({ from, to });
  const supplierId = id ? new mongoose.Types.ObjectId(String(id)) : null; // aggregate() doesn't cast
  const scope = { ...(product && { type: product }), ...(supplierId && { supplierId }) };
  const created = (range) => Booking.find({ ...scope, createdAt: { $gte: range.start, $lt: range.end } }, PROJECTION).lean();
  const earned = (range) => Booking.find({ ...scope, ...earnedFilter(range.start, range.end) }, PROJECTION).lean();
  const [cur, prev, curEarned, prevEarned] = await Promise.all([created(p.current), created(p.previous), earned(p.current), earned(p.previous)]);
  const commission = await commissionFor([...curEarned, ...prevEarned]);

  // ---- Overview
  const kpis = { current: kpisFor(cur, curEarned, commission), previous: kpisFor(prev, prevEarned, commission) };
  const cancelled = cur.filter((b) => b.status === 'cancelled');
  const refundsIssued = await Booking.aggregate([
    { $match: { ...scope, status: 'cancelled', 'cancellation.cancelledAt': { $gte: p.current.start, $lt: p.current.end } } },
    { $group: { _id: null, refunds: { $sum: '$cancellation.refundAmount' } } },
  ]);
  const cancellations = {
    rate: ratio(cancelled.length, cur.length),
    traveller: ratio(cancelled.filter((b) => b.cancellation?.by === 'traveller').length, cur.length),
    supplier: ratio(cancelled.filter((b) => b.cancellation?.by === 'supplier').length, cur.length),
    refunds: refundsIssued[0]?.refunds || 0,
  };
  const paymentRows = await Payment.aggregate([{ $match: { timestamp: { $gte: p.current.start, $lt: p.current.end } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const paid = Object.fromEntries(paymentRows.map((r) => [r._id, r.n]));
  const payments = { success: paid.success || 0, failed: paid.failed || 0, successRate: ratio(paid.success || 0, (paid.success || 0) + (paid.failed || 0)) };

  const { size, buckets } = bucketsFor(p.current, p.days);
  const indexOf = (date, range) => Math.floor((Date.parse(istDay(date)) - Date.parse(range.from)) / (size * DAY_MS));
  const series = buckets.map((b) => ({ ...b, flights: 0, hotels: 0, flightGbv: 0, hotelGbv: 0, previous: 0, previousGbv: 0 }));
  for (const b of cur) {
    const row = series[indexOf(b.createdAt, p.current)];
    if (!row) continue;
    row[b.type === 'flight' ? 'flights' : 'hotels'] += 1;
    row[b.type === 'flight' ? 'flightGbv' : 'hotelGbv'] += gross(b);
  }
  for (const b of prev) {
    const row = series[indexOf(b.createdAt, p.previous)];
    if (!row) continue;
    row.previous += 1;
    row.previousGbv += gross(b);
  }

  // ---- Supply
  const supplierIds = [...new Set(cur.map((b) => String(b.supplierId)).filter((id) => id !== 'null'))];
  const suppliers = await Supplier.find({ _id: { $in: supplierIds } }, { name: 1 }).lean();
  const supplierName = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  const flightsCur = cur.filter((b) => b.type === 'flight');
  const topRoutes = topBy(flightsCur, (b) => (b.itemSummary?.origin ? `${b.itemSummary.origin}-${b.itemSummary.destination}` : null), (k) => k.split('-').map((c) => cityOf[c] || c).join(' → '));
  const topCities = topBy(cur, (b) => (b.type === 'flight' ? cityOf[b.itemSummary?.destination] || b.itemSummary?.destination : b.itemSummary?.destination));
  const topSuppliers = topBy(cur, (b) => (b.supplierId ? String(b.supplierId) : null), (k) => supplierName[k] || 'Unknown');

  // Seat load factor: scheduled departures in the next 30 days (past departures without bookings
  // are pruned daily, so a backward-looking figure would be biased).
  const loadMatch = { status: 'scheduled', departureTime: { $gte: new Date(), $lt: new Date(Date.now() + 30 * DAY_MS) }, ...(supplierId && { supplierId }) };
  const [load] = product === 'hotel' ? [] : await Flight.aggregate([
    { $match: loadMatch },
    { $group: { _id: null, sold: { $sum: { $add: ['$cabins.economy.sold', { $ifNull: ['$cabins.business.sold', 0] }] } }, capacity: { $sum: { $add: ['$cabins.economy.capacity', { $ifNull: ['$cabins.business.capacity', 0] }] } } } },
  ]);
  // Hotels: room-nights from stays starting in the period, against every room of the hotels in scope.
  const stays = await Booking.find({ ...(supplierId && { supplierId }), type: 'hotel', status: 'confirmed', 'travelDates.start': { $gte: p.current.start, $lt: p.current.end } }, { travelDates: 1, selection: 1, fareBreakdown: 1 }).lean();
  const roomNights = stays.reduce((s, b) => s + (b.selection?.rooms || 1) * Math.round((new Date(b.travelDates.end) - new Date(b.travelDates.start)) / DAY_MS), 0);
  const roomRevenue = stays.reduce((s, b) => s + (b.fareBreakdown?.base || 0), 0);
  const hotelRooms = product === 'flight' ? [] : await Hotel.aggregate([{ $match: supplierId ? { supplierId } : {} }, { $unwind: '$roomTypes' }, { $group: { _id: null, rooms: { $sum: '$roomTypes.roomsTotal' } } }]);
  const offered = (hotelRooms[0]?.rooms || 0) * p.days;
  const supply = {
    topRoutes,
    topCities,
    topSuppliers,
    seatLoadFactor: load ? ratio(load.sold, load.capacity) : null,
    occupancy: product === 'flight' ? null : ratio(roomNights, offered),
    roomNights,
    adr: product === 'flight' ? null : ratio(roomRevenue, roomNights),
  };

  // ---- Demand & offers
  const leadTime = LEAD_BANDS.map((band) => {
    const inBand = cur.filter((b) => {
      const d = leadDays(b);
      return d >= band.from && d <= band.to;
    });
    return { label: band.label, bookings: inBand.length, cancellationRate: ratio(inBand.filter((b) => b.status === 'cancelled').length, inBand.length) };
  });
  const withOffer = cur.filter((b) => b.offer && b.fareBreakdown?.discounts);
  const offers = {
    redemptions: withOffer.length,
    share: ratio(withOffer.length, cur.length),
    discountPlatform: withOffer.filter((b) => b.offer.funder === 'platform').reduce((s, b) => s + b.fareBreakdown.discounts, 0),
    discountSupplier: withOffer.filter((b) => b.offer.funder === 'supplier').reduce((s, b) => s + b.fareBreakdown.discounts, 0),
    top: topBy(withOffer, (b) => b.offer.title, (k) => k, 5).map((r) => ({ ...r, discount: withOffer.filter((b) => b.offer.title === r.key).reduce((s, b) => s + b.fareBreakdown.discounts, 0) })),
  };

  return {
    range: { from, to, days: p.days, previous: { from: p.previous.from, to: p.previous.to }, bucketDays: size },
    kpis,
    cancellations,
    payments,
    series,
    supply,
    leadTime,
    funnel: await funnelFor(p.current, product),
    offers,
    notes: {
      payments: 'Payments and the funnel are platform-wide counts (they aren’t split by supplier).',
      loadFactor: 'Seat load factor covers scheduled departures in the next 30 days.',
    },
  };
}

// ---------- Funnel events ----------

/** Records one funnel event. Never from a sandbox; a failure is logged, never thrown. */
export async function track(type, product, { zeroResults = false } = {}) {
  if (currentContext()?.sandboxId) return;
  try {
    await Event.create({ type, product, zeroResults });
  } catch (err) {
    console.error('track failed', type, err.message);
  }
}

/** Daily job step: rolls each finished day's events (last 14 days) into a permanent DailyStat. */
export async function rollUpEvents({ now = Date.now() } = {}) {
  const today = todayIstString(now);
  let written = 0;
  for (let back = 13; back >= 1; back--) {
    const date = addDays(today, -back);
    const existing = new Set((await DailyStat.find({ date }, { product: 1 }).lean()).map((s) => s.product));
    if (existing.size === 2) continue;
    const rows = await Event.aggregate([
      { $match: { at: { $gte: istMidnight(date), $lt: istMidnight(addDays(date, 1)) } } },
      { $group: { _id: { product: '$product', type: '$type' }, n: { $sum: 1 }, zero: { $sum: { $cond: ['$zeroResults', 1, 0] } } } },
    ]);
    for (const product of ['flight', 'hotel']) {
      if (existing.has(product)) continue;
      const n = (type) => rows.find((r) => r._id.product === product && r._id.type === type)?.n || 0;
      const zero = rows.find((r) => r._id.product === product && r._id.type === 'search')?.zero || 0;
      const doc = { date, product, searches: n('search'), zeroResults: zero, views: n('view'), checkoutStarts: n('checkout_start'), payAttempts: n('pay_attempt'), confirmed: n('confirmed') };
      const res = await DailyStat.updateOne({ date, product }, { $setOnInsert: doc }, { upsert: true });
      written += res.upsertedCount || 0;
    }
  }
  return written;
}
