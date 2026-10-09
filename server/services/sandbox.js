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
import RoomInventory from '../models/RoomInventory.js';
import Sandbox, { SANDBOX_DAYS, SANDBOX_IDLE_MS, SANDBOX_LIMITS, SANDBOX_MAX_MS } from '../models/Sandbox.js';
import Service from '../models/Service.js';
import Statement from '../models/Statement.js';
import Supplier from '../models/Supplier.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { currentContext, runWithContext } from '../utils/context.js';
import { addDays, todayIstString } from '../utils/dates.js';
import { createRng } from '../seed/generate.js';
import { generateHistory } from '../seed/history.js';
import { defaultView, rateFor } from './commission.js';
import { inventoryDocs } from './inventory.js';
import { bookingLine, istPeriod, periodLabel, periodStart, shiftPeriod, totalsOf } from './settlement.js';
import { DEFAULT_TEMPLATES } from './templates.js';
import { HttpError } from '../utils/httpError.js';

// Every model that carries sandbox documents (the ones using the sandboxScope plugin).
const ORPHAN_GRACE_MS = 10 * 60 * 1000;
export const SANDBOX_MODELS = [Adjustment, AuditLog, Booking, CancellationTemplate, Config, Flight, Hotel, Notification, Offer, Payment, RoomInventory, Service, Statement, Supplier, Ticket, User];

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

async function airlineSlice(supplierId) {
  const supplier = await Supplier.findOne({ _id: supplierId, kind: 'airline', status: { $ne: 'suspended' } }).lean();
  if (!supplier) throw new HttpError(404, 'Choose one of the airlines.', 'NOT_FOUND');
  const now = new Date();
  const [services, flights] = await Promise.all([
    Service.find({ supplierId }).lean(),
    Flight.find({ supplierId, status: 'scheduled', departureTime: { $gte: now, $lt: new Date(now.getTime() + SANDBOX_DAYS * 864e5) } }).lean(),
  ]);
  return { suppliers: [supplier], services, flights, hotels: [] };
}

async function hotelSlice(supplierId) {
  const supplier = await Supplier.findOne({ _id: supplierId, kind: 'hotel', status: { $ne: 'suspended' } }).lean();
  const hotel = supplier && (await Hotel.findById(supplier.hotelId).lean());
  if (!hotel || hotel.starRating < FEATURED_MIN_STARS || hotel.rating.average < FEATURED_MIN_RATING) throw new HttpError(404, 'Choose one of the listed hotels.', 'NOT_FOUND');
  return { suppliers: [supplier], services: [], flights: [], hotels: [hotel] };
}

async function readSlice(kind, supplierId) {
  if (kind === 'airline') return airlineSlice(supplierId);
  if (kind === 'hotel') return hotelSlice(supplierId);
  // Admin: the alphabetically first active airline and the best-rated hotel.
  const airline = await Supplier.findOne({ kind: 'airline', status: { $ne: 'suspended' } }).sort({ name: 1 }).lean();
  const best = (await sandboxOptions()).hotels[0];
  if (!airline || !best) throw new HttpError(503, 'The demo isn’t ready yet. Please try again later.', 'DEMO_UNAVAILABLE');
  const [a, h] = await Promise.all([airlineSlice(airline._id), hotelSlice(best.supplierId)]);
  return { suppliers: [...a.suppliers, ...h.suppliers], services: a.services, flights: a.flights, hotels: h.hotels };
}

