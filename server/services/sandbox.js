// Visitor sandboxes (prd.md → Visitor sandbox, Visitor Sandbox Rules; architecture.md §14).
// A sandbox is a private copy of one airline (services + the next 7 days of departures), one hotel, or a
// small admin dataset (one airline slice + one hotel), with ~40 bookings, 2 offers, 2 statements,
// 3 tickets and a few notifications. Every copied document carries the sandbox's id, so the
// sandboxScope plugin keeps it invisible to real requests and keeps the visitor away from real data.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { FEATURED_MIN_RATING, FEATURED_MIN_STARS } from '../controllers/hotelController.js';
import Adjustment from '../models/Adjustment.js';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import CancellationTemplate from '../models/CancellationTemplate.js';
import Config from '../models/Config.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Notification from '../models/Notification.js';
import Offer from '../models/Offer.js';
import Payment from '../models/Payment.js';
import Sandbox, { SANDBOX_DAYS, SANDBOX_IDLE_MS, SANDBOX_LIMITS, SANDBOX_MAX_MS } from '../models/Sandbox.js';
import Service from '../models/Service.js';
import Statement from '../models/Statement.js';
import Supplier from '../models/Supplier.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { currentContext, runWithContext } from '../utils/context.js';
import { todayIstString } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { generateReference } from './bookingService.js';

// Every model that carries sandbox documents (the ones using the sandboxScope plugin).
const ORPHAN_GRACE_MS = 10 * 60 * 1000;
export const SANDBOX_MODELS = [Adjustment, AuditLog, Booking, CancellationTemplate, Config, Flight, Hotel, Notification, Offer, Payment, Service, Statement, Supplier, Ticket, User];

const newId = () => new mongoose.Types.ObjectId();
const strip = ({ _id, __v, sandboxId, sandboxExpiresAt, ...rest }) => rest; // eslint-disable-line no-unused-vars
const unusablePassword = () => `!sandbox-${crypto.randomBytes(16).toString('hex')}`;
export const hashIp = (ip) => crypto.createHash('sha256').update(`${process.env.JWT_SECRET}|${ip}`).digest('hex').slice(0, 32);

/** The choices offered by "Try as …": the four airlines and the best hotels. */
export async function sandboxOptions() {
  const [airlines, hotels] = await Promise.all([
    Supplier.find({ kind: 'airline' }, { name: 1, code: 1 }).sort({ name: 1 }).lean(),
    Hotel.find({ starRating: { $gte: FEATURED_MIN_STARS }, 'rating.average': { $gte: FEATURED_MIN_RATING }, salesStopped: { $ne: true } }, { name: 1, city: 1, supplierId: 1, starRating: 1 })
      .sort({ 'rating.average': -1, name: 1 })
      .limit(12)
      .lean(),
  ]);
  const suspended = new Set((await Supplier.find({ status: 'suspended' }, { _id: 1 }).lean()).map((s) => String(s._id)));
  return {
    enabled: process.env.DEMO_MODE !== 'off',
    airlines: airlines.filter((a) => !suspended.has(String(a._id))).map((a) => ({ supplierId: a._id, name: a.name, code: a.code })),
    hotels: hotels.filter((h) => !suspended.has(String(h.supplierId))).map((h) => ({ supplierId: h.supplierId, name: h.name, city: h.city, starRating: h.starRating })),
  };
}

// ---------- Reading the real slice (in the real-data context) ----------

// Demos are public, so only seeded (synthetic) bookings are copied — never a real traveller's
// names, requests or tickets. Statement lines carry no personal data (references and amounts).
const SEEDED_ONLY = { isSynthetic: true };

