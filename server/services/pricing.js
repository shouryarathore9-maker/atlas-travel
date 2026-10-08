// The rules-based pricing engine (prd.md → Pricing Engine and Rate Cards; architecture.md §12).
// Pure functions: inputs are a supplier's rate card plus the facts of one flight or night; no I/O.
// Search, details pages and the re-pricing at payment all call these, so they always agree.
import { CITIES } from '../seed/data.js';
import { FESTIVALS, OFF_SEASONS } from './calendar.js';

export const ENGINE_VERSION = 1;
export const FLIGHT_TAX_RATE = 0.12;
export const INFANT_FEE = 1500;

const DAY_MS = 24 * 3600 * 1000;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const round50 = (n) => Math.round(n / 50) * 50;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const istDate = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istMinuteOfDay = (date) => {
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const weekday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const cityByCode = Object.fromEntries(CITIES.map((c) => [c.code, c]));
export function routeKm(origin, destination) {
  const a = cityByCode[origin];
  const b = cityByCode[destination];
  if (!a || !b) return 0;
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// A base-rate variable either grows from a starting value at a fixed yearly rate (how inflation
// enters) or is a data point the supplier updates by hand.
export function variableValue(v, onDateStr) {
  if (!v) return 0;
  if (v.mode !== 'growing') return v.value;
  const years = Math.max(0, daysBetween(v.since, onDateStr) / 365.25);
  return v.value * (1 + (v.growthPctPerYear || 0) / 100) ** years;
}

// An optional rule that's switched off counts as ×1.0.
function bandFactor(rule, value) {
  if (!rule?.enabled) return 1;
  return rule.bands.find((b) => value >= b.from && value <= b.to)?.x ?? 1;
}
function seasonFor(rule, dateStr) {
  if (!rule?.enabled) return null;
  return rule.list.find((s) => dateStr >= s.from && dateStr <= s.to) || null;
}
const dayFactor = (rule, dateStr) => (rule?.enabled ? rule.x[weekday(dateStr)] ?? 1 : 1);

// ---------- Default rate cards (Claude Code defaults, editable by each supplier) ----------

// The four airlines' fares sit close together, as real fares on one route do.
export const AIRLINE_FACTORS = { IndiGo: 1, SpiceJet: 0.97, 'Air India': 1.04, Vistara: 1.06 };

const festivalSeasons = (x) => FESTIVALS.map(({ name, from, to }) => ({ name, from, to, x }));

export function defaultAirlineRateCard(airlineName) {
  return {
    kind: 'airline',
    version: 1,
    base: {
      fixed: { mode: 'growing', value: 1900, since: '2026-01-01', growthPctPerYear: 5 },
      perKm: { mode: 'growing', value: 3.4, since: '2026-01-01', growthPctPerYear: 5 },
      airlineFactor: AIRLINE_FACTORS[airlineName] ?? 1,
      businessMultiplier: 3,
    },
    // Minutes after midnight (IST) of departure.
    timeOfDay: {
      enabled: true,
      bands: [
        { from: 0, to: 479, x: 0.95 },
        { from: 480, to: 1019, x: 1 },
        { from: 1020, to: 1319, x: 1.1 },
        { from: 1320, to: 1439, x: 0.95 },
      ],
    },
    dayOfWeek: { enabled: true, x: [1.12, 1, 1, 1, 1, 1.12, 1.05] }, // Sun..Sat
    daysToDeparture: {
      enabled: true,
      bands: [
        { from: 0, to: 2, x: 1.5 },
        { from: 3, to: 6, x: 1.25 },
        { from: 7, to: 20, x: 1 },
        { from: 21, to: 44, x: 0.85 },
        { from: 45, to: 60, x: 0.95 },
      ],
    },
    // Percent of the cabin's seats already sold.
    demand: {
      enabled: true,
      bands: [
        { from: 0, to: 39, x: 1 },
        { from: 40, to: 70, x: 1.15 },
        { from: 71, to: 100, x: 1.35 },
      ],
    },
    seasons: { enabled: true, list: festivalSeasons(1.25) },
    routeOverrides: { enabled: true, list: [] },
    tiers: [
      { name: 'Saver', cabin: 'economy', x: 1, cabinBaggageKg: 7, checkinBaggageKg: 15, templateKey: 'F-SAVER', dateChangeFee: 3000 },
      { name: 'Flexi', cabin: 'economy', x: 1.2, cabinBaggageKg: 7, checkinBaggageKg: 20, templateKey: 'F-FLEX24', dateChangeFee: 0 },
      { name: 'Business', cabin: 'business', x: 1, cabinBaggageKg: 12, checkinBaggageKg: 35, templateKey: 'F-BIZ6', dateChangeFee: 0 },
    ],
    guardRails: { floor: 0.75, ceiling: 2.5 },
    seatFees: { window: 350, aisle: 300, middle: 0, extraLegroom: 600 },
  };
}

export const BREAKFAST_BY_STARS = { 3: 350, 4: 550, 5: 850 };

// baseRates: { [roomTypeName]: ₹ per night }; flexibleTemplate: the hotel's flexible terms.
export function defaultHotelRateCard({ baseRates, starRating = 4, flexibleTemplate = 'H-FREE1' }) {
  return {
    kind: 'hotel',
    version: 1,
    baseRates,
    dayOfWeek: { enabled: true, x: [1, 1, 1, 1, 1, 1.25, 1.25] }, // the night's date, Sun..Sat
    seasons: {
      enabled: true,
      list: [...festivalSeasons(1.3), ...OFF_SEASONS.map(({ name, from, to }) => ({ name, from, to, x: 0.8 }))],
    },
    // Days from booking to check-in.
    leadTime: {
      enabled: true,
      bands: [
        { from: 0, to: 6, x: 1.1 },
        { from: 7, to: 29, x: 1 },
        { from: 30, to: 60, x: 0.9 },
      ],
    },
    ratePlans: [
      { key: 'flexible', name: 'Flexible', x: 1, templateKey: flexibleTemplate },
      { key: 'nonrefundable', name: 'Non-refundable', x: 0.9, templateKey: 'H-NONREF' },
    ],
    breakfastPerGuest: BREAKFAST_BY_STARS[starRating] ?? 550,
    guardRails: { floor: 0.7, ceiling: 2 },
  };
}

// ---------- Flights ----------

/**
 * Price of one adult/child seat on a fare tier.
 * @returns {{ price, cabinBase, factors: [{ rule, x }] }}
 */
export function flightFare(card, { origin, destination, cabin, tier, departureTime, now = Date.now(), load = 0 }) {
  const today = istDate(now);
  const depDate = istDate(departureTime);
  const override = card.routeOverrides?.enabled
    ? card.routeOverrides.list.find((o) => o.origin === origin && o.destination === destination)
    : null;
  const economyBase = override?.fixedBase
    ? override.fixedBase
    : (variableValue(card.base.fixed, today) + variableValue(card.base.perKm, today) * routeKm(origin, destination)) *
      (card.base.airlineFactor ?? 1);
  const cabinBase = economyBase * (cabin === 'business' ? card.base.businessMultiplier : 1) * (override?.multiplier ?? 1);
  const season = seasonFor(card.seasons, depDate);
  const factors = [
    { rule: 'Time of day', x: bandFactor(card.timeOfDay, istMinuteOfDay(departureTime)) },
    season ? { rule: `Season: ${season.name}`, x: season.x } : { rule: 'Day of week', x: dayFactor(card.dayOfWeek, depDate) },
    { rule: 'Days to departure', x: bandFactor(card.daysToDeparture, Math.max(0, daysBetween(today, depDate))) },
    { rule: 'Demand', x: bandFactor(card.demand, Math.floor(clamp(load, 0, 1) * 100)) },
    { rule: `${tier.name} fare`, x: tier.x },
  ];
  const raw = factors.reduce((p, f) => p * f.x, cabinBase);
  const price = round50(clamp(raw, card.guardRails.floor * cabinBase, card.guardRails.ceiling * cabinBase));
  return { price, cabinBase: Math.round(cabinBase), factors };
}

export const tiersForCabin = (card, cabin) => (card.tiers || []).filter((t) => t.cabin === cabin);

// ---------- Hotels ----------

export function hotelNight(card, { roomTypeName, date, now = Date.now(), ratePlan, checkIn = date }) {
  const base = card.baseRates?.[roomTypeName];
  if (!base) return null;
  const season = seasonFor(card.seasons, date);
  const factors = [
    season ? { rule: `Season: ${season.name}`, x: season.x } : { rule: 'Day of week', x: dayFactor(card.dayOfWeek, date) },
    { rule: 'Lead time', x: bandFactor(card.leadTime, Math.max(0, daysBetween(istDate(now), checkIn))) },
    { rule: `${ratePlan.name} rate`, x: ratePlan.x },
  ];
  const raw = factors.reduce((p, f) => p * f.x, base);
  return { price: round50(clamp(raw, card.guardRails.floor * base, card.guardRails.ceiling * base)), base, factors };
}

/** Night-by-night price of one room for a stay. */
export function hotelStay(card, { roomTypeName, checkIn, checkOut, now = Date.now(), ratePlan }) {
  const nights = [];
  for (let i = 0; i < daysBetween(checkIn, checkOut); i++) {
    const date = new Date(Date.parse(`${checkIn}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
    const night = hotelNight(card, { roomTypeName, date, now, ratePlan, checkIn });
    if (!night) return null;
    nights.push({ date, price: night.price });
  }
  const perRoom = nights.reduce((s, n) => s + n.price, 0);
  return { nights, perRoom, avgNightly: nights.length ? Math.round(perRoom / nights.length) : 0 };
}
