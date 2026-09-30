# Atlas — Architecture (architecture.md)

*Source of truth for system design. Built from `prd.md`; `design.md` and `AGENTS.md` reference this file.*

## 1. Stack
- **Frontend:** React (Vite), React Router
- **Backend:** Node.js + Express (REST API)
- **Database:** MongoDB (Mongoose ODM)
- **Auth:** JWT, stored in an httpOnly cookie (decided default — see Decisions & Defaults)
- **Hosting:** Vercel (Hobby plan) for both the frontend and the API; MongoDB Atlas (free tier) for the database
- **No third-party APIs** for flights, hotels, or payments — everything is mocked/seeded.

## 2. Deployment Topology
The whole app is **one Vercel project**, deployed from the repository root, so the frontend and the API share a single domain:

| Piece | Runs as | Notes |
|---|---|---|
| React frontend (Vite build of `/client`) | Static files on the Vercel CDN | Any path that isn't a file or `/api/*` falls back to `index.html` (client-side routing) |
| Express API (`/server`, entry `/api/index.js`) | One Vercel Function on Fluid compute | Every `/api/*` request is routed to it |
| Scheduled job | Vercel Cron (daily) | Calls `/api/cron/extend-flights` — see §7 |
| Database | **MongoDB Atlas** (free tier) | Reached over TLS with the `MONGODB_URI` connection string |

Because the SPA and the API are **same-origin**, the browser sends the auth cookie with `SameSite=Lax` and no CORS configuration is needed; cross-origin calls to the API are simply not allowed. Routing, the cron schedule and the function region live in `vercel.json`; secrets are Vercel project environment variables.

**Serverless rules the backend follows**
- **No long-lived process:** the Express app is exported (not `app.listen`) for Vercel; `server/index.js` only exists to run it locally.
- **Database connection:** one Mongoose connection is created per function instance, cached in module scope and reused by every request that instance serves. Each request awaits it before touching the database, and the underlying pool is registered with `attachDatabasePool` so idle connections close before an instance is suspended.
- **No important state in memory:** sessions are JWT cookies; bookings, payments, idempotency keys, inventory and rate-limit counters all live in MongoDB, so any instance can serve any request.
- **Region:** the function runs in the Vercel region closest to the Atlas cluster (set in `vercel.json`), keeping each database round trip short.

## 3. High-Level Flow
```
Browser ── same domain ──┬── static files (Vercel CDN)
                         └── /api/* ──► Express (Vercel Function) ──Mongoose──► MongoDB Atlas
                                            ▲
                         Vercel Cron (daily) ┘  /api/cron/extend-flights
```
- Auth: client sends credentials → server verifies, issues JWT (httpOnly cookie) → subsequent requests include the cookie automatically → middleware verifies JWT and attaches `req.user`.
- Admin routes reuse the same JWT middleware plus a `role === 'admin'` check.

## 4. Data Model

### User
```
{
  _id,
  name,
  email:        unique,
  passwordHash,
  phone,
  countryCode,
  role:         'traveler' | 'admin',
  savedTravellers: [{ name, ageCategory }],
  createdAt
}
```

### Flight
```
{
  _id,
  airline,
  flightNumber,
  aircraftType,
  origin:      { code, city, airport },
  destination: { code, city, airport },
  departureTime,
  arrivalTime,
  durationMinutes,
  stops,
  fareOptions: [{
    type,                  // e.g. Saver, FlexiPlus
    price,
    cabinBaggageKg,
    checkinBaggageKg,
    cancellationPolicy: { freeUntilHoursBeforeDeparture, feeAfterCutoff },
    dateChangeFee,
    seatsAvailable
  }],
  mealOptions: [{ name, price, isVeg }],
  seatMap: {
    rows, columns,             // decided default: 30 rows x 6 columns (3-3), ~180 seats
    unavailableSeats: [ "12A", "12B" ],
    seatPricing: { window, aisle, middle }
  },
  rating: { average, count }
}
```