async function airlineSlice(supplierId, { bookings = 40 } = {}) {
  const supplier = await Supplier.findOne({ _id: supplierId, kind: 'airline', status: { $ne: 'suspended' } }).lean();
  if (!supplier) throw new HttpError(404, 'Choose one of the airlines.', 'NOT_FOUND');
  const now = new Date();
  const [services, flights] = await Promise.all([
    Service.find({ supplierId }).lean(),
    Flight.find({ supplierId, status: 'scheduled', departureTime: { $gte: now, $lt: new Date(now.getTime() + SANDBOX_DAYS * 864e5) } }).lean(),
  ]);
  const flightIds = flights.map((f) => f._id);
  const upcoming = await Booking.find({ ...SEEDED_ONLY, supplierId, itemId: { $in: flightIds } }).sort({ createdAt: -1 }).limit(Math.ceil(bookings / 2)).lean();
  const past = await Booking.find({ ...SEEDED_ONLY, supplierId, _id: { $nin: upcoming.map((b) => b._id) } }).sort({ createdAt: -1 }).limit(bookings - upcoming.length).lean();
  return { suppliers: [supplier], services, flights, hotels: [], bookings: [...upcoming, ...past] };
}

async function hotelSlice(supplierId, { bookings = 40 } = {}) {
  const supplier = await Supplier.findOne({ _id: supplierId, kind: 'hotel', status: { $ne: 'suspended' } }).lean();
  const hotel = supplier && (await Hotel.findById(supplier.hotelId).lean());
  if (!hotel || hotel.starRating < FEATURED_MIN_STARS || hotel.rating.average < FEATURED_MIN_RATING) throw new HttpError(404, 'Choose one of the listed hotels.', 'NOT_FOUND');
  const upcoming = await Booking.find({ ...SEEDED_ONLY, supplierId, 'travelDates.end': { $gt: new Date() } }).sort({ createdAt: -1 }).limit(Math.ceil(bookings / 2)).lean();
  const past = await Booking.find({ ...SEEDED_ONLY, supplierId, _id: { $nin: upcoming.map((b) => b._id) } }).sort({ createdAt: -1 }).limit(bookings - upcoming.length).lean();
  return { suppliers: [supplier], services: [], flights: [], hotels: [hotel], bookings: [...upcoming, ...past] };
}

async function readSlice(kind, supplierId) {
  if (kind === 'airline') return airlineSlice(supplierId);
  if (kind === 'hotel') return hotelSlice(supplierId);
  // Admin: IndiGo's slice and the best-rated hotel, 20 bookings each.
  const airline = await Supplier.findOne({ kind: 'airline', status: { $ne: 'suspended' } }).sort({ name: 1 }).lean();
  const best = (await sandboxOptions()).hotels[0];
  if (!airline || !best) throw new HttpError(503, 'The demo isn’t ready yet. Please try again later.', 'DEMO_UNAVAILABLE');
  const [a, h] = await Promise.all([airlineSlice(airline._id, { bookings: 20 }), hotelSlice(best.supplierId, { bookings: 20 })]);
  return { suppliers: [...a.suppliers, ...h.suppliers], services: a.services, flights: a.flights, hotels: h.hotels, bookings: [...a.bookings, ...h.bookings] };
}

// ---------- Creating ----------

/**
 * Creates a sandbox. `kind` is 'airline' | 'hotel' | 'admin'; `supplierId` names the real airline or hotel
 * supplier to copy (ignored for admin). Returns the sandbox and the account to sign in as.
 */
