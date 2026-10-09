// Validation for rate cards (prd.md → What a manager can change on the rate card): a fixed rule set;
// managers edit values, switch optional rules on/off and add/remove entries in list-type rules.
import { z } from 'zod';
import { CITIES } from '../seed/data.js';
import { dateString } from '../utils/query.js';

const multiplier = z.number().min(0.5, 'Multipliers must be between 0.5 and 3').max(3, 'Multipliers must be between 0.5 and 3');
const money = (min, max) => z.number().int('Use whole rupees').min(min).max(max);

// A banded rule must cover its whole range in order, with no gaps or overlaps.
const bandedRule = (domainMax, unit) =>
  z
    .object({
      enabled: z.boolean(),
      bands: z.array(z.object({ from: z.number().int().min(0), to: z.number().int().max(domainMax), x: multiplier })).min(1).max(10, 'At most 10 bands'),
    })
    .superRefine((rule, ctx) => {
      rule.bands.forEach((b, i) => {
        const expectedFrom = i === 0 ? 0 : rule.bands[i - 1].to + 1;
        if (b.from !== expectedFrom) ctx.addIssue({ code: 'custom', path: ['bands', i, 'from'], message: `Should start at ${expectedFrom}${unit} so there's no gap or overlap` });
        if (b.to < b.from) ctx.addIssue({ code: 'custom', path: ['bands', i, 'to'], message: 'Must be after the start' });
      });
      const last = rule.bands[rule.bands.length - 1];
      if (last.to !== domainMax) ctx.addIssue({ code: 'custom', path: ['bands', rule.bands.length - 1, 'to'], message: `The last band must end at ${domainMax}${unit}` });
    });

const seasons = z
  .object({
    enabled: z.boolean(),
    list: z.array(z.object({ name: z.string().trim().min(1, 'Name the season').max(40), from: dateString, to: dateString, x: multiplier })).max(30, 'At most 30 seasons'),
  })
  .superRefine((rule, ctx) => {
    const sorted = rule.list.map((s, i) => ({ ...s, i })).sort((a, b) => a.from.localeCompare(b.from));
    sorted.forEach((s, k) => {
      if (s.to < s.from) ctx.addIssue({ code: 'custom', path: ['list', s.i, 'to'], message: 'The end must be on or after the start' });
      const next = sorted[k + 1];
      if (next && next.from <= s.to) ctx.addIssue({ code: 'custom', path: ['list', next.i, 'from'], message: `Overlaps “${s.name}”` });
    });
  });

const dayOfWeek = z.object({ enabled: z.boolean(), x: z.array(multiplier).length(7) });
const guardRails = z
  .object({ floor: z.number().min(0.3).max(1), ceiling: z.number().min(1).max(5) })
  .refine((g) => g.floor < g.ceiling, { message: 'The floor must be below the ceiling', path: ['floor'] });
const variable = z.object({
  mode: z.enum(['growing', 'manual']),
  value: z.number().positive().max(100000),
  since: dateString,
  growthPctPerYear: z.number().min(-20).max(50).default(0),
});
const airportCode = z.enum(CITIES.map((c) => c.code));

export function airlineRateCardSchema(flightTemplateKeys) {
  return z.object({
    kind: z.literal('airline'),
    version: z.number().int().optional(),
    base: z.object({
      fixed: variable,
      perKm: variable,
      airlineFactor: z.number().min(0.5).max(2),
      businessMultiplier: z.number().min(1.5).max(6),
    }),
    timeOfDay: bandedRule(1439, ' min'),
    dayOfWeek,
    daysToDeparture: bandedRule(60, ' days'),
    demand: bandedRule(100, '%'),
    seasons,
    routeOverrides: z
      .object({
        enabled: z.boolean(),
        list: z
          .array(
            z
              .object({ origin: airportCode, destination: airportCode, multiplier: multiplier.optional(), fixedBase: money(500, 100000).optional() })
              .refine((o) => o.origin !== o.destination, { message: 'Origin and destination must differ', path: ['destination'] })
              .refine((o) => o.multiplier !== undefined || o.fixedBase !== undefined, { message: 'Set a multiplier or a fixed base', path: ['multiplier'] }),
          )
          .max(50, 'At most 50 route overrides'),
      })
      .refine((r) => new Set(r.list.map((o) => `${o.origin}-${o.destination}`)).size === r.list.length, { message: 'Each route can have one override', path: ['list'] }),
    tiers: z
      .array(
        z.object({
          name: z.enum(['Saver', 'Flexi', 'Business']),
          cabin: z.enum(['economy', 'business']),
          x: multiplier,
          cabinBaggageKg: z.number().int().min(0).max(15),
          checkinBaggageKg: z.number().int().min(0).max(50),
          templateKey: z.enum(flightTemplateKeys),
          dateChangeFee: money(0, 10000),
        }),
      )
      .length(3)
      .refine((t) => t.map((x) => x.name).sort().join() === 'Business,Flexi,Saver', 'The fare tiers are fixed: Saver, Flexi and Business'),
    guardRails,
    seatFees: z.object({ window: money(0, 5000), aisle: money(0, 5000), middle: money(0, 5000), extraLegroom: money(0, 5000) }),
  });
}

export function hotelRateCardSchema(roomNames, hotelTemplateKeys) {
  return z.object({
    kind: z.literal('hotel'),
    version: z.number().int().optional(),
    baseRates: z.record(z.string(), money(500, 200000)).refine((r) => Object.keys(r).sort().join('|') === [...roomNames].sort().join('|'), 'Set one base rate for each of your room types'),
    dayOfWeek,
    seasons,
    leadTime: bandedRule(60, ' days'),
    occupancy: bandedRule(100, '%'),
    ratePlans: z
      .tuple([
        z.object({ key: z.literal('flexible'), name: z.literal('Flexible'), x: multiplier, templateKey: z.enum(hotelTemplateKeys.filter((k) => k !== 'H-NONREF')) }),
        z.object({ key: z.literal('nonrefundable'), name: z.literal('Non-refundable'), x: multiplier, templateKey: z.literal('H-NONREF') }),
      ]),
    breakfastPerGuest: money(0, 5000),
    guardRails,
  });
}