### Hotel
```
{
  _id,
  name,
  city,
  address,
  starRating,
  amenities:  [String],
  photos:     [String],       // paths to images bundled in the repo — see Decisions & Defaults
  roomTypes: [{
    name,
    occupancy: { adults, children },
    bedType,
    amenities: [String],
    breakfastIncluded,
    price,
    taxesAndFees,
    cancellationPolicy: { freeUntilDate, feeAfterCutoff },
    roomsAvailable
  }],
  rating: { average, count }
}
```

### Review
```
{
  _id,
  itemType:  'flight' | 'hotel',
  itemId,
  userId,        // nullable — seed-generated reviews have no real user
  rating:    1-5,
  comment,
  createdAt
}
```
Decided default: reviews are seeded, read-only content in the MVP; no write endpoint for real users until Phase 3.

### Booking
```
{
  _id,
  userId,
  type: 'flight' | 'hotel',
  itemId,
  selection: {
    // flight:
    fareType, seat, meal
    // or hotel:
    roomTypeName
  },
  travelDates: { start, end },
  travellers: [{ name, ageCategory, seat, meal, specialRequests }],
  fareBreakdown: { base, taxes, addons, discounts, total },
  status: 'confirmed' | 'cancelled',
  bookingReference,
  paymentId,
  cancellation: {                 // populated only if status is 'cancelled'
    cancelledAt,
    refundAmount,                 // simulated, calculated from the fare/room cancellationPolicy
    refundStatus: 'simulated'
  },
  createdAt
}
```
One generic `Booking` collection with a `type` discriminator, rather than separate `FlightBooking`/`HotelBooking` collections — simpler for MVP scale.

### Payment (mock)
```
{
  _id,
  bookingId,
  amount,
  method:    'upi' | 'card',   // simulated only
  status:    'success' | 'failed',
  transactionId,   // fake, generated locally
  timestamp
}
```

### Coupon *(Phase 2)*
```
{ code, discountType, discountValue, minAmount, expiryDate }
```

## 5. API Endpoints (representative)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create account | Public |
| POST | `/api/auth/login` | Log in, issue JWT cookie | Public |
| POST | `/api/auth/logout` | Clear session | User |
| GET | `/api/auth/me` | Current user info | User |
| GET | `/api/flights?origin=&destination=&date=&filters...` | Search flights | Public |
| GET | `/api/flights/:id` | Flight detail (fares, seats, meals, reviews) | Public |
| GET | `/api/hotels?city=&dates=&occupancy=&filters...` | Search hotels | Public |
| GET | `/api/hotels/:id` | Hotel detail (room types, reviews) | Public |
| POST | `/api/bookings` | Create a booking | User |
| GET | `/api/bookings/me` | My Bookings list | User |
| PATCH | `/api/bookings/:id/cancel` | Cancel a booking, compute simulated refund | User (owner) |
| POST | `/api/payments/mock` | Simulate a payment attempt | User |
| GET | `/api/reviews?itemType=&itemId=` | Reviews for a flight/hotel | Public |
| POST/PUT/DELETE | `/api/admin/flights[/:id]` | Manage flights | Admin |
| POST/PUT/DELETE | `/api/admin/hotels[/:id]` | Manage hotels | Admin |
| GET | `/api/cron/extend-flights` | Keep the rolling flight window full (daily Vercel Cron) | `CRON_SECRET` |

## 6. Mock Payment Flow
Mirrors a standard Indian checkout page (per project reference screenshots):
1. User picks a tab: **UPI/QR** or **Card**.
2. UPI tab shows a static/generated QR placeholder and a "Simulate Payment" button (no real UPI network call).
3. Card tab shows standard fields (number, expiry, CVV, name) with client-side format validation only — nothing is transmitted to a real processor.
4. On submit, the backend `/api/payments/mock` endpoint deterministically (or via a configurable random flag) returns `success` or `failed`, creates a `Payment` record, and — on success — creates the `Booking` record and returns a `bookingReference`.
5. Failure state routes back to the payment step with a retry option; success routes to Confirmation.

