// Supplier pricing inputs and policies (prd.md → Supplier console → Pricing / Policies), plus the
// admin's cancellation templates and commission (product defaults and per-supplier overrides). Every save
// is audit-logged with before/after.
import { z, ZodError } from 'zod';
import CancellationTemplate from '../models/CancellationTemplate.js';
import mongoose from 'mongoose';
import Config from '../models/Config.js';
import Hotel from '../models/Hotel.js';
import Service from '../models/Service.js';
import Supplier from '../models/Supplier.js';
import { AIRCRAFT, AIRCRAFT_KEYS, cabinSeats } from '../services/aircraft.js';
import { audit } from '../services/audit.js';
import { COMMISSION_LIMITS, commissionView, defaultView, getCommissionSchedule, PRODUCT_OF, rateFor, scheduleChange } from '../services/commission.js';
import { notifySupplier } from '../services/notify.js';
import { DEFAULT_MEALS, mealsFor } from '../services/bookingService.js';
import { flightFare, hotelStay, routeKm } from '../services/pricing.js';
import { getPricingLimits, limitIssues, pricingLimitsSchema } from '../services/pricingLimits.js';
import { airlineRateCardSchema, hotelRateCardSchema } from '../services/rateCardSchema.js';
import { rebuildServiceDepartures } from '../services/schedule.js';
import { DEFAULT_TEMPLATES, describeTemplate, loadTemplates } from '../services/templates.js';
import { CITIES } from '../seed/data.js';
import { addDays } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { istPeriod, periodLabel, shiftPeriod } from '../utils/periods.js';
import { dateString } from '../utils/query.js';

const templateKeys = (kind) => DEFAULT_TEMPLATES.filter((t) => t.kind === kind).map((t) => t.key);

async function schemaFor(supplier) {
  if (supplier.kind === 'airline') return airlineRateCardSchema(templateKeys('flight'));
  const hotel = await Hotel.findById(supplier.hotelId, { roomTypes: 1 }).lean();
  return hotelRateCardSchema(hotel.roomTypes.map((r) => r.name), templateKeys('hotel'));
}

// The supplier's card, validated against its own rules and then against the platform limits.
async function parseCard(supplier, body, limits) {
  const card = (await schemaFor(supplier)).parse(body ?? {});
  const issues = limitIssues(card, limits);
  if (issues.length) throw new ZodError(issues);
  return card;
}

export async function getRateCard(req, res) {
  const [templates, limits] = await Promise.all([loadTemplates(), getPricingLimits()]);
  res.json({
    rateCard: req.supplier.rateCard,
    limits,
    templates: Object.values(templates)
      .filter((t) => t.kind === (req.supplier.kind === 'airline' ? 'flight' : 'hotel'))
      .map((t) => ({ key: t.key, name: t.name, terms: describeTemplate(t) })),
    airports: CITIES.map(({ code, city }) => ({ code, city })),
  });
}

export async function updateRateCard(req, res) {
  const card = await parseCard(req.supplier, req.body.rateCard, await getPricingLimits());
  const before = req.supplier.rateCard;
  const next = { ...card, version: (before?.version || 0) + 1 };
  await Supplier.updateOne({ _id: req.supplierId }, { $set: { rateCard: next } });
  await audit(req, { action: 'rate_card.update', target: { type: 'supplier', id: req.supplierId, label: req.supplier.name }, before, after: next });
  res.json({ rateCard: next });
}

const flightSample = z.object({
  origin: z.string(),
  destination: z.string(),
  date: dateString,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  tier: z.string(),
  loadPct: z.number().min(0).max(100).default(30),
});
const hotelSample = z.object({
  roomTypeName: z.string(),
  checkIn: dateString,
  nights: z.number().int().min(1).max(30),
  ratePlan: z.enum(['flexible', 'nonrefundable']),
  occupancyPct: z.number().min(0).max(100).default(30),
});