// The supplier's own offer, for a demo of a supplier that has none (so its Offers page isn't empty).
function demoOffer(supplier, today) {
  const airline = supplier.kind === 'airline';
  return {
    _id: newId(),
    slug: `${supplier.slug}-demo-deal`,
    code: airline ? `DEMO${(supplier.code || 'AIR').replace(/[^A-Z0-9]/g, '')}` : 'DEMOSTAY',
    title: `${supplier.name} demo deal`,
    summary: '8% off, up to ₹1,000',
    description: `Funded by ${supplier.name}: 8% off the ${airline ? 'base fare' : 'room charges'}, up to ₹1,000.`,
    image: airline ? '/images/seed/offers/plane-sky.jpg' : '/images/seed/offers/room-keys.jpg',
    funder: 'supplier',
    supplierId: supplier._id,
    supplierName: supplier.name,
    auto: false,
    scope: airline ? 'flights' : 'hotels',
    discountType: 'percent',
    value: 8,
    maxDiscount: 1000,
    minSpend: 2000,
    redemptionLimit: null,
    redemptions: 0,
    firstBookingsOnly: false,
    validFrom: addDays(today, -70),
    validTo: addDays(today, 30),
    status: 'active',
  };
}

const REQUESTS = {
  flight: ['Travelling with my grandmother — could we sit together near the front?', 'Could you note a wheelchair at the gate, please?'],
  hotel: ['Could we have a quiet room away from the lift?', 'We arrive around midnight — please hold the room.'],
};