## 7. Seed Data Plan
No live inventory, so realistic seed data matters:
- **Cities:** 8 Tier-1 Indian cities — Delhi, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad.
- **Flights:** ~30–40 routes across those city pairs, a handful of airlines (e.g. IndiGo, Air India, Vistara, SpiceJet), each with 2–3 fare options, a 30x6 seat map, and 3–5 meal options.
- **Hotels:** ~5–8 hotels per city (roughly 40–60 total), each with 2–3 room types, amenities, and photos.
- **Reviews:** ~5–10 seeded reviews per flight/hotel for realistic ratings.
- Seed script lives under `server/seed/` and is idempotent (safe to re-run against a fresh database). It is run from a developer machine against Atlas (`npm run seed`) — never as part of a deployment, because it resets bookings.
- **Rolling flight window:** flights are dated departures covering the next `SEED_DAYS` (21) days. A daily Vercel Cron job calls `GET /api/cron/extend-flights`, which (a) generates flights for **every** day in the window that has none — so a missed or late run is repaired by the next one — and (b) deletes flights (and their reviews) that departed more than a day ago and have no bookings. It never modifies existing flights, bookings or admin edits. The endpoint only runs when called with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this automatically). Locally the same job runs with `npm run extend-flights`.

## 8. Security
- Passwords hashed with bcrypt; never stored or logged in plaintext.
- JWT signed with a secret from environment variables; 7-day expiry, no refresh-token flow for MVP (decided default — see Decisions & Defaults).
- Input validation on every write endpoint (e.g. via `zod` or `express-validator`).
- Role-based middleware guarding all `/api/admin/*` routes.
- Rate limiting on `/api/auth/*` to blunt brute-force attempts. Counters are stored in MongoDB (a `ratelimits` collection whose entries expire automatically), so the limit holds across every function instance.
- Auth cookie: `httpOnly`, `SameSite=Lax`, `Secure` in production, same-origin only.
- The cron endpoint rejects any request without the `CRON_SECRET` bearer token.
- All secrets (`JWT_SECRET`, `MONGODB_URI`, `CRON_SECRET`) are Vercel environment variables in production and `.env` locally (excluded via `.gitignore`, never committed).
- MongoDB Atlas network access allows connections from any IP (Vercel functions have no fixed outbound IP); access is protected by the database user's credentials and TLS.

## 9. Suggested Folder Structure
```
vercel.json        (build, routing, cron schedule, function region)
/api
  index.js         (Vercel Function entry — exports the Express app)
/client
  /src
    /pages        (Home, Results, FlightDetail, HotelDetail, Checkout, Confirmation, MyBookings, Admin)
    /components
    /hooks
    /api           (fetch wrappers per resource)
  /public
    /images/seed   (downloaded stock photos used by seed data — see Decisions & Defaults)
/server
  /models          (User, Flight, Hotel, Booking, Payment, Review, Coupon)
  /routes
  /controllers
  /middleware      (auth, adminOnly, validation, rate limiting)
  /seed            (seed script + daily flight-window job)
  index.js         (local development server only)
```

## 10. Non-Functional Notes
Mirrors `prd.md`: responsive breakpoints at ~375px / ~768px / ~1440px, Lighthouse ≥ 80 targets, graceful empty/error states for no-results and failed mock payments.

## Implementation Deviations (recorded per AGENTS.md)
Changes made while building the MVP. Each is additive or a clarification; nothing in the original model was removed.