// Prices a sample flight or stay with an unsaved rate card, so the manager sees the effect before saving.
export async function previewRateCard(req, res) {
  const limits = await getPricingLimits();
  const card = await parseCard(req.supplier, req.body.rateCard, limits);
  if (req.supplier.kind === 'airline') {
    const s = flightSample.parse(req.body.sample ?? {});
    const tier = card.tiers.find((t) => t.name === s.tier);
    if (!tier) throw new HttpError(400, 'Choose a fare tier', 'VALIDATION_ERROR');
    const departureTime = new Date(`${s.date}T${s.time}:00+05:30`);
    const result = flightFare(card, { origin: s.origin, destination: s.destination, cabin: tier.cabin, tier, departureTime, load: s.loadPct / 100, limits });
    return res.json({ ...result, km: Math.round(routeKm(s.origin, s.destination)) });
  }
  const s = hotelSample.parse(req.body.sample ?? {});
  const plan = card.ratePlans.find((p) => p.key === s.ratePlan);
  const checkOut = addDays(s.checkIn, s.nights);
  const occupancy = Object.fromEntries(Array.from({ length: s.nights }, (_, i) => [addDays(s.checkIn, i), s.occupancyPct / 100]));
  const stay = hotelStay(card, { roomTypeName: s.roomTypeName, checkIn: s.checkIn, checkOut, ratePlan: plan, occupancy, limits });
  if (!stay) throw new HttpError(400, 'That room has no base rate yet', 'VALIDATION_ERROR');
  res.json(stay);
}

// ---------- Policies: meals per cabin, blocked seats (airlines) ----------

const meal = z.object({ name: z.string().trim().min(2).max(60), price: z.number().int().min(0).max(3000), isVeg: z.boolean() });
const menu = z.array(meal).max(12, 'At most 12 meals per cabin').nullable();

export const airlinePoliciesSchema = z
  .object({
    mealsByCabin: z.object({ economy: menu, business: menu }),
    blockedSeats: z.record(z.enum(AIRCRAFT_KEYS), z.array(z.string().trim().toUpperCase()).max(20, 'Block at most 20 seats per aircraft')),
  })
  .superRefine((p, ctx) => {
    for (const [config, seats] of Object.entries(p.blockedSeats)) {
      const valid = new Set(Object.keys(AIRCRAFT[config].cabins).flatMap((c) => cabinSeats(config, c)));
      seats.forEach((seat, i) => {
        if (!valid.has(seat)) ctx.addIssue({ code: 'custom', path: ['blockedSeats', config, i], message: `${seat} isn’t a seat on this aircraft` });
      });
    }
  });

export async function getPolicies(req, res) {
  if (req.supplier.kind !== 'airline') throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const configs = await Service.distinct('aircraftConfig', { supplierId: req.supplierId });
  res.json({
    policies: {
      mealsByCabin: req.supplier.policies?.mealsByCabin || { economy: null, business: null },
      blockedSeats: req.supplier.policies?.blockedSeats || {},
    },
    defaults: DEFAULT_MEALS,
    menus: { economy: mealsFor(req.supplier, 'economy'), business: mealsFor(req.supplier, 'business') },
    aircraft: configs.map((key) => ({ key, label: AIRCRAFT[key].label, cabins: AIRCRAFT[key].cabins })),
  });
}

export async function updatePolicies(req, res) {
  if (req.supplier.kind !== 'airline') throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const input = airlinePoliciesSchema.parse(req.body ?? {});
  const before = req.supplier.policies || {};
  const blockedBefore = before.blockedSeats || {};
  await Supplier.updateOne({ _id: req.supplierId }, { $set: { policies: { ...before, ...input } } });

  // Blocked seats apply to future departures nobody has booked (they're rebuilt); booked departures keep theirs.
  const changedConfigs = AIRCRAFT_KEYS.filter((k) => JSON.stringify(blockedBefore[k] || []) !== JSON.stringify(input.blockedSeats[k] || []));
  let rebuilt = 0;
  if (changedConfigs.length) {
    const services = await Service.find({ supplierId: req.supplierId, aircraftConfig: { $in: changedConfigs } }, { _id: 1 }).lean();
    for (const s of services) rebuilt += (await rebuildServiceDepartures(s._id)).flightsAdded;
  }
  await audit(req, { action: 'policies.update', target: { type: 'supplier', id: req.supplierId, label: req.supplier.name }, before, after: input });
  res.json({ policies: input, departuresRebuilt: rebuilt });
}

