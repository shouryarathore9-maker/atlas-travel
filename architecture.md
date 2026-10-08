# Atlas — Architecture (architecture.md)

*Source of truth for system design. Built from `prd.md`; `design.md` and `AGENTS.md` reference this file. Phase 2 (marketplace) additions are §11–§15 and the Phase 2 data-model log; Phase 1 sections are kept and amended where Phase 2 changes them.*

## 1. Stack
- **Frontend:** React (Vite), React Router
- **Backend:** Node.js + Express (REST API)
- **Database:** MongoDB (Mongoose ODM)
- **Auth:** JWT, stored in an httpOnly cookie (decided default — see Decisions & Defaults)
- **Hosting:** Vercel (Hobby plan) for both the frontend and the API; MongoDB Atlas (free tier, M0) for the database
- **No third-party APIs** for flights, hotels, or payments — everything is mocked/seeded.
- **Phase 2 client libraries:** `qrcode` (MIT) for e-ticket and boarding-pass QR codes, generated in the browser and lazy-loaded. Charts are small hand-written SVG components (no chart dependency), lazy-loaded with the admin console. Licences are re-checked when a dependency is added.

## 2. Deployment Topology
The whole app is **one Vercel project**, deployed from the repository root, so the frontend and the API share a single domain:

| Piece | Runs as | Notes |
|---|---|---|
| React frontend (Vite build of `/client`) | Static files on the Vercel CDN | Any path that isn't a file or `/api/*` falls back to `index.html` (client-side routing) |
| Express API (`/server`, entry `/api/index.js`) | One Vercel Function on Fluid compute | Every `/api/*` request is routed to it |
| Scheduled job | Vercel Cron (daily) | Calls `/api/cron/daily` — see §7 |
| Database | **MongoDB Atlas** (free tier) | Reached over TLS with the `MONGODB_URI` connection string |

Because the SPA and the API are **same-origin**, the browser sends the auth cookie with `SameSite=Lax` and no CORS configuration is needed; cross-origin calls to the API are simply not allowed. Routing, the cron schedule and the function region live in `vercel.json`; secrets are Vercel project environment variables.

**Serverless rules the backend follows**
- **No long-lived process:** the Express app is exported (not `app.listen`) for Vercel; `server/index.js` only exists to run it locally.
- **Database connection:** one Mongoose connection is created per function instance, cached in module scope and reused by every request that instance serves. Each request awaits it before touching the database, and the underlying pool is registered with `attachDatabasePool` so idle connections close before an instance is suspended.
- **No important state in memory:** sessions are JWT cookies; bookings, payments, idempotency keys, inventory, rate-limit counters, sandboxes and job progress all live in MongoDB, so any instance can serve any request.
- **Region:** the function runs in the Vercel region closest to the Atlas cluster (set in `vercel.json`), keeping each database round trip short.

**Verified free-tier limits (checked 2026-10-08 against vendor docs)**
- **Vercel Hobby:** up to 100 cron jobs per project, each at most **once per day**, fired anywhere within the scheduled hour (±59 min); function maximum duration **300 s**; 2 GB memory / 1 vCPU; 4.5 MB request/response body; personal, non-commercial use.
- **MongoDB Atlas M0:** **512 MB** storage (data + indexes), **100 operations per second**, **500 connections**, 10 GB in + 10 GB out per rolling 7 days, 500 collections, 32 MB in-memory sort, no `allowDiskUse`, no server-side JavaScript; throttled (not billed) when exceeded; paused after 30 days with no connections.

## 3. High-Level Flow
```
Browser ── same domain ──┬── static files (Vercel CDN)
                         └── /api/* ──► Express (Vercel Function) ──Mongoose──► MongoDB Atlas
                                            ▲
                         Vercel Cron (daily) ┘  /api/cron/daily
```
- Auth: client sends credentials → server verifies, issues JWT (httpOnly cookie) → subsequent requests include the cookie automatically → middleware verifies JWT and attaches `req.user`.
- **Roles:** `traveler`, `airline_manager`, `hotel_manager`, `admin`. Console routes reuse the same JWT middleware plus a role check; manager routes also attach `req.supplierId` from the user record and every query is scoped to it (§14).
- **Sandbox sessions** use a separate cookie and only reach `/api/sandbox/*` routes (§14).

## 4. Data Model
Phase 1 models as built, with the Phase 2 changes logged in **Phase 2 Data-Model Changes** below. Every collection that a sandbox can copy carries `sandboxId` (null for real data) and `sandboxExpiresAt` (§14).

### User
```
{
  _id, name, email: unique, passwordHash, phone, countryCode,
  role:         'traveler' | 'airline_manager' | 'hotel_manager' | 'admin',
  supplierId,                         // managers only
  savedTravellers: [{ firstName, lastName, ageCategory }],   // ≤ 20
  sandboxId,
  createdAt
}
```

### Supplier *(Phase 2)*
```
{
  _id,
  kind:       'airline' | 'hotel',
  name,                               // "IndiGo", "The Marine Palm"
  code,                               // airline IATA code (6E, AI, UK, SG); null for hotels
  hotelId,                            // hotels only
  slug,                               // used for manager emails and URLs
  rateCard:   { ... },                // §12 — one per supplier, versioned
  policies: {
    // airline
    mealsByCabin: { economy: [{ name, price, isVeg }] | null, business: [...] | null },  // null = platform default
    blockedSeats: { [aircraftConfig]: ["1A", ...] },
    // hotel
    breakfastPerGuest
  },
  salesStopped: Boolean,
  sandboxId, sandboxExpiresAt
}
```

