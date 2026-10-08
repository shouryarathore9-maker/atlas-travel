// Platform-wide limits on supplier pricing inputs (prd.md → Admin console → Pricing limits).
// Enforced twice: a rate card that breaks them can't be saved, and the engine caps every multiplier and
// the final price at run time (so lowering a limit takes effect at once, even for cards saved earlier).
import { z } from 'zod';
import Config from '../models/Config.js';
import { CITIES } from '../seed/data.js';
import { DEFAULT_PRICING_LIMITS, routeKm, variableValue } from './pricing.js';
import { todayIstString } from '../utils/dates.js';

const bounds = (minLo, minHi, maxLo, maxHi) =>
  z
    .object({ min: z.number().int().min(minLo).max(minHi), max: z.number().int().min(maxLo).max(maxHi) })
    .refine((b) => b.min % 50 === 0 && b.max % 50 === 0, { message: 'Use multiples of ₹50 (prices are rounded to ₹50)', path: ['min'] })
    .refine((b) => b.min < b.max, { message: 'The lowest price must be below the highest', path: ['max'] });

export const pricingLimitsSchema = z.object({
  maxMultiplier: z.number().min(1.2, 'At least ×1.2').max(3, 'At most ×3 (rate cards never allow more)'),
  flightFare: bounds(500, 5000, 20000, 200000),
  hotelNight: bounds(300, 5000, 20000, 500000),
});

export async function getPricingLimits() {
  const doc = await Config.findOne({ key: 'pricingLimits' }).lean();
  return doc ? { ...DEFAULT_PRICING_LIMITS, ...doc.value } : DEFAULT_PRICING_LIMITS;
}

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Every rule multiplier on a card, with the path the editor shows its error against.
function multipliers(card) {
  const out = [];
  const banded = (key) => card[key]?.bands?.forEach((b, i) => out.push({ path: [key, 'bands', i, 'x'], x: b.x }));
  ['timeOfDay', 'daysToDeparture', 'demand', 'leadTime'].forEach(banded);
  card.dayOfWeek?.x?.forEach((x, i) => out.push({ path: ['dayOfWeek', 'x', i], x }));
  card.seasons?.list?.forEach((s, i) => out.push({ path: ['seasons', 'list', i, 'x'], x: s.x }));
  card.routeOverrides?.list?.forEach((o, i) => o.multiplier !== undefined && out.push({ path: ['routeOverrides', 'list', i, 'multiplier'], x: o.multiplier }));
  card.tiers?.forEach((t, i) => out.push({ path: ['tiers', i, 'x'], x: t.x }));
  card.ratePlans?.forEach((p, i) => out.push({ path: ['ratePlans', i, 'x'], x: p.x }));
  return out;
}

/** Issues (zod-style: { code, path, message }) for a validated rate card that breaks the platform limits. */
export function limitIssues(card, limits, today = todayIstString()) {
  const issues = multipliers(card)
    .filter((m) => m.x > limits.maxMultiplier)
    .map((m) => ({ code: 'custom', path: m.path, message: `Atlas allows multipliers up to ×${limits.maxMultiplier}` }));

  if (card.kind === 'hotel') {
    for (const [room, rate] of Object.entries(card.baseRates || {})) {
      if (rate < limits.hotelNight.min || rate > limits.hotelNight.max) {
        issues.push({ code: 'custom', path: ['baseRates', room], message: `Base rates must be between ${inr(limits.hotelNight.min)} and ${inr(limits.hotelNight.max)} a night` });
      }
    }
    return issues;
  }

  // Airlines: the economy base on every route, and the business base, must sit inside the fare bounds.
  const { min, max } = limits.flightFare;
  card.routeOverrides?.list?.forEach((o, i) => {
    if (o.fixedBase !== undefined && (o.fixedBase < min || o.fixedBase > max)) {
      issues.push({ code: 'custom', path: ['routeOverrides', 'list', i, 'fixedBase'], message: `A fixed base must be between ${inr(min)} and ${inr(max)}` });
    }
  });
  let low = Infinity;
  let high = 0;
  for (const a of CITIES) {
    for (const b of CITIES) {
      if (a.code === b.code) continue;
      const economy = (variableValue(card.base.fixed, today) + variableValue(card.base.perKm, today) * routeKm(a.code, b.code)) * (card.base.airlineFactor ?? 1);
      low = Math.min(low, economy);
      high = Math.max(high, economy * card.base.businessMultiplier);
    }
  }
  if (low < min) issues.push({ code: 'custom', path: ['base', 'fixed', 'value'], message: `The shortest route’s base fare would be ${inr(low)} — Atlas’s lowest allowed fare is ${inr(min)}` });
  if (high > max) issues.push({ code: 'custom', path: ['base', 'perKm', 'value'], message: `The longest route’s business base fare would be ${inr(high)} — Atlas’s highest allowed fare is ${inr(max)}` });
  return issues;
}