// ---------- Templates (read for suppliers, editable by admin) ----------

export async function listTemplates(req, res) {
  const templates = await loadTemplates();
  res.json({ templates: Object.values(templates).map((t) => ({ ...t, terms: describeTemplate(t) })) });
}

export const templateUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    freeWindow: z.object({ unit: z.enum(['hours', 'days']), value: z.number().int().min(1).max(30 * 24) }).nullable(),
    feeAmount: z.number().int().min(0).max(100000).optional(),
  });

export async function updateTemplate(req, res) {
  const templates = await loadTemplates();
  const current = templates[req.params.key];
  if (!current) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  const input = templateUpdateSchema.parse(req.body ?? {});
  if (current.fee.type === 'all' && input.freeWindow) throw new HttpError(400, 'A non-refundable template has no free window.', 'VALIDATION_ERROR');
  if (input.freeWindow && input.freeWindow.unit !== (current.kind === 'flight' ? 'hours' : 'days')) {
    throw new HttpError(400, current.kind === 'flight' ? 'Flight windows are in hours before departure.' : 'Hotel windows are in days before check-in.', 'VALIDATION_ERROR');
  }
  const next = {
    key: current.key,
    kind: current.kind,
    name: input.name,
    freeWindow: input.freeWindow,
    fee: { type: current.fee.type, amount: current.fee.type === 'flat' ? input.feeAmount ?? current.fee.amount : 0 },
    updatedAt: new Date(),
  };
  await CancellationTemplate.updateOne({ key: current.key }, { $set: next }, { upsert: true });
  const { _id: _a, __v: _b, sandboxId: _c, sandboxExpiresAt: _d, ...plainBefore } = current;
  await audit(req, { action: 'template.update', target: { type: 'template', label: current.key }, before: plainBefore, after: next });
  res.json({ template: { ...next, terms: describeTemplate(next) } });
}

// ---------- Commission ----------

// One default rate for all airlines and one for all hotels, plus optional per-supplier overrides. A change
// always applies from the 1st of next month (services/commission.js); suppliers whose rate changes are told.

const pct = (rate) => `${Math.round(rate * 1000) / 10}%`;
const commissionRate = z
  .number({ error: 'Enter a rate' })
  .min(COMMISSION_LIMITS.min, `Between ${pct(COMMISSION_LIMITS.min)} and ${pct(COMMISSION_LIMITS.max)}`)
  .max(COMMISSION_LIMITS.max, `Between ${pct(COMMISSION_LIMITS.min)} and ${pct(COMMISSION_LIMITS.max)}`)
  .refine((r) => Math.abs(r * 1000 - Math.round(r * 1000)) < 1e-6, 'Use at most one decimal place (e.g. 12.5%)');

export const commissionSchema = z.object({ flight: commissionRate, hotel: commissionRate });
export const overrideSchema = z.object({ rate: commissionRate.nullable() });

function nextMonth(now = Date.now()) {
  const period = shiftPeriod(istPeriod(now), 1);
  return { period, label: periodLabel(period) };
}

function commissionPayload(schedule) {
  return { flight: defaultView(schedule, 'flight'), hotel: defaultView(schedule, 'hotel'), limits: COMMISSION_LIMITS, appliesFrom: nextMonth() };
}