### Service *(Phase 2 — a recurring flight)*
```
{
  _id, supplierId, flightNumber,
  origin: { code, city, airport }, destination: { ... },
  aircraftConfig,                     // key into the platform aircraft catalogue (§12)
  departureMinute,                    // minutes after IST midnight
  durationMinutes, stops,
  daysOfWeek: [0..6],                 // 0 = Sunday
  startDate, endDate,                 // 'YYYY-MM-DD' (IST); endDate null = open-ended
  status:     'active' | 'discontinued',
  rating:     { average, count },     // reviews belong to the service
  sandboxId, sandboxExpiresAt
}
```

### Flight (a dated departure)
```
{
  _id, supplierId, serviceId,
  airline, flightNumber, aircraftType, aircraftConfig,
  date,                                // 'YYYY-MM-DD' (IST); unique with serviceId
  origin: { code, city, airport }, destination: { code, city, airport },
  departureTime, arrivalTime, durationMinutes, stops,
  cabins: { economy: { capacity, sold }, business: { capacity, sold } | null },
  seatMap: {
    unavailableSeats: [ "12A", ... ],  // taken ∪ airline-blocked (one bounded array; never a doc per seat)
    blockedSeats:     [ ... ]          // the blocked subset, for the legend
  },
  status:        'scheduled' | 'cancelled',
  salesStopped:  Boolean,
  scheduleChange: { previousDeparture, previousArrival, changedAt } | null,
  cancellationJob: { state: 'pending' | 'done', startedAt, processed } | null,
  checkInSeq:    Number,               // boarding sequence counter
  rating: { average, count },          // copied from the service
  sandboxId, sandboxExpiresAt
}
```
Prices, fare tiers, seat fees and meals are **not** stored on the flight: they come from the supplier's rate card and policies at request time.

### Hotel
```
{
  _id, supplierId, name, city, address, description, starRating,
  amenities: [String],
  photos:    [String],                 // paths from the preset gallery
  roomTypes: [{
    name, occupancy: { adults, children }, bedType, amenities: [String],
    breakfastIncluded,
    taxesAndFees,                       // fixed per room per night
    roomsTotal,                         // for occupancy
    roomsAvailable,                     // counter: −booking, +cancellation, +after check-out
    salesStopped
  }],
  salesStopped,
  rating: { average, count },
  sandboxId, sandboxExpiresAt
}
```

### Review
```
{ _id, itemType: 'service' | 'hotel', itemId, userId, authorName, rating: 1-5, comment, createdAt }
```
Decided default: reviews are seeded, read-only content; no write endpoint for real users (Phase 3). Phase 2: flight reviews belong to the **service**, not each dated departure.

### Booking
```
{
  _id, userId, supplierId,
  type: 'flight' | 'hotel',
  itemId,
  bookingReference,                    // AT + 6
  pnr,                                 // flights: airline-style, unique per airline
  selection: { fareType, cabin } | { roomTypeName, rooms, ratePlan, breakfast },
  travelDates: { start, end },
  travellers: [{ firstName, lastName, name, ageCategory: 'adult'|'child'|'infant', seat, meal, ticketNumber }],
  contact: { email, phone },
  specialRequest: { text, reply: { status: 'accepted'|'cannot', comment, at, by } | null } | null,
  fareBreakdown: { base, infantFees, addons, discounts, taxes, total },   // discounts = the offer amount
  offer: { offerId, code, title, amount, funder: 'platform'|'supplier', supplierId } | null,
  pricing: { engineVersion, perTraveller, nights: [{ date, price }], tierMultiplier },  // frozen snapshot
  policySnapshot: { templateKey, templateName, freeUntil, feeAfterCutoff, nonRefundable },
  status: 'confirmed' | 'cancelled',
  cancellation: { cancelledAt, by: 'traveller'|'supplier', reason, refundAmount, feeRetained,
                  receiptNo, redemptionRestored, refundStatus: 'simulated' },
  reschedule: { previousStart, previousEnd, changedAt, respondBy, decision: 'pending'|'kept'|'cancelled' } | null,
  checkIn: { at, passes: [{ travellerIndex, seat, gate, boardingTime, sequence }] } | null,
  settlement: { statementId, period } | null,   // set once, when it enters a statement
  idempotencyKey, paymentId, itemSummary: { ... },
  isSynthetic,                          // seeded history
  sandboxId, sandboxExpiresAt,
  createdAt
}
```
One generic `Booking` collection with a `type` discriminator, rather than separate `FlightBooking`/`HotelBooking` collections — simpler at this scale.

### Payment (mock)
```
{ _id, bookingId, userId, amount, method: 'upi'|'card', status: 'success'|'failed', transactionId, timestamp, sandboxId }
```

### Offer *(Phase 2 — replaces the Coupon stub)*
```
{
  _id, slug,
  code,                                // uppercase; null for automatic offers
  auto: Boolean,
  title, summary, description, image,  // image from the preset gallery
  funder: 'platform' | 'supplier', supplierId,
  scope: 'flights' | 'hotels' | 'both',           // supplier offers: own items only
  discountType: 'percent' | 'flat', value, maxDiscount,
  minSpend, validFrom, validTo,        // booking dates, IST
  redemptionLimit, redemptions,
  firstBookingsOnly: Boolean,          // fewer than 3 paid bookings
  paymentMethod: null,                 // reserved for a later bank/UPI condition
  status: 'active' | 'paused' | 'expired' | 'exhausted',
  createdBy, sandboxId, sandboxExpiresAt
}
```