export async function createSandbox({ kind, supplierId, ip, now = Date.now() }) {
  if (process.env.DEMO_MODE === 'off') throw new HttpError(503, 'The demo is switched off right now.', 'DEMO_OFF');
  await sweepSandboxes({ now }); // ended sandboxes don't count towards the cap
  const active = await Sandbox.countDocuments({ expiresAt: { $gt: new Date(now) }, lastSeenAt: { $gt: new Date(now - SANDBOX_IDLE_MS) } });
  if (active >= SANDBOX_LIMITS.active) throw new HttpError(503, 'The demo is busy — please try again in a few minutes.', 'DEMO_BUSY');

  const slice = await readSlice(kind, supplierId);
  const [templates, configs, platformOffers] = await Promise.all([
    CancellationTemplate.find({}).lean(),
    Config.find({}).lean(),
    Offer.find({ funder: 'platform', status: 'active', code: { $ne: null }, validTo: { $gte: todayIstString(now) } }).sort({ validTo: 1 }).limit(2).lean(),
  ]);
  const realSupplierIds = slice.suppliers.map((s) => s._id);
  const [ownOffers, statements, payments] = await Promise.all([
    Offer.find({ supplierId: { $in: realSupplierIds }, status: 'active' }).limit(2).lean(),
    Statement.find({ supplierId: { $in: realSupplierIds } }).sort({ period: -1 }).limit(kind === 'admin' ? 4 : 2).lean(),
    Payment.find({ bookingId: { $in: slice.bookings.map((b) => b._id) } }).lean(),
  ]);

  // New ids for everything; references are remapped so the copy is self-contained.
  const map = new Map();
  const id = (old) => {
    if (!old) return old;
    const key = String(old);
    if (!map.has(key)) map.set(key, newId());
    return map.get(key);
  };
  const mapped = (old) => (old && map.has(String(old)) ? map.get(String(old)) : old);
  const suppliers = slice.suppliers.map((s) => ({ ...strip(s), _id: id(s._id), slug: `${s.slug}-demo`, status: 'active', suspension: undefined }));
  const hotels = slice.hotels.map((h) => ({ ...strip(h), _id: id(h._id), supplierId: id(h.supplierId) }));
  suppliers.forEach((s) => {
    if (s.hotelId) s.hotelId = mapped(s.hotelId);
  });
  const services = slice.services.map((s) => ({ ...strip(s), _id: id(s._id), supplierId: id(s.supplierId) }));
  const flights = slice.flights.map((f) => ({ ...strip(f), _id: id(f._id), supplierId: id(f.supplierId), serviceId: mapped(f.serviceId) }));
  const offers = [...ownOffers, ...platformOffers].slice(0, 2).map((o) => ({ ...strip(o), _id: id(o._id), supplierId: o.supplierId ? id(o.supplierId) : null }));

  const sandboxId = newId();
  const expiresAt = new Date(now + SANDBOX_MAX_MS);
  const guest = { _id: newId(), name: 'Demo guests', email: `guests-${sandboxId}@sandbox.atlas.invalid`, role: 'traveler', passwordHash: unusablePassword() };
  const primarySupplier = suppliers[0];
  const manager =
    kind === 'admin'
      ? { _id: newId(), name: 'Demo Admin', email: `admin-${sandboxId}@sandbox.atlas.invalid`, role: 'admin', passwordHash: unusablePassword() }
      : {
          _id: newId(),
          name: `${primarySupplier.name} demo manager`,
          email: `manager-${sandboxId}@sandbox.atlas.invalid`,
          role: kind === 'airline' ? 'airline_manager' : 'hotel_manager',
          supplierId: primarySupplier._id,
          passwordHash: unusablePassword(),
        };
  const traveller = kind === 'admin' ? null : { _id: newId(), name: 'Demo Traveller', email: `traveller-${sandboxId}@sandbox.atlas.invalid`, role: 'traveler', phone: '9000000000', passwordHash: unusablePassword() };

  const bookings = slice.bookings.map((b) => ({
    ...strip(b),
    _id: id(b._id),
    userId: guest._id,
    supplierId: mapped(b.supplierId),
    itemId: mapped(b.itemId),
    bookingReference: generateReference(),
    contact: { email: guest.email, phone: '9000000000' },
    offer: b.offer ? { ...b.offer, offerId: mapped(b.offer.offerId), supplierId: mapped(b.offer.supplierId) } : null,
    paymentId: b.paymentId ? id(b.paymentId) : undefined,
    settlement: null,
    idempotencyKey: undefined,
  }));
  const refOf = Object.fromEntries(slice.bookings.map((b, i) => [b.bookingReference, bookings[i].bookingReference]));
  const copiedPayments = payments.map((p) => ({ ...strip(p), _id: id(p._id), bookingId: mapped(p.bookingId), userId: guest._id }));
  const copiedStatements = statements.map((s) => ({
    ...strip(s),
    _id: id(s._id),
    supplierId: mapped(s.supplierId),
    lines: s.lines.map((l) => ({ ...l, bookingId: mapped(l.bookingId), bookingReference: refOf[l.bookingReference] || l.bookingReference })),
  }));

  // Three tickets in different states, and a few notifications, so the consoles aren't empty.
  const t0 = new Date(now - 26 * 3600e3);
  const ticketOn = (b, status, messages) => ({
    _id: newId(),
    type: 'booking_problem',
    bookingId: b._id,
    bookingReference: b.bookingReference,
    supplierId: b.supplierId,
    travellerId: guest._id,
    subject: b.itemSummary?.title,
    status,
    messages,
    createdAt: t0,
    updatedAt: new Date(now - 3 * 3600e3),
  });
  const tickets = [];
  if (bookings[0]) {
    tickets.push(
      ticketOn(bookings[0], 'escalated', [
        { authorRole: 'traveller', authorName: 'Demo guest', body: 'Could you confirm my booking went through? I haven’t had an email.', at: t0 },
        { authorRole: 'admin', authorName: 'Atlas support', body: 'Asking the supplier to confirm for you.', at: new Date(now - 20 * 3600e3) },
      ]),
    );
  }
  if (bookings[1]) {
    tickets.push(
      ticketOn(bookings[1], kind === 'admin' ? 'open' : 'answered', [
        { authorRole: 'traveller', authorName: 'Demo guest', body: 'Is it possible to change the name spelling on my booking?', at: t0 },
        ...(kind === 'admin' ? [] : [{ authorRole: 'supplier', authorName: primarySupplier.name, body: 'Yes — we have corrected it on our side.', at: new Date(now - 5 * 3600e3) }]),
      ]),
    );
  }
  const queried = copiedStatements[0]?.lines.find((l) => l.kind === 'completed');
  if (queried) {
    tickets.push({
      _id: newId(),
      type: 'statement_query',
      bookingId: queried.bookingId,
      bookingReference: queried.bookingReference,
      supplierId: copiedStatements[0].supplierId,
      statementId: copiedStatements[0]._id,
      subject: `${copiedStatements[0].period} statement · ${queried.bookingReference}`,
      status: 'open',
      messages: [{ authorRole: 'supplier', authorName: 'Manager', body: 'The seat fee on this line was refunded at the desk — could you check?', at: t0 }],
      createdAt: t0,
      updatedAt: t0,
    });
  }
  const notifyTo = manager._id;
  const consoleBase = kind === 'admin' ? '/admin' : '/supplier';
  const notifications = [
    { userId: notifyTo, type: 'demo.welcome', title: 'Welcome to your demo', body: 'Everything here is a private copy. Try changing prices, offers or a booking.', link: consoleBase, createdAt: new Date(now - 60e3) },
    ...(copiedStatements[0] ? [{ userId: notifyTo, type: 'statement.ready', title: 'A statement is ready', link: `${consoleBase}/${kind === 'admin' ? 'settlement' : 'statements'}/${copiedStatements[0]._id}`, createdAt: new Date(now - 2 * 3600e3) }] : []),
    ...(tickets[0] ? [{ userId: notifyTo, type: 'ticket.escalated', title: `Ticket ${kind === 'admin' ? 'waiting' : 'escalated to you'} · ${tickets[0].bookingReference}`, link: `${consoleBase}/tickets/${tickets[0]._id}`, createdAt: new Date(now - 20 * 3600e3) }] : []),
  ];

  const docs =
    suppliers.length + hotels.length + services.length + flights.length + offers.length + bookings.length + copiedPayments.length + copiedStatements.length + tickets.length + notifications.length + templates.length + configs.length + 3;
  if (docs > SANDBOX_LIMITS.docs) throw new HttpError(503, 'That demo is too large right now. Please choose another.', 'DEMO_TOO_LARGE');

  const sandbox = await Sandbox.create({
    _id: sandboxId,
    kind,
    sourceSupplierIds: realSupplierIds,
    supplierId: kind === 'admin' ? null : primarySupplier._id,
    managerId: manager._id,
    travellerId: traveller?._id || null,
    ipHash: hashIp(ip || ''),
    counts: { docs, listings: 0, bookings: 0 },
    createdAt: new Date(now),
    lastSeenAt: new Date(now),
    expiresAt,
  });

  try {
    await runWithContext({ sandboxId, sandboxExpiresAt: expiresAt }, async () => {
      const insert = (Model, list, options = {}) => (list.length ? Model.insertMany(list, { ordered: false, ...options }) : null);
      await Promise.all([
        insert(Supplier, suppliers),
        insert(Hotel, hotels),
        insert(Service, services),
        insert(Flight, flights),
        insert(Offer, offers),
        insert(Booking, bookings, { timestamps: false }),
        insert(Payment, copiedPayments),
        insert(Statement, copiedStatements),
        insert(Ticket, tickets),
        insert(CancellationTemplate, templates.map(strip)),
        insert(Config, configs.map(strip)),
        insert(User, [manager, guest, ...(traveller ? [traveller] : [])]),
      ]);
      await insert(Notification, notifications, { timestamps: false });
    });
  } catch (err) {
    await endSandbox(sandboxId);
    throw err;
  }
  return { sandbox: sandbox.toObject(), userId: manager._id };
}