// Statements for the last two closed months, built from the demo's own bookings exactly as the
// monthly job would (the older one already paid).
function demoStatements(bookings, suppliers, rateOf, now) {
  const statements = [];
  const latest = shiftPeriod(istPeriod(now), -1);
  for (const period of [shiftPeriod(latest, -1), latest]) {
    const start = periodStart(period);
    const end = periodStart(shiftPeriod(period, 1));
    for (const supplier of suppliers) {
      const rate = rateOf(supplier, period);
      const due = bookings.filter((b) => {
        if (String(b.supplierId) !== String(supplier._id) || b.settlement) return false;
        const when = b.status === 'confirmed' ? b.travelDates.end : b.cancellation?.cancelledAt;
        return when && new Date(when) >= start && new Date(when) < end;
      });
      const lines = due.map((b) => ({ b, line: bookingLine(b, rate) })).filter((x) => x.line);
      if (!lines.length) continue;
      const _id = newId();
      lines.forEach(({ b }) => {
        b.settlement = { statementId: _id, period };
      });
      const list = lines.map((x) => x.line).sort((x, y) => new Date(x.date) - new Date(y.date));
      const createdAt = new Date(end.getTime() + 2 * 3600e3);
      const paid = period !== latest;
      statements.push({
        _id,
        supplierId: supplier._id,
        period,
        commissionRate: rate,
        lines: list,
        totals: totalsOf(list),
        status: paid ? 'paid' : 'ready',
        paidAt: paid ? new Date(createdAt.getTime() + 6 * 864e5) : null,
        paymentRef: paid ? `ATLPAY-${period.replace('-', '')}-DEMO` : null,
        paidBy: paid ? 'Atlas Admin' : null,
        isSynthetic: true,
        createdAt,
      });
    }
  }
  return statements;
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
  const today = todayIstString(now);
  const [templates, configs, platformOffers] = await Promise.all([
    CancellationTemplate.find({}).lean(),
    Config.find({}).lean(),
    Offer.find({ funder: 'platform', status: 'active', code: { $ne: null }, validTo: { $gte: today } }).sort({ validTo: 1 }).limit(2).lean(),
  ]);
  const realSupplierIds = slice.suppliers.map((s) => s._id);
  const ownOffers = await Offer.find({ supplierId: { $in: realSupplierIds }, status: 'active' }).limit(2).lean();

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
  const offers = [...ownOffers, ...platformOffers].slice(0, 2).map((o) => ({ ...strip(o), _id: id(o._id), supplierId: o.supplierId ? id(o.supplierId) : null, redemptions: 0 }));
  for (const s of suppliers) if (!offers.some((o) => String(o.supplierId) === String(s._id))) offers.push(demoOffer(s, today));

  const sandboxId = newId();
  const expiresAt = new Date(now + SANDBOX_MAX_MS);
  const tag = String(sandboxId).slice(-12); // short, still unique, for the demo accounts' addresses
  const guest = { _id: newId(), name: 'Demo guests', email: `guests.${tag}@sandbox.atlas.invalid`, role: 'traveler', passwordHash: unusablePassword() };
  const primarySupplier = suppliers[0];
  const manager =
    kind === 'admin'
      ? { _id: newId(), name: 'Demo Admin', email: `admin.${tag}@sandbox.atlas.invalid`, role: 'admin', passwordHash: unusablePassword() }
      : {
          _id: newId(),
          name: `${primarySupplier.name} demo manager`,
          email: `manager.${tag}@sandbox.atlas.invalid`,
          role: kind === 'airline' ? 'airline_manager' : 'hotel_manager',
          supplierId: primarySupplier._id,
          passwordHash: unusablePassword(),
        };
  const traveller =
    kind === 'admin'
      ? null
      : {
          _id: newId(),
          name: 'Demo Traveller',
          email: `traveller.${tag}@sandbox.atlas.invalid`,
          role: 'traveler',
          phone: '9000000000',
          passwordHash: unusablePassword(),
          savedTravellers: [
            { firstName: 'Asha', lastName: 'Traveller', ageCategory: 'adult' },
            { firstName: 'Kabir', lastName: 'Traveller', ageCategory: 'child' },
          ],
        };

  // The demo's own bookings, made by the same generator as the seed's history, on the copied
  // inventory: ~60 days of past trips plus bookings already made for upcoming departures/stays
  // (on seats the departure counts as sold; upcoming stays take rooms off the copy's counters).
  // Nothing real is ever copied, so no real traveller's details can reach a public demo.
  const rng = createRng(parseInt(String(sandboxId).slice(-8), 16));
  const templatesByKey = Object.fromEntries([...DEFAULT_TEMPLATES, ...templates].map((t) => [t.key, t]));
  const generate = (window) =>
    generateHistory({
      airlineSuppliers: suppliers.filter((s) => s.kind === 'airline'),
      hotelSuppliers: suppliers.filter((s) => s.kind === 'hotel'),
      services,
      hotels,
      offers,
      templates: templatesByKey,
      flights,
      today,
      now,
      rng,
      users: [guest],
      ...window,
    });
  const past = generate({ historyDays: 62, futureDays: 0, rate: kind === 'admin' ? 0.2 : 0.16 });
  const upcoming = generate({ historyDays: -1, futureDays: kind === 'airline' ? SANDBOX_DAYS : 30, rate: kind === 'admin' ? 0.9 : 1.2 });
  const bookings = [...past.bookings, ...upcoming.bookings];
  // Readable contact details for the demo's guests (the account's own address is a long internal one).
  bookings.forEach((b, i) => {
    b.contact = { email: `guest${i + 1}@example.com`, phone: '9000000000' };
  });
  const payments = [...past.payments, ...upcoming.payments];
  const roomNights = inventoryDocs(hotels, bookings); // the copy's rooms booked per night
  for (const o of offers) o.redemptions += (past.offerUse[String(o._id)] || 0) + (upcoming.offerUse[String(o._id)] || 0);

  // Special requests: one waiting for the supplier's reply (an upcoming trip) and answered ones.
  const isUpcoming = (b) => b.status === 'confirmed' && new Date(b.travelDates.end) > new Date(now);
  const waiting = bookings.find((b) => isUpcoming(b) && !b.specialRequest);
  if (waiting) waiting.specialRequest = { text: REQUESTS[waiting.type][0] };
  if (!bookings.some((b) => b.specialRequest?.reply)) {
    const answered = bookings.find((b) => !isUpcoming(b) && b.status === 'confirmed' && !b.specialRequest);
    if (answered) answered.specialRequest = { text: REQUESTS[answered.type][1], reply: { status: 'accepted', comment: 'Noted — all arranged.', at: new Date(answered.createdAt.getTime() + 5 * 3600e3), by: primarySupplier.name } };
  }
  // The demo traveller starts with one upcoming and one past trip of the demo supplier.
  if (traveller) {
    const mine = [bookings.find((b) => isUpcoming(b) && b !== waiting), bookings.find((b) => b.status === 'confirmed' && !isUpcoming(b))].filter(Boolean);
    for (const b of mine) {
      b.userId = traveller._id;
      b.contact = { email: 'demo.traveller@example.com', phone: traveller.phone };
      b.travellers = b.travellers.map((t, i) => (i === 0 ? { ...t, firstName: 'Demo', lastName: 'Traveller', name: 'Demo Traveller' } : t));
      const payment = payments.find((p) => String(p._id) === String(b.paymentId));
      if (payment) payment.userId = traveller._id;
    }
  }
  // The real commission schedule (copied into the demo's own Config), as the monthly job would apply it.
  const legacyRate = configs.find((c) => c.key === 'commissionRate')?.value ?? 0.1;
  const schedule = configs.find((c) => c.key === 'commission')?.value ?? { flight: [{ from: '2000-01', rate: legacyRate }], hotel: [{ from: '2000-01', rate: legacyRate }] };
  const statements = demoStatements(bookings, suppliers, (supplier, period) => rateFor(schedule, supplier, period).rate, now);
  const nextHotelRate = defaultView(schedule, 'hotel', now);
  const nextFlightRate = defaultView(schedule, 'flight', now);

  // Three tickets in different states, and a few notifications, so the consoles aren't empty.
  const t0 = new Date(now - 26 * 3600e3);
  const guestBookings = bookings.filter((b) => String(b.userId) === String(guest._id) && b.status === 'confirmed');
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
  if (guestBookings[0]) {
    tickets.push(
      ticketOn(guestBookings[0], 'escalated', [
        { authorRole: 'traveller', authorName: 'Demo guest', body: 'Could you confirm my booking went through? I haven’t had an email.', at: t0 },
        { authorRole: 'admin', authorName: 'Atlas support', body: 'Asking the supplier to confirm for you.', at: new Date(now - 20 * 3600e3) },
      ]),
    );
  }
  if (guestBookings[1]) {
    tickets.push(
      ticketOn(guestBookings[1], kind === 'admin' ? 'open' : 'answered', [
        { authorRole: 'traveller', authorName: 'Demo guest', body: 'Is it possible to change the name spelling on my booking?', at: t0 },
        ...(kind === 'admin' ? [] : [{ authorRole: 'supplier', authorName: primarySupplier.name, body: 'Yes — we have corrected it on our side.', at: new Date(now - 5 * 3600e3) }]),
      ]),
    );
  }
  const queriedStatement = [...statements].reverse().find((st) => st.lines.some((l) => l.kind === 'completed'));
  const queried = queriedStatement?.lines.find((l) => l.kind === 'completed');
  if (queried) {
    tickets.push({
      _id: newId(),
      type: 'statement_query',
      bookingId: queried.bookingId,
      bookingReference: queried.bookingReference,
      supplierId: queriedStatement.supplierId,
      statementId: queriedStatement._id,
      subject: `${periodLabel(queriedStatement.period)} statement · ${queried.bookingReference}`,
      status: 'open',
      messages: [{ authorRole: 'supplier', authorName: 'Manager', body: 'A charge on this line was refunded at the desk — could you check?', at: t0 }],
      createdAt: t0,
      updatedAt: t0,
    });
  }
  const notifyTo = manager._id;
  const consoleBase = kind === 'admin' ? '/admin' : '/supplier';
  const latestStatement = statements.find((st) => st.status === 'ready') || statements[0];
  const notifications = [
    { userId: notifyTo, type: 'demo.welcome', title: 'Welcome to your demo', body: 'Everything here is a private copy. Try changing prices, offers or a booking.', link: consoleBase, createdAt: new Date(now - 60e3) },
    ...(latestStatement ? [{ userId: notifyTo, type: 'statement.ready', title: `Your ${periodLabel(latestStatement.period)} statement is ready`, link: `${consoleBase}/${kind === 'admin' ? 'settlement' : 'statements'}/${latestStatement._id}`, createdAt: new Date(now - 2 * 3600e3) }] : []),
    ...(tickets[0] ? [{ userId: notifyTo, type: 'ticket.escalated', title: `Ticket ${kind === 'admin' ? 'waiting' : 'escalated to you'} · ${tickets[0].bookingReference}`, link: `${consoleBase}/tickets/${tickets[0]._id}`, createdAt: new Date(now - 20 * 3600e3) }] : []),
    ...(waiting && kind !== 'admin' ? [{ userId: notifyTo, type: 'special_request.new', title: `Special request · ${waiting.bookingReference}`, body: waiting.specialRequest.text, link: '/supplier/requests', createdAt: new Date(now - 4 * 3600e3) }] : []),
    ...(traveller
      ? bookings
          .filter((b) => String(b.userId) === String(traveller._id))
          .map((b) => ({ userId: traveller._id, type: 'booking.confirmed', title: `Booking confirmed · ${b.bookingReference}`, link: `/bookings/${b.bookingReference}/confirmation`, createdAt: b.createdAt }))
      : []),
  ];

  // A few audit entries, as if the manager (or admin) had already been at work.
  const actor = { actorId: manager._id, actorName: manager.name, actorRole: manager.role };
  const auditAt = (h) => new Date(now - h * 3600e3);
  const audits =
    kind === 'admin'
      ? [
          {
            ...actor,
            action: 'commission.update',
            target: { type: 'config', label: 'Commission defaults' },
            before: { flight: nextFlightRate.current, hotel: nextHotelRate.current },
            after: { flight: nextFlightRate.upcoming?.rate ?? nextFlightRate.current, hotel: nextHotelRate.upcoming?.rate ?? nextHotelRate.current },
            at: auditAt(70),
          },
          { ...actor, action: 'ticket.escalate', target: { type: 'ticket', id: tickets[0]?._id, label: `Ticket ${tickets[0]?.bookingReference || ''}` }, at: auditAt(20) },
          ...statements.filter((st) => st.status === 'paid').map((st) => ({ ...actor, action: 'statement.mark_paid', supplierId: st.supplierId, target: { type: 'statement', id: st._id, label: periodLabel(st.period) }, before: { status: 'ready' }, after: { status: 'paid', paymentRef: st.paymentRef }, at: st.paidAt })),
        ]
      : [
          { ...actor, supplierId: primarySupplier._id, action: 'rate_card.update', target: { type: 'supplier', id: primarySupplier._id, label: primarySupplier.name }, at: auditAt(50) },
          ...offers.filter((o) => String(o.supplierId) === String(primarySupplier._id)).map((o) => ({ ...actor, supplierId: primarySupplier._id, action: 'offer.create', target: { type: 'offer', id: o._id, label: o.title }, at: auditAt(30) })),
          ...(tickets[1] ? [{ ...actor, supplierId: primarySupplier._id, action: 'ticket.supplier_reply', target: { type: 'ticket', id: tickets[1]._id, label: `Ticket ${tickets[1].bookingReference}` }, at: auditAt(5) }] : []),
        ];

  const docs =
    suppliers.length + hotels.length + services.length + flights.length + offers.length + bookings.length + payments.length + statements.length + tickets.length + notifications.length + audits.length + templates.length + configs.length + roomNights.length + 3;
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
        insert(RoomInventory, roomNights),
        insert(Service, services),
        insert(Flight, flights),
        insert(Offer, offers),
        insert(Booking, bookings, { timestamps: false }),
        insert(Payment, payments),
        insert(Statement, statements),
        insert(AuditLog, audits),
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