### CancellationTemplate *(Phase 2)*
```
{ key, kind: 'flight'|'hotel', name,
  freeWindow: { unit: 'hours'|'days', value } | null,
  fee: { type: 'flat'|'oneNight'|'all', amount },
  sandboxId }
```

### Config *(Phase 2)*
`{ key: 'commissionRate', value: 0.10, sandboxId }`

### Notification *(Phase 2)*
`{ userId, type, title, body, link, readAt, createdAt, sandboxId }` — TTL 90 days on `createdAt`; at most 200 per user (oldest trimmed by the daily job).

### AuditLog *(Phase 2)*
`{ actorId, actorRole, supplierId, action, target: { type, id, label }, before, after, count, at, sandboxId }` — append-only; one entry per staff action; no update or delete endpoint.

### Ticket *(Phase 2)*
```
{ type: 'booking_problem' | 'statement_query',
  bookingId, bookingReference, supplierId, travellerId,
  statementId, period,                  // statement queries
  status: 'open' | 'escalated' | 'answered' | 'closed' | 'resolved',
  resolution: { kind: 'no_change'|'adjustment', amount, note } | null,
  messages: [{ authorRole, authorName, body, at }],   // ≤ 50
  createdAt, closedAt, sandboxId }
```
TTL 365 days on `closedAt` (partial: closed/resolved only).

### Statement and Adjustment *(Phase 2)*
```
Statement { supplierId, period: 'YYYY-MM', commissionRate,
            lines: [{ bookingId, bookingReference, kind: 'completed'|'cancellation_fee'|'supplier_cancelled'|'adjustment',
                      gross, discountPlatform, discountSupplier, refunds, commission, net, atlasTake }],
            totals: { ... }, status: 'ready'|'paid', paidAt, paymentRef, createdAt, sandboxId }
            // unique (sandboxId, supplierId, period); lines ≤ 5,000 (a continuation statement beyond that)
Adjustment { supplierId, amount, note, ticketId, statementId /* applied in */, createdAt, sandboxId }
```

### Event and DailyStat *(Phase 2 — funnel)*
- `Event { type: 'search'|'view'|'checkout_start'|'pay_attempt'|'confirmed', product, zeroResults, at }` — TTL 14 days; never written per keystroke; never written from sandboxes.
- `DailyStat { date, product, searches, zeroResults, views, checkoutStarts, payAttempts, confirmed }` — one document per day per product, permanent.

### Sandbox *(Phase 2)*
`{ kind: 'airline'|'hotel'|'admin', sourceSupplierId, ipHash, createdAt, lastSeenAt, expiresAt, counts: { docs, listings, bookings } }` — TTL on `lastSeenAt` (30 min) and a hard `expiresAt` (2 h).

## 5. API Endpoints (representative)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create account (always a traveller) | Public |
| POST | `/api/auth/login` | Log in, issue JWT cookie | Public |
| POST | `/api/auth/logout` | Clear session | User |
| GET | `/api/auth/me` | Current user info | User |
| GET | `/api/flights?origin=&destination=&date=&adults=&children=&infants=&cabin=&filters...` | Search flights (engine prices) | Public |
| GET | `/api/flights/:id` | Flight detail (tiers + prices, cabin seat map, cabin meals, reviews) | Public |
| GET | `/api/hotels?city=&checkIn=&checkOut=&occupancy=&filters...` | Search hotels (avg per night) | Public |
| GET | `/api/hotels/:id` | Hotel detail (room types × rate plans, night-by-night prices) | Public |
| GET | `/api/offers`, `/api/offers/:slug` | Active offers; About this offer | Public |
| POST | `/api/offers/quote` | Price a draft booking with/without a code (validates the offer) | User |
| POST | `/api/payments/mock` | Re-price, validate offer, simulate payment, create booking | User |
| GET | `/api/bookings/me`, `/api/bookings/:key` | My trips; one booking | User (owner) |
| PATCH | `/api/bookings/:id/cancel` | Traveller cancellation | User (owner) |
| POST | `/api/bookings/:ref/reschedule-response` | Keep / cancel after a supplier reschedule | User (owner) |
| POST | `/api/bookings/:ref/check-in` | Web check-in | User (owner) |
| GET | `/api/bookings/:ref/documents` | E-ticket / voucher / boarding pass data with signed QR payload | User (owner) |
| GET/POST/PUT/DELETE | `/api/me/travellers[/:id]` | Saved travellers | User |
| GET/POST | `/api/tickets`, `/api/tickets/:id`, `/api/tickets/:id/messages` | Traveller help tickets | User (owner) |
| GET/POST | `/api/notifications`, `/:id/read`, `/read-all` | Notification bar | User |
| POST | `/api/events` | `checkout_start` funnel event (rate-limited) | Public |
| GET | `/api/supplier/overview` | Manager overview | Manager |
| GET/POST/PUT | `/api/supplier/services[/:id]` | Airline services | Airline manager |
| GET | `/api/supplier/departures`, `/:id/passengers` | Departures, passenger list | Airline manager |
| POST | `/api/supplier/departures/:id/{stop-sales,resume-sales,reschedule,cancel}` | Departure actions | Airline manager |
| GET/PUT | `/api/supplier/hotel`, `/api/supplier/hotel/rooms[/:name]` | Hotel profile and room types | Hotel manager |
| POST | `/api/supplier/hotel/{stop-sales,resume-sales}` | Hotel/room stop-sell | Hotel manager |
| GET/POST | `/api/supplier/reservations`, `/:id/cancel` | Reservations; supplier cancellation | Hotel manager |
| GET/PUT/POST | `/api/supplier/rate-card`, `/rate-card/preview` | Rate card; preview | Manager |
| GET/PUT | `/api/supplier/policies`; GET `/api/supplier/templates` | Policies; templates (read) | Manager |
| GET/POST | `/api/supplier/special-requests`, `/:bookingId/reply` | Special requests | Manager |
| GET/POST | `/api/supplier/tickets`, `/:id/messages` | Escalated tickets | Manager |
| GET/POST/PUT | `/api/supplier/offers[/:id]`, `/:id/{pause,resume}` | Own offers | Manager |
| GET/POST | `/api/supplier/statements[/:id]`, `/:id/lines/:ref/query` | Statements; query a line | Manager |
| GET | `/api/admin/analytics?from=&to=&product=&supplier=` | Dashboard data | Admin |
| GET | `/api/admin/bookings`, `/:ref` | All bookings (read-only) | Admin |
| GET/POST | `/api/admin/tickets`, `/:id/{reply,close,escalate,resolve}` | Tickets and statement queries | Admin |
| GET | `/api/admin/special-requests` | Read-only list | Admin |
| GET/POST/PUT | `/api/admin/offers[/:id]`, `/:id/{pause,resume}` | Platform offers; kill switch on any offer | Admin |
| GET/POST | `/api/admin/statements`, `/:id/mark-paid` | Settlement | Admin |
| GET/PUT | `/api/admin/settings/commission`, `/api/admin/templates[/:key]` | Commission; cancellation templates | Admin |
| GET | `/api/admin/audit` | Audit log | Admin |
| POST/DELETE | `/api/sandbox`, POST `/api/sandbox/switch` | Start/end a sandbox; switch to the demo traveller | Public (rate-limited) / Sandbox |
| * | `/api/sandbox/{supplier,admin,traveller}/*` | The same routers, sandbox-scoped | Sandbox only |
| GET | `/api/cron/daily` | Daily maintenance job (§7) | `CRON_SECRET` |

