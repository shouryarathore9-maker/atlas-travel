import mongoose from 'mongoose';
import { z } from 'zod';
import Hotel from '../models/Hotel.js';
import Review from '../models/Review.js';
import Supplier from '../models/Supplier.js';
import { roomFits } from '../services/bookingService.js';
import { hotelStay } from '../services/pricing.js';
import { track } from '../services/analytics.js';
import { getPricingLimits } from '../services/pricingLimits.js';
import { hiddenSupplierFilter, isSuspended } from '../services/suppliers.js';
import { describeTemplate, hasFreeWindow, loadTemplates } from '../services/templates.js';
import { addDays, lastBookableDate, nightsBetween, todayIstString } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { csv, dateString, optionalNumber, paginate, pagination } from '../utils/query.js';

export { roomFits };

export const hotelSearchSchema = z
  .object({
    city: z.string().trim().min(1, 'Choose a destination'),
    checkIn: dateString,
    checkOut: dateString,
    adults: z.coerce.number().int().min(1).max(24).default(2),
    children: z.coerce.number().int().min(0).max(12).default(0),
    rooms: z.coerce.number().int().min(1).max(8).default(1),
    stars: csv,
    minRating: optionalNumber,
    amenities: csv,
    maxPrice: optionalNumber,
    sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating']).default('relevance'),
    ...pagination,
  })
  .refine((q) => q.checkOut > q.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });

export const hotelDetailSchema = z.object({
  checkIn: dateString.optional(),
  checkOut: dateString.optional(),
});

const sorters = {
  relevance: (a, b) => b.rating.average - a.rating.average || b.starRating - a.starRating,
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  rating: (a, b) => b.rating.average - a.rating.average || a.price - b.price,
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function suppliersFor(hotels) {
  const suppliers = await Supplier.find({ _id: { $in: hotels.map((h) => h.supplierId).filter(Boolean) } }).lean();
  return Object.fromEntries(suppliers.map((s) => [String(s._id), s]));
}

// Every rate plan of a room type priced for a stay (night by night, one room).
function pricedPlans(card, room, { checkIn, checkOut, now, limits }, templates) {
  return (card.ratePlans || [])
    .map((plan) => {
      const stay = hotelStay(card, { roomTypeName: room.name, checkIn, checkOut, now, ratePlan: plan, limits });
      if (!stay) return null;
      const template = templates[plan.templateKey];
      return {
        key: plan.key,
        name: plan.name,
        terms: describeTemplate(template),
        freeCancellation: hasFreeWindow(template),
        nights: stay.nights,
        avgNightly: stay.avgNightly,
        perRoom: stay.perRoom,
      };
    })
    .filter(Boolean);
}

export async function searchHotels(req, res) {
  const q = req.validated.query;
  const nights = nightsBetween(q.checkIn, q.checkOut);
  // Past stays can't be booked, so they have no results (the client shows a friendly message).
  // Beyond the 60-day horizon, likewise.
  const pastDates = q.checkIn < todayIstString();
  const tooFar = q.checkIn > lastBookableDate();
  if (pastDates || tooFar) {
    if (q.page === 1) await track('search', 'hotel', { zeroResults: true });
    return res.json({
      results: [],
      total: 0,
      page: 1,
      pages: 1,
      unfilteredTotal: 0,
      ...(pastDates ? { pastDates: true } : { tooFar: true }),
      facets: { amenities: [], stars: [], minPrice: 0, maxPrice: 0 },
    });
  }
  const candidates = await Hotel.find({ city: new RegExp(`^${escapeRegex(q.city)}$`, 'i'), salesStopped: { $ne: true }, ...(await hiddenSupplierFilter()) }).lean();
  const [suppliers, templates, limits] = await Promise.all([suppliersFor(candidates), loadTemplates(), getPricingLimits()]);
  const now = Date.now();

  const available = candidates
    .map((hotel) => {
      const card = suppliers[String(hotel.supplierId)]?.rateCard;
      if (!card?.kind) return null;
      // The cheapest room + rate plan that fits the party, as an average per night for this stay.
      let best = null;
      let anyFree = false;
      for (const room of hotel.roomTypes.filter((r) => roomFits(r, q))) {
        for (const plan of pricedPlans(card, room, { ...q, now, limits }, templates)) {
          if (plan.freeCancellation) anyFree = true;
          if (!best || plan.avgNightly < best.plan.avgNightly) best = { room, plan };
        }
      }
      if (!best) return null;
      return {
        _id: hotel._id,
        name: hotel.name,
        city: hotel.city,
        address: hotel.address,
        starRating: hotel.starRating,
        amenities: hotel.amenities,
        photo: hotel.photos?.[0] || null,
        rating: hotel.rating,
        price: best.plan.avgNightly, // average per night, before taxes
        breakfastIncluded: best.room.breakfastIncluded,
        freeCancellation: anyFree,
        nights,
      };
    })
    .filter(Boolean);

  const prices = available.map((h) => h.price);
  const facets = {
    amenities: [...new Set(available.flatMap((h) => h.amenities))].sort(),
    stars: [...new Set(available.map((h) => h.starRating))].sort(),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };

  const filtered = available.filter((h) => {
    if (q.stars.length && !q.stars.includes(String(h.starRating))) return false;
    if (q.minRating !== undefined && h.rating.average < q.minRating) return false;
    if (q.maxPrice !== undefined && h.price > q.maxPrice) return false;
    if (q.amenities.length && !q.amenities.every((a) => h.amenities.includes(a))) return false;
    return true;
  });

  filtered.sort(sorters[q.sort]);
  if (q.page === 1) await track('search', 'hotel', { zeroResults: available.length === 0 });
  res.json({ ...paginate(filtered, q.page, q.limit), facets, unfilteredTotal: available.length });
}

export async function getHotel(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'We could not find that hotel.', 'NOT_FOUND');
  const hotel = await Hotel.findById(req.params.id).lean();
  if (!hotel) throw new HttpError(404, 'We could not find that hotel.', 'NOT_FOUND');
  const { checkIn: inDate, checkOut: outDate } = req.validated.query;
  const checkIn = inDate || addDays(todayIstString(), 1);
  const checkOut = outDate && outDate > checkIn ? outDate : addDays(checkIn, 2);
  const [supplier, templates, reviews, limits] = await Promise.all([
    hotel.supplierId ? Supplier.findById(hotel.supplierId).lean() : null,
    loadTemplates(),
    Review.find({ itemType: 'hotel', itemId: hotel._id }).sort({ createdAt: -1 }).limit(5).lean(),
    getPricingLimits(),
  ]);
  if (isSuspended(supplier)) throw new HttpError(404, 'This hotel isn’t available on Atlas right now.', 'NOT_FOUND');
  const card = supplier?.rateCard?.kind ? supplier.rateCard : null;
  const now = Date.now();
  await track('view', 'hotel');
  res.json({
    hotel: {
      ...hotel,
      roomTypes: hotel.roomTypes.map((room) => ({ ...room, plans: card ? pricedPlans(card, room, { checkIn, checkOut, now, limits }, templates) : [] })),
    },
    stay: { checkIn, checkOut },
    breakfastPerGuest: card?.breakfastPerGuest || 0,
    supplierCancellation: 'If the hotel can’t honour your reservation, you get a full refund automatically.',
    reviews,
  });
}