// ---------- Ending ----------

/** Deletes every document of a sandbox, then the sandbox itself. */
export async function endSandbox(sandboxId) {
  await runWithContext(undefined, async () => {
    await Promise.all(SANDBOX_MODELS.map((Model) => Model.deleteMany({ sandboxId })));
    await Sandbox.deleteOne({ _id: sandboxId });
  });
}

/**
 * Ends idle (30 min) and expired (2 h) sandboxes, then deletes documents whose sandbox no longer exists
 * (e.g. after the TTL index removed the Sandbox record). Runs from the daily job and before each new sandbox.
 */
export async function sweepSandboxes({ now = Date.now() } = {}) {
  return runWithContext(undefined, async () => {
    const stale = await Sandbox.find({ $or: [{ expiresAt: { $lte: new Date(now) } }, { lastSeenAt: { $lte: new Date(now - SANDBOX_IDLE_MS) } }] }, { _id: 1 }).lean();
    for (const s of stale) await endSandbox(s._id);
    const live = new Set((await Sandbox.find({}, { _id: 1 }).lean()).map((s) => String(s._id)));
    // A sandbox id is an ObjectId minted when the sandbox starts: a young one may still be copying.
    const settled = (sid) => sid.getTimestamp().getTime() < now - ORPHAN_GRACE_MS;
    let orphans = 0;
    for (const Model of SANDBOX_MODELS) {
      const ids = (await Model.distinct('sandboxId', { sandboxId: { $ne: null } })).filter((sid) => !live.has(String(sid)) && settled(sid));
      if (ids.length) orphans += (await Model.deleteMany({ sandboxId: { $in: ids } })).deletedCount;
    }
    return { ended: stale.length, orphans };
  });
}

// ---------- Quotas ----------

const QUOTA_MESSAGES = {
  bookings: `This demo has reached its limit of ${SANDBOX_LIMITS.bookings} bookings.`,
  listings: `This demo has reached its limit of ${SANDBOX_LIMITS.listings} new listings.`,
  docs: 'This demo has reached its size limit.',
};

/** Inside a sandbox request, counts one more `field` (and document) or refuses past the cap. Outside, does nothing. */
export async function useSandboxQuota(field, n = 1) {
  const sandboxId = currentContext()?.sandboxId;
  if (!sandboxId) return;
  const filter = { _id: sandboxId, 'counts.docs': { $lte: SANDBOX_LIMITS.docs - n } };
  if (field !== 'docs') filter[`counts.${field}`] = { $lte: SANDBOX_LIMITS[field] - n };
  const inc = { 'counts.docs': n, ...(field !== 'docs' && { [`counts.${field}`]: n }) };
  const ok = await Sandbox.findOneAndUpdate(filter, { $inc: inc });
  if (!ok) throw new HttpError(409, QUOTA_MESSAGES[field], 'SANDBOX_LIMIT');
}

export const inSandbox = () => Boolean(currentContext()?.sandboxId);
