import { z } from 'zod';
import Hotel from '../models/Hotel.js';
import Review from '../models/Review.js';
import { lastBookableDate, nightsBetween, todayIstString } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { csv, dateString, optionalNumber, paginate, pagination } from '../utils/query.js';

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

// Can `rooms` rooms of this type hold the whole party?
export function roomFits(roomType, { adults, children, rooms }) {
  return (
    !roomType.salesStopped &&
    roomType.roomsAvailable >= rooms &&
    roomType.occupancy.adults * rooms >= adults &&
    (roomType.occupancy.adults + roomType.occupancy.children) * rooms >= adults + children
  );
}

const sorters = {
  relevance: (a, b) => b.rating.average - a.rating.average || b.starRating - a.starRating,
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  rating: (a, b) => b.rating.average - a.rating.average || a.price - b.price,
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function searchHotels(req, res) {
  const q = req.validated.query;
  const nights = nightsBetween(q.checkIn, q.checkOut);
  // Past stays can't be booked, so they have no results (the client shows a friendly message).
  // Beyond the 60-day horizon, likewise.
  const pastDates = q.checkIn < todayIstString();
  const tooFar = q.checkIn > lastBookableDate();
  if (pastDates || tooFar) {
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
  const candidates = await Hotel.find({ city: new RegExp(`^${escapeRegex(q.city)}$`, 'i'), salesStopped: { $ne: true } }).lean();

  const available = candidates
    .map((hotel) => {
      const rooms = hotel.roomTypes.filter((room) => roomFits(room, q));
      if (!rooms.length) return null;
      const cheapest = rooms.reduce((min, r) => (r.price < min.price ? r : min));
      return {
        _id: hotel._id,
        name: hotel.name,
        city: hotel.city,
        address: hotel.address,
        starRating: hotel.starRating,
        amenities: hotel.amenities,
        photo: hotel.photos?.[0] || null,
        rating: hotel.rating,
        price: cheapest.price,
        breakfastIncluded: cheapest.breakfastIncluded,
        freeCancellation: cheapest.cancellationPolicy?.freeUntilDaysBeforeCheckIn > 0,
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
  res.json({ ...paginate(filtered, q.page, q.limit), facets, unfilteredTotal: available.length });
}

export async function getHotel(req, res) {
  const hotel = await Hotel.findById(req.params.id).lean();
  if (!hotel) throw new HttpError(404, 'We could not find that hotel.', 'NOT_FOUND');
  const reviews = await Review.find({ itemType: 'hotel', itemId: hotel._id }).sort({ createdAt: -1 }).limit(5).lean();
  res.json({ hotel, reviews });
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
    starRating: { $gte: FEATURED_MIN_STARS },
    'rating.average': { $gte: FEATURED_MIN_RATING },
  })
    .sort({ 'rating.average': -1, starRating: -1, 'rating.count': -1, name: 1 })
    .limit(limit)
    .lean();

  res.json({
    results: hotels.map((h) => ({
      _id: h._id,
      name: h.name,
      city: h.city,
      address: h.address,
      starRating: h.starRating,
      amenities: h.amenities,
      photo: h.photos?.[0] || null,
      photos: h.photos || [],
      rating: h.rating,
      price: Math.min(...h.roomTypes.map((r) => r.price)), // "from" price per night, before taxes
    })),
  });
}

export async function listCities(req, res) {
  const cities = await Hotel.distinct('city');
  res.json({ cities: cities.sort() });
}