// "Best hotels" (story #19): high star rating AND high guest rating, best-rated first.
export const FEATURED_MIN_STARS = 4;
export const FEATURED_MIN_RATING = 4.0;
export const featuredQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

export async function listFeatured(req, res) {
  const { limit } = req.validated.query;
  const hotels = await Hotel.find({
    salesStopped: { $ne: true },
    ...(await hiddenSupplierFilter()),
    starRating: { $gte: FEATURED_MIN_STARS },
    'rating.average': { $gte: FEATURED_MIN_RATING },
  })
    .sort({ 'rating.average': -1, starRating: -1, 'rating.count': -1, name: 1 })
    .limit(limit)
    .lean();
  const [suppliers, templates, limits] = await Promise.all([suppliersFor(hotels), loadTemplates(), getPricingLimits()]);
  const tonight = todayIstString();
  const tomorrow = addDays(tonight, 1);
  const now = Date.now();

  res.json({
    results: hotels.map((h) => {
      const card = suppliers[String(h.supplierId)]?.rateCard;
      // "From" price: tonight's price for the cheapest room and rate plan, before taxes.
      const prices = card?.kind
        ? h.roomTypes.flatMap((room) => pricedPlans(card, room, { checkIn: tonight, checkOut: tomorrow, now, limits }, templates).map((p) => p.avgNightly))
        : [];
      return {
        _id: h._id,
        name: h.name,
        city: h.city,
        address: h.address,
        starRating: h.starRating,
        amenities: h.amenities,
        photo: h.photos?.[0] || null,
        photos: h.photos || [],
        rating: h.rating,
        price: prices.length ? Math.min(...prices) : null,
      };
    }),
  });
}

export async function listCities(req, res) {
  const cities = await Hotel.distinct('city');
  res.json({ cities: cities.sort() });
}