Removed in Phase 2: the admin inventory routes (`/api/admin/flights*`, `/api/admin/hotels*`) — inventory belongs to managers — and `/api/cron/extend-flights` (folded into `/api/cron/daily`).

## 6. Mock Payment Flow
Mirrors a standard Indian checkout page (per project reference screenshots):
1. User picks a tab: **UPI/QR** or **Card**.
2. UPI tab shows a static/generated QR placeholder and a "Simulate Payment" button (no real UPI network call).
3. Card tab shows standard fields (number, expiry, CVV, name) with client-side format validation only — nothing is transmitted to a real processor.
4. On submit, `/api/payments/mock`:
   1. returns the existing booking for a repeated idempotency key;
   2. **re-prices** the draft with the pricing engine and **re-validates the offer**; if the total differs from the `expectedTotal` the client showed, it returns `409 PRICE_CHANGED` with the new breakdown and the reason — no payment record, nothing reserved;
   3. records a failed payment and stops, for a simulated failure;
   4. atomically reserves inventory (seats/cabin count or rooms);
   5. atomically **claims the offer redemption** (`redemptions < limit`, status active); on failure releases the inventory and returns `409 PRICE_CHANGED` (reason: offer ended);
   6. creates the booking (PNR, ticket numbers, frozen pricing/offer/policy), the payment, notifications to the supplier, a `confirmed` funnel event, and saved travellers if asked.
5. Failure state routes back to the payment step with a retry option; success routes to Confirmation.

## 7. Seed Data Plan
No live inventory, so realistic seed data matters:
- **Cities:** 8 Tier-1 Indian cities — Delhi, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad.
- **Suppliers:** 4 airlines and 48 hotels, each a `Supplier` with a default rate card (§12) and policies; 52 manager accounts (`<slug>@atlas.test`, e.g. `indigo@atlas.test`, `the-marine-palm@atlas.test`), each with its own random password written to the git-ignored `server/manager-credentials.local.md` (re-used on re-seed if the file exists). Admin and the demo traveller as before (`SEED_*` env passwords).
- **Services:** the Phase 1 timetable becomes 144 services (36 routes × 4 daily slots) with the airline's aircraft configuration (ATR 72-600 for IndiGo services on routes under 600 km).
- **Departures:** materialised for the next **60 days** (`SEED_DAYS=60`), inserted in batches of 500; ~8,640 documents.
- **Hotels:** 6 per city (48), 2–3 room types, three gallery photos; base rates from the Phase 1 prices.
- **Reviews:** 0–4 per service and 5–10 per hotel, which set the average ratings.
- **History (synthetic, `isSynthetic: true`):** 6 months of past bookings (~600–900, mixed: completed, traveller-cancelled, supplier-cancelled), the past departures they reference, matching statements (some paid, one with an open query, one with an adjustment), daily funnel summaries, a few tickets in different states, special requests with replies, and notifications.
- **Offers (fixed set, none random):** a first-3-bookings code; an automatic festive offer for flights and hotels around Diwali, Navratri–Dussehra, Holi (2–3 days) and Makar Sankranti–Pongal, with per-year booking-date windows for 2026 and 2027 (dates verified against the Government of India holiday list when seeded); evergreen offers with rolling windows; one supplier offer each for two airlines (IndiGo, Air India) and two hotels (The Marine Palm, The Lodhi Courtyard); one expired and one exhausted offer.
- Seed script lives under `server/seed/` and is idempotent. It is run from a developer machine against Atlas (`npm run seed`) — never as part of a deployment, because it resets bookings.