1. **Hotel `roomTypes[].cancellationPolicy`** uses `{ freeUntilDaysBeforeCheckIn, feeAfterCutoff }` instead of `{ freeUntilDate, feeAfterCutoff }`. A fixed date can't apply to every stay date; the concrete cutoff date is computed per booking (see #2).
2. **Booking** gained:
   - `policySnapshot: { freeUntil, feeAfterCutoff }` — the cancellation terms frozen at booking time, used for the simulated refund (Decisions & Defaults #6), so later admin edits never change what the traveller agreed to.
   - `itemSummary: { title, subtitle, image, origin, destination }` — denormalised display info so My Bookings needs no joins and survives inventory edits.
   - `contact: { email, phone }` — required by user story #8.
   - `selection.rooms` (hotel) and per-traveller `seat` / `meal` in `travellers[]` (multi-traveller flight bookings).
   - `idempotencyKey` (unique per user) — guarantees a retried/refreshed payment never creates a duplicate booking (story #10).
3. **Review** gained `authorName` so seeded reviews (which have no `userId`) can show a reviewer name.
4. **Payment** gained `userId`; `bookingId` is `null` for failed attempts (no booking is created on failure).
5. **API**
   - Bookings are created only by `POST /api/payments/mock` on success (as §6 describes); there is no separate `POST /api/bookings`.
   - Added `GET /api/bookings/:key` (by booking reference or id, owner only) for the confirmation/detail page, and `GET /api/hotels/cities`.
   - `GET /api/auth/me` returns `200 { user: null }` when signed out (instead of 401) so the SPA's session check never logs a console error. Protected routes still return 401/403.
   - Added `GET /api/hotels/featured?limit=` (public) for the homepage "Best hotels" section (story #19): hotels with `starRating ≥ 4` **and** `rating.average ≥ 4.0`, sorted by guest rating, then stars, then review count; returns a "from" nightly price (cheapest room, before taxes).
   - "Similar stays" (story #18) reuses `GET /api/hotels` with the viewer's current dates/party, so no new endpoint was needed.
   - Admin also has `GET /api/admin/flights[/:id]` and `GET /api/admin/hotels[/:id]` (list with search + pagination, and single item for the edit form).
6. **Inventory is not per-date for hotels**: `roomsAvailable` is a single counter per room type (decremented on booking, restored on cancel). Flight seats are per flight document, since each seeded flight is one dated departure.
7. **Folder structure** adds `server/services` (pricing, inventory, refunds), `server/utils`, `server/config`, `server/tests`, and `client/src/lib` (formatting, pricing mirror, validation).
8. **Password hashing** uses `bcryptjs` (pure-JS bcrypt, same algorithm and hash format) to avoid native build tooling on Windows.
9. **Rate limiting** — `POST /api/auth/register` and `/login` share a strict limit (30 requests / 15 min / IP). `GET /api/auth/me` and `/logout` use a separate, lenient limit (600 / 15 min), because the session check runs on every page load and must not lock users out. Counters are kept in MongoDB (see §8).
10. **Cancellation windows of 0** — `freeUntilHoursBeforeDeparture: 0` (flights) or `freeUntilDaysBeforeCheckIn: 0` (hotels) means *no* free-cancellation window: `policySnapshot.freeUntil` is `null` and the stated fee always applies. (Found in QA-2: it was previously treated as "free until departure / check-in".)
11. **Concurrent duplicate payments** — if two requests with the same `idempotencyKey` race, the loser briefly polls (≤ 0.5 s) for the winner's booking and returns it (200) instead of a misleading "no longer available" error. Exactly one booking is ever created.
12. **Names** (traveller, guest, account) must be 2–80 characters of letters in any script plus spaces, apostrophes, hyphens and dots — digits and emoji are rejected with a friendly message (QA-2).
13. **Hotel search with a past check-in** returns no results (`pastDates: true`) so the UI can explain why.
14. **Seed flights** are dated departures for the next `SEED_DAYS` (default 21) days; the daily cron job keeps that window full (see §7). Added `GET /api/cron/extend-flights` (cron secret only).

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
1. **Hosting:** a single Vercel project serves the static frontend and the Express API (as one Vercel Function) on one domain, with MongoDB Atlas as the database — see §2. Final for MVP.
2. **Auth storage:** JWT in an httpOnly cookie (not `localStorage`) — better XSS resistance, standard practice, acceptable added complexity for a learning project.
3. **JWT expiry:** 7 days, single token, no refresh-token rotation for MVP.
4. **Reviews:** seed-only, read-only through Phase 2 (matches `prd.md`).
5. **Hotel/destination photo sourcing:** since there's no photo API, curate a set of royalty-free high-resolution images (e.g. from Unsplash), **download and commit them into `/client/public/images/seed/`** rather than hot-linking external URLs — avoids link rot and rate limits. Add a `CREDITS.md` noting sources/licenses.
6. **Cancellation refund:** simulated, calculated from the cancellationPolicy on the booking's fare/room type at booking time (see Booking model above); no real money movement.