async function tellSuppliers(suppliers, before, after, period) {
  for (const s of suppliers) {
    const was = rateFor(before.schedule, before.supplier?.(s) ?? s, period).rate;
    const will = rateFor(after.schedule, after.supplier?.(s) ?? s, period).rate;
    if (was === will) continue;
    await notifySupplier(s._id, {
      type: 'commission.changed',
      title: `Your commission changes to ${pct(will)} from 1 ${periodLabel(period)}`,
      body: `It is ${pct(was)} until then. Statements already issued don’t change.`,
      link: '/supplier/statements',
    });
  }
}

export async function getCommission(req, res) {
  res.json(commissionPayload(await getCommissionSchedule()));
}

export async function updateCommission(req, res) {
  const input = commissionSchema.parse(req.body ?? {});
  const schedule = await getCommissionSchedule();
  const next = { flight: scheduleChange(schedule.flight, input.flight), hotel: scheduleChange(schedule.hotel, input.hotel) };
  const changed = ['flight', 'hotel'].filter((p) => JSON.stringify(next[p]) !== JSON.stringify(schedule[p]));
  if (!changed.length) return res.json(commissionPayload(schedule));
  await Config.updateOne({ key: 'commission' }, { $set: { value: next, updatedAt: new Date() } }, { upsert: true });
  const { period, label } = nextMonth();
  const rateNext = (s, p) => (defaultView(s, p).upcoming?.rate ?? defaultView(s, p).current);
  await audit(req, {
    action: 'commission.update',
    target: { type: 'config', label: 'Commission defaults' },
    before: Object.fromEntries(changed.map((p) => [p, rateNext(schedule, p)])),
    after: { ...Object.fromEntries(changed.map((p) => [p, input[p]])), from: label },
  });
  const affected = await Supplier.find({ kind: { $in: changed.map((p) => (p === 'flight' ? 'airline' : 'hotel')) } }, { kind: 1, commissionOverrides: 1 }).lean();
  await tellSuppliers(affected, { schedule }, { schedule: next }, period);
  res.json(commissionPayload(next));
}

export async function updateSupplierCommission(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'We could not find that supplier.', 'NOT_FOUND');
  const supplier = await Supplier.findById(req.params.id, { name: 1, kind: 1, commissionOverrides: 1 }).lean();
  if (!supplier) throw new HttpError(404, 'We could not find that supplier.', 'NOT_FOUND');
  const { rate } = req.validated.body;
  const schedule = await getCommissionSchedule();
  const overrides = scheduleChange(supplier.commissionOverrides || [], rate);
  const updated = { ...supplier, commissionOverrides: overrides };
  if (JSON.stringify(overrides) !== JSON.stringify(supplier.commissionOverrides || [])) {
    await Supplier.updateOne({ _id: supplier._id }, { $set: { commissionOverrides: overrides } });
    const { period, label } = nextMonth();
    const describe = (s) => {
      const r = rateFor(schedule, s, period);
      return { rate: r.rate, source: r.source };
    };
    await audit(req, {
      action: 'commission.override',
      target: { type: 'supplier', id: supplier._id, label: supplier.name },
      supplierId: supplier._id,
      before: describe(supplier),
      after: { ...describe(updated), from: label },
    });
    await tellSuppliers([supplier], { schedule }, { schedule, supplier: () => updated }, period);
  }
  res.json({ commission: commissionView(schedule, updated), default: defaultView(schedule, PRODUCT_OF[supplier.kind]) });
}

// ---------- Platform pricing limits ----------

export async function getLimits(req, res) {
  res.json({ limits: await getPricingLimits() });
}

export async function updateLimits(req, res) {
  const limits = pricingLimitsSchema.parse(req.body ?? {});
  const before = await getPricingLimits();
  await Config.updateOne({ key: 'pricingLimits' }, { $set: { value: limits, updatedAt: new Date() } }, { upsert: true });
  await audit(req, { action: 'pricing_limits.update', target: { type: 'config', label: 'pricingLimits' }, before, after: limits });
  res.json({ limits });
}