**Daily maintenance job** (`GET /api/cron/daily`, Vercel Cron once a day, `Authorization: Bearer <CRON_SECRET>`; locally `npm run daily`). One handler runs these steps in order, each idempotent, each under the shared job lock, and stops cleanly when the 300 s budget nears (leaving the rest for the next run):
1. **Departures:** materialise missing departures of active services within the 60-day window (unique `(serviceId, date)`, at most 10 new days per run so the first catch-up never bursts); prune departures older than a day that have no bookings.
2. **Hotel rooms:** for confirmed hotel bookings whose check-out has passed and whose rooms haven't been returned, increment `roomsAvailable` once (marked so it never repeats). Synthetic history never touches live counters.
3. **Offers:** expire offers past `validTo`; mark offers at their limit exhausted; notify creators once.
4. **Statements:** on or after the 1st (IST), close the previous month for every supplier with activity (unique per supplier and period).
5. **Bulk cancellations:** finish any departure with `cancellationJob.state = 'pending'`.
6. **Reschedule windows:** mark `pending` responses past `respondBy` as kept.
7. **Sandboxes:** delete documents of ended or expired sandboxes.
8. **Funnel:** roll up yesterday's events into `DailyStat`; trim notifications above 200 per user.

## 8. Security
- Passwords hashed with bcrypt; never stored or logged in plaintext.
- JWT signed with a secret from environment variables; 7-day expiry, no refresh-token flow (decided default).
- Input validation on every write endpoint with `zod`; free text has length limits and is stored and rendered as plain text (React escapes; no `dangerouslySetInnerHTML`).
- Role middleware on every console route; **supplier scoping** on every manager query (`{ supplierId: req.supplierId }` is part of every filter, so another supplier's id returns 404); traveller endpoints filter by `userId`.
- Rate limiting on `/api/auth/*`, `POST /api/sandbox` (3 per IP per hour) and `POST /api/events`. Counters are stored in MongoDB (a `ratelimits` collection whose entries expire automatically), so the limit holds across every function instance.
- Auth cookie: `httpOnly`, `SameSite=Lax`, `Secure` in production, same-origin only. Sandbox cookie: same flags, 2-hour lifetime, separate name.
- QR codes encode `ATLAS1.<bookingRef>.<travellerIndex>.<sig>` where `sig` is an HMAC-SHA256 (truncated) keyed from `JWT_SECRET` — no personal data.
- The cron endpoint rejects any request without the `CRON_SECRET` bearer token.
- All secrets (`JWT_SECRET`, `MONGODB_URI`, `CRON_SECRET`) are Vercel environment variables in production and `.env` locally (excluded via `.gitignore`, never committed). `DEMO_MODE=off` disables sandbox creation. Manager passwords live only in the git-ignored credentials file.
- MongoDB Atlas network access allows connections from any IP (Vercel functions have no fixed outbound IP); access is protected by the database user's credentials and TLS.

## 9. Suggested Folder Structure
```
vercel.json        (build, routing, cron schedule, function region)
/api
  index.js         (Vercel Function entry — exports the Express app)
/client
  /src
    /pages        (Home, Results, FlightDetail, HotelDetail, Checkout, Confirmation, MyBookings, Offers, OfferDetail,
                   Documents, SavedTravellers, Tickets, NotFound)
      /supplier    (Overview, Services, Departures, Hotel, Reservations, RateCard, Policies, Requests, Offers, Statements)
      /admin       (Analytics, Bookings, Tickets, SpecialRequests, Offers, Settlement, Settings, Audit)
    /components   (shared UI, charts/, NotificationBell, SandboxBanner)
    /hooks
    /api           (fetch wrappers per resource)
    /lib
  /public
    /images/seed   (downloaded stock photos used by seed data — the preset gallery)
/server
  /models          (User, Supplier, Service, Flight, Hotel, Booking, Payment, Review, Offer, CancellationTemplate,
                    Config, Notification, AuditLog, Ticket, Statement, Adjustment, Event, DailyStat, Sandbox, RateLimit, JobLock)
  /routes
  /controllers
  /services        (pricing engine, aircraft catalogue, inventory, refunds, offers, settlement, notifications, audit,
                    supplier cancellations, analytics, sandbox, daily job)
  /middleware      (auth, roles, supplier scope, sandbox scope, validation, rate limiting)
  /seed            (seed script, history, offers, daily job runner)
  index.js         (local development server only)
```

## 10. Non-Functional Notes
Mirrors `prd.md`: responsive breakpoints at ~375px / ~768px / ~1024px (laptop layout, single-row search from ~1280px), Lighthouse ≥ 80 targets, graceful empty/error states for no-results, past dates, sold-out seats/rooms, ended offers, changed prices and failed mock payments. Consoles are laptop-first and lazy-loaded so traveller pages don't carry their code.

## 11. Phase 2 State Machines and Edge Cases

**Booking**
```
confirmed ──traveller cancels──► cancelled (by: traveller, refund per frozen terms, redemption kept)
confirmed ──supplier cancels───► cancelled (by: supplier, refund = paid, redemption restored)
reschedule (flight only): none → pending ──Keep──► kept
                                      └──Cancel─► booking cancelled (by: traveller-after-reschedule, refund = paid, redemption restored)
                                      └──respondBy passes─► kept
settlement: null → { statementId } (once; never changes)
```
**Departure:** `scheduled (on sale) ⇄ salesStopped` · `scheduled → scheduled + scheduleChange` (reschedule) · `scheduled → cancelled` (terminal; `cancellationJob pending → done`).
**Offer:** `active ⇄ paused` · `active → expired | exhausted` · `expired | exhausted → active` only when the creator extends `validTo` or raises the limit.
**Ticket (booking problem):** `open → answered | escalated | closed` · `escalated → answered` (supplier reply) · `answered → open` (traveller reply) · any non-closed → `closed`. **Ticket (statement query):** `open → resolved` (no change | adjustment).
**Statement:** created `ready → paid`. **Special request:** `pending → accepted | cannot` (once). **Sandbox:** `active → ended` (documents deleted).

**Edge cases (each has a test in the stage that builds it)**
- Two travellers pay for the last seat / last room / last redemption at once → exactly one succeeds; the other gets `INVENTORY_CHANGED` or `PRICE_CHANGED` (offer ended) and nothing is reserved.
- Price moves between details and payment (demand band crossed by another booking) → `PRICE_CHANGED`, no charge.
- Offer paused, expired or exhausted between apply and pay → `PRICE_CHANGED` with the reason.
- Discount larger than the eligible amount → capped at the eligible amount; total never negative; tax on the discounted base.
- Airline cancels a departure while a traveller is mid-checkout → payment returns "This flight was cancelled by the airline", nothing reserved.
- Airline cancels a departure with 180 bookings → batches of 50, `cancellationJob` progress saved after each batch; a crash mid-way is finished by the next request or the daily job; refunds and redemption restores are idempotent (a booking already cancelled is skipped).
- Reschedule made less than 24 h before the new departure → `respondBy` = new departure.
- Traveller cancels after a supplier reschedule within the window → full refund; after it → normal rule.
- Check-in at exactly 48 h / 60 min boundaries (IST, inclusive start, exclusive end); auto-assigned seats never collide with seats chosen concurrently (atomic `$nin`/`$push`).
- Duplicate names: "Ravi Kumar" vs " ravi  KUMAR " rejected; "Ravi Kumar" vs "Ravi Kumar Jr." accepted.
- Infants > adults, children without an adult, adults + children > 9 → rejected server-side.
- Supplier A requests supplier B's departure, booking, ticket, statement, offer or notification → 404 (never 403, so ids can't be probed).
- A manager edits a rate card mid-booking → existing bookings unchanged (frozen snapshot); new quotes use the new card.
- Template edited after booking → booking keeps its frozen terms.
- Booking completes on the last day of a month at 23:59 IST → counted in that month's statement, closed on the 1st.
- Commission changed mid-month → applies to the next statement created; existing statements keep their rate.
- Hotel stay ends → rooms returned exactly once even if the daily job runs twice.
- Sandbox user calls `/api/supplier/*` or `/api/admin/*` → 401 (sandbox cookie isn't a real session). A real manager calling `/api/sandbox/*` → 401.
- Sandbox cap reached / quota exceeded / per-IP limit → friendly 429/409 messages.
- Script-injection strings in every free-text field render as text.

## 12. Pricing Engine (pure functions in `server/services/pricing.js`)
All inputs come from the supplier's rate card; no I/O. Results are whole rupees.

**Variables:** `value(v, on) = v.mode === 'manual' ? v.value : v.value × (1 + v.growthPctPerYear/100) ^ (yearsSince(v.since, on))`.

**Flight fare (per adult/child):**
```
km        = great-circle distance(origin, destination)
override  = routeOverrides[origin→destination]
base      = override.fixedBase ?? (value(fixed) + value(perKm) × km) × airlineFactor
cabinBase = base × (cabin === 'business' ? businessMultiplier : 1) × (override.multiplier ?? 1)
season    = seasons matching the departure date (IST)
raw       = cabinBase × timeOfDay(departure) × (season ? season.x : dayOfWeek(departure))
                     × daysToDeparture(days between booking date and departure date, IST)
                     × demand(cabin.sold / cabin.capacity) × tier.x
price     = round50(clamp(raw, guardRails.floor × cabinBase, guardRails.ceiling × cabinBase))
```
Taxes = round(12% × (fare × payingTravellers − discount)). Infant fee ₹1,500 flat, untaxed, undiscounted. Seat fees and meal prices from the rate card/policies.

**Hotel night (per room):**
```
base   = baseRates[roomType]
raw    = base × (season(night) ? season.x : dayOfWeek(night)) × leadTime(days from booking date to check-in) × ratePlan.x
night  = round50(clamp(raw, floor × base, ceiling × base))
stay   = Σ nights × rooms;   breakfast = perGuest × guests × nights (room-only rooms, if added)
taxes  = taxesAndFees × rooms × nights     (fixed; unaffected by discounts)
```
**Aircraft catalogue:** a constant (`server/services/aircraft.js`) with the configurations in `prd.md` → Aircraft configurations: cabins, rows, seat letters, extra-legroom rows. Seat type: window = first/last letter; aisle = letters next to the aisle; middle otherwise; extra legroom by row.
**Engine version** is stored on each booking (`pricing.engineVersion`) so later formula changes are traceable.

## 13. Retention, Storage and Operations Budget
| Collection | Growth | Rule |
|---|---|---|
| flights (departures) | ~144/day | 60-day window; unbooked past departures pruned after 1 day |
| reviews | fixed | seeded only |
| bookings, payments | per booking | permanent (business records); synthetic history capped at 6 months |
| notifications | per event | TTL 90 days; ≤ 200 per user |
| auditlogs | per staff action | permanent, one entry per action (~1 KB) |
| events | per search/view/checkout | TTL 14 days; rolled up nightly |
| dailystats | 2/day | permanent (tiny) |
| tickets | per ticket | closed/resolved: TTL 1 year |
| statements, adjustments | ≤ 52/month | permanent |
| sandboxes + tagged docs | per visitor | 30 min idle / 2 h hard TTL; daily sweep |
| ratelimits | per window | TTL (existing) |

**Estimated size** (to be measured, not trusted): departures ~8,640 × ~0.9 KB ≈ 8 MB + indexes ≈ 2 MB; reviews ~1,000 docs (down from 6,945) ≈ 0.2 MB; history ~900 bookings + ~600 past departures ≈ 2 MB; 20 full sandboxes worst case ≈ 30 MB. Target: under 128 MB (25% of M0). **Measured baseline before Phase 2 (2026-10-08):** 6.5 MB data + 1.2 MB indexes (3,170 flights, 6,945 reviews, 48 hotels).
**Operations:** searches read one route-day of departures (indexed) plus one supplier rate-card fetch per airline (cached per request); analytics run bounded aggregations over indexed `createdAt` ranges (≤ 180 days); bulk cancellation uses `bulkWrite` batches of 50 and one `insertMany` for notifications per batch; no N+1 queries (suppliers and rate cards loaded once per request with `$in`).

## 14. Supplier Scoping and Sandbox Isolation
- **Scoping helper** (`scope(req)`) returns the base filter for every query: `{ sandboxId: req.sandboxId ?? null }` plus `{ supplierId: req.supplierId }` for managers or `{ userId }` for travellers. Controllers never build filters without it.
- **Guard plugin:** a Mongoose plugin on every sandboxable model throws if a find/update/delete/aggregate doesn't constrain `sandboxId` — so a forgotten filter fails loudly in tests instead of leaking data.
- **Sandbox session:** `POST /api/sandbox` checks `DEMO_MODE`, the per-IP limit and the global cap (20 active), then copies the chosen supplier (services + 7 days of departures, or the hotel), rate card, templates and commission config, and seeds ~40 bookings, 2 offers, 2 statements, 3 tickets and notifications — all tagged with the new `sandboxId` and `sandboxExpiresAt = now + 2 h`, inserted with `insertMany`. It creates a sandbox manager (or admin) user and a demo traveller (no passwords) and sets the sandbox cookie.
- **Routing:** the same routers are mounted under `/api/sandbox/supplier`, `/api/sandbox/admin` and `/api/sandbox/traveller` behind `sandboxAuth`, which sets `req.sandboxId` and the sandbox user; real routes reject the sandbox cookie and sandbox routes reject the real one.
- **Quotas:** enforced in the services that create documents (listings ≤ 20, bookings ≤ 50, docs ≤ 2,000, tracked in `Sandbox.counts`).
- **Deletion:** `DELETE /api/sandbox` deletes every document with that `sandboxId` (one `deleteMany` per collection); idle and hard expiry via TTL on `Sandbox` plus a partial TTL index on `sandboxExpiresAt` in every tagged collection; the daily job deletes orphans.

## 15. Phase 2 Stage Plan
Work on a `phase-2` branch; each stage is merged into it after review; `main` (and the live site) stays on Phase 1 until the end, then production is re-seeded. Each stage ends with tests, lint, a measured database size and a stop for review.

1. **Foundations** — roles and `Supplier`; 52 manager accounts + credentials file; scoping helper and guard plugin; audit log; notifications (bell + panel); aircraft catalogue; services → departures with the 60-day window and the consolidated daily job; reviews per service; hotel 60-day horizon, room return after check-out and the 5-stay cap; the Phase 1 admin inventory editor replaced by a basic supplier catalogue (services, departures stop/resume, hotel and rooms).
2. **Pricing** — engine, rate cards and editors with preview, cancellation templates (admin editor + supplier picks), commission config, re-pricing at payment with `PRICE_CHANGED`, hotel rate plans and breakfast, avg-per-night display, "Taxes" label and the "No convenience fee" promise.
3. **Traveller flight & documents** — cabin seat maps, meals by cabin, first/last names, infants, duplicate check, saved travellers, special requests (+ supplier replies, admin read-only list), PNR/e-ticket/voucher, web check-in and boarding passes.
4. **Supplier operations & support** — reservations/passenger lists, booking-reaches-supplier notifications, supplier cancel and reschedule with bulk refunds and receipts, reschedule response, hotel reservation cancellation, help tickets (traveller ↔ admin ↔ supplier), admin bookings list.
5. **Offers** — platform offers first (code, automatic, first-3), homepage section, Offers page and About this offer, checkout code and re-validation, redemption concurrency; then supplier offers and the kill switch; expiry in the daily job.
6. **Settlement** — statements, commission and funding split, queries and adjustments, mark as paid; 6-month synthetic history.
7. **Analytics** — funnel events and rollups, the admin dashboard.
8. **Visitor sandbox** — creation, isolation, quotas, demo traveller loop, deletion.
9. **QA and hand-over** — adversarial QA report for the new features, measured storage/operations, user guide per stakeholder; then merge to `main`, re-seed production, verify live. (The post-merge free-tier audit runs only after approval.)

## Implementation Deviations (recorded per AGENTS.md)
Changes made while building the MVP. Each is additive or a clarification; nothing in the original model was removed.

1. **Hotel `roomTypes[].cancellationPolicy`** uses `{ freeUntilDaysBeforeCheckIn, feeAfterCutoff }` instead of `{ freeUntilDate, feeAfterCutoff }`. A fixed date can't apply to every stay date; the concrete cutoff date is computed per booking (see #2). *(Phase 2: replaced by cancellation templates.)*
2. **Booking** gained:
   - `policySnapshot: { freeUntil, feeAfterCutoff }` — the cancellation terms frozen at booking time, used for the simulated refund (Decisions & Defaults #6), so later edits never change what the traveller agreed to.
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
   - Admin also had `GET /api/admin/flights[/:id]` and `GET /api/admin/hotels[/:id]` *(removed in Phase 2)*.
6. **Inventory is not per-date for hotels**: `roomsAvailable` is a single counter per room type (decremented on booking, restored on cancel — and, from Phase 2, after check-out). Flight seats are per flight document, since each flight is one dated departure.
7. **Folder structure** adds `server/services`, `server/utils`, `server/config`, `server/tests`, and `client/src/lib`.
8. **Password hashing** uses `bcryptjs` (pure-JS bcrypt, same algorithm and hash format) to avoid native build tooling on Windows.
9. **Rate limiting** — `POST /api/auth/register` and `/login` share a strict limit (30 requests / 15 min / IP). `GET /api/auth/me` and `/logout` use a separate, lenient limit (600 / 15 min), because the session check runs on every page load and must not lock users out. Counters are kept in MongoDB (see §8).
10. **Cancellation windows of 0** — a 0-hour/0-day window means *no* free-cancellation window: `policySnapshot.freeUntil` is `null` and the stated fee always applies. (Found in QA-2.)
11. **Concurrent duplicate payments** — if two requests with the same `idempotencyKey` race, the loser briefly polls (≤ 0.5 s) for the winner's booking and returns it (200) instead of a misleading "no longer available" error. Exactly one booking is ever created.
12. **Names** (traveller, guest, account) must be 2–80 characters of letters in any script plus spaces, apostrophes, hyphens and dots — digits and emoji are rejected with a friendly message (QA-2).
13. **Hotel search with a past check-in** returns no results (`pastDates: true`) so the UI can explain why.
14. **Seed flights** are dated departures for the next `SEED_DAYS` (default 21) days, kept full by the daily cron job. *(Phase 2: 60 days, materialised from services.)*

## Phase 2 Data-Model Changes (logged per AGENTS.md)
1. **User:** `role` gains `airline_manager` and `hotel_manager`; adds `supplierId`; `savedTravellers` becomes `{ firstName, lastName, ageCategory }` (≤ 20); adds `sandboxId`.
2. **New collections:** `suppliers`, `services`, `offers` (replaces the unused `coupons` stub, which is dropped), `cancellationtemplates`, `configs`, `notifications`, `auditlogs`, `tickets`, `statements`, `adjustments`, `events`, `dailystats`, `sandboxes`.
3. **Flight:** adds `supplierId`, `serviceId`, `date`, `aircraftConfig`, `cabins`, `status`, `salesStopped`, `scheduleChange`, `cancellationJob`, `checkInSeq`, `seatMap.blockedSeats`, sandbox fields; **removes** `fareOptions` (tiers, baggage and templates now come from the rate card), `mealOptions` (supplier policies) and `seatMap.rows/columns/seatPricing` (aircraft catalogue and rate card). Unique index `(serviceId, date)`.
4. **Hotel:** adds `supplierId`, `salesStopped`, `roomTypes[].roomsTotal`, `roomTypes[].salesStopped`, sandbox fields; **removes** `roomTypes[].price` (rate card) and `roomTypes[].cancellationPolicy` (templates).
5. **Review:** `itemType` `'flight'` becomes `'service'` (reviews per service).
6. **Booking:** adds `supplierId`, `pnr`, `selection.cabin`, `selection.ratePlan`, `selection.breakfast`, traveller `firstName`/`lastName`/`ticketNumber` and `ageCategory: 'infant'`, `specialRequest` (replaces per-traveller `specialRequests`), `fareBreakdown.infantFees`, `offer`, `pricing`, `policySnapshot.templateKey/templateName/nonRefundable`, `cancellation.by/reason/feeRetained/receiptNo/redemptionRestored`, `reschedule`, `checkIn`, `settlement`, `isSynthetic`, sandbox fields. Existing fields keep their meaning; `fareBreakdown.discounts` now holds the offer amount.
7. **Payment:** adds `sandboxId`.
8. **Every sandboxable collection** adds `sandboxId` (indexed) and `sandboxExpiresAt` (partial TTL index).

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
1. **Hosting:** a single Vercel project serves the static frontend and the Express API (as one Vercel Function) on one domain, with MongoDB Atlas as the database — see §2. Final.
2. **Auth storage:** JWT in an httpOnly cookie (not `localStorage`) — better XSS resistance, standard practice, acceptable added complexity for a learning project.
3. **JWT expiry:** 7 days, single token, no refresh-token rotation.
4. **Reviews:** seed-only, read-only through Phase 2 (matches `prd.md`).
5. **Hotel/destination photo sourcing:** since there's no photo API, curate a set of royalty-free high-resolution images (e.g. from Unsplash), **download and commit them into `/client/public/images/seed/`** rather than hot-linking external URLs — avoids link rot and rate limits. Add a `CREDITS.md` noting sources/licenses. Phase 2: this set is the preset gallery for hotel and offer photos (no uploads).
6. **Cancellation refund:** simulated, calculated from the terms frozen on the booking at booking time; no real money movement. Phase 2: terms come from platform templates; refunds use the amount actually paid; supplier cancellations refund in full.
7. **Single daily cron handler** (Phase 2): all scheduled work shares `/api/cron/daily` (one Hobby cron entry), each step idempotent and self-repairing.
8. **Notifications are polled**, not pushed: the client fetches the unread count on navigation and every 60 s while the tab is visible (one indexed count query) — no websockets.
9. **Charts are hand-written SVG** (no chart dependency) and the consoles are lazy-loaded, keeping traveller pages' bundle and Lighthouse scores unchanged.
