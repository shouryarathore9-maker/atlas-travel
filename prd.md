# Atlas — Product Requirements Document (prd.md)

## Problem
Existing Indian travel OTAs (MakeMyTrip, Yatra, Ixigo) are built around "conversion hacking": every screen stacks add-ons, coupons, insurance, and cross-sells on top of the user, creating cognitive overload and eroding trust for a one-time revenue bump. There's no clean, trustworthy alternative that respects the user's attention while still covering the full flight + hotel booking journey.

This project is a personal learning exercise: design and build a full-stack (MERN) travel booking web app end-to-end — from research to PRD to architecture to shipped, deployed code — without leaning on third-party booking/payment APIs.

## Goal
Build **Atlas**, a travel booking web app inspired by MakeMyTrip, Yatra, Ixigo, and Agoda/Booking.com, where users can search flights and hotels, filter and compare results, and complete a booking (including flight seat/meal selection and hotel room selection) through a simulated payment flow. Users can create an account and view booking history. The app runs on MERN with seeded mock data, no third-party APIs, and is deployed publicly at the end.

## Target Users / Segment
- **Primary:** Individual leisure/business travelers booking domestic flights and hotels between major Indian cities.
- **Secondary (internal):** An admin user who manages the mock flight/hotel inventory so the product can be demoed with realistic data.

*(Since this is a learning/portfolio project rather than a commercial one, "segment" is scoped for realism and demo value rather than actual market sizing.)*

## Core Features (MVP)
- Home page with **Flights** and **Hotels** tabs (Flights is the default, matching MMT/Booking.com convention)
- Search form per vertical (flights: origin/destination/dates/travellers/cabin; hotels: destination/dates/occupancy)
- Results list with filters (price, stops/rating, timing, amenities, etc.) and sorting
- Flight detail: fare-type selection, **seat selection**, **meal selection**
- Hotel detail: room-type selection
- **Reviews & ratings** shown on both flight and hotel detail pages
- Passenger / guest details form
- Mock payment (fake UPI/QR + card screen, styled like a standard Indian checkout)
- Booking confirmation page with a booking reference
- User authentication (signup/login/logout)
- My Bookings (view booking history, cancel a booking)
- Admin panel (manage mock flights/hotels/inventory)

## User Flow
Generalized MVP flow:
```
Home (Flights/Hotels tab) → Search → Results (filter/sort) → Select (fare+seat+meal / room)
→ Passenger or Guest Details → Review → Pay (mock) → Confirmation
```
Secondary flows: Sign up / Log in, Cancel a booking (from My Bookings), View past bookings.

See `research-notes.md` / prior conversation for the full step-by-step breakdown captured from MakeMyTrip and Booking.com screens.

## Requirements
See **Functional** and **Non-Functional Requirements** sections below (kept separate per project convention).

## Success Metrics
Since this isn't a commercial launch, success is measured by engineering/UX benchmarks rather than revenue:
- 100% of MVP user stories (below) demoable end-to-end with no unhandled errors
- Lighthouse scores ≥ 90 for Performance, Accessibility, and Best Practices on the home, results, and detail pages
- Core Web Vitals on those pages: LCP < 2.5s, CLS < 0.1
- Zero critical console errors or unhandled promise rejections during a full booking walkthrough
- Successful public deployment reachable via a single URL
- A first-time user can go from home page to booking confirmation without external help (informal usability check)

## Out of Scope
- Real payment processing or any real payment gateway integration
- Live/real-time flight or hotel inventory and pricing
- Any third-party travel APIs
- GST / business billing details
- Upsell add-ons: travel insurance, cab/car-rental cross-sell, "price drop protection"
- Price alerts, wishlists, coupons/offers *(deferred — see MVP Prioritization)*
- User-submitted reviews *(deferred — see Decisions & Defaults; reviews are seeded/read-only in MVP)*

## User Personas
**1. Priya, 29 — Frequent Short-Trip Flyer**
Marketing executive who books domestic flights every few weeks. Wants to search, compare, and book in minutes without being funneled through insurance/upsell prompts.

**2. Rohan, 35 — Family Vacation Planner**
Plans 1–2 family hotel trips a year. Reads reviews and room details carefully before booking; needs clear photos, amenities, and cancellation terms.

**3. Admin (internal) — Inventory Manager**
Not a real customer; a stand-in for "whoever demos this project." Needs a simple way to add/edit/remove mock flights and hotels without touching the database directly.

### User Stories & Acceptance Criteria
Full coverage of every MVP feature — `agent.md`'s Definition of Done checks a feature against the acceptance criteria for its story here, so every MVP story has one.

| # | Story | Acceptance Criteria |
|---|---|---|
| 1 | As a traveler, I want the home page to default to the Flights tab, so I land on the most common action first. | Home page loads with Flights tab visually active and its search form shown. Clicking "Hotels" switches the form and URL/state without a full page reload; clicking back to "Flights" restores it. |
| 2 | As a traveler, I want to search flights between two cities on a date, so I can see available options. | Given valid origin, destination, and date, results list shows all matching seeded flights sorted by price by default. Given no matches, an empty state with a clear message and a "modify search" action is shown. Given missing required fields, the search button stays disabled and the first invalid field is highlighted. |
| 3 | As a traveler, I want to search hotels by destination and dates, so I can see available stays. | Given a valid city and check-in/check-out dates, results show matching seeded hotels sorted by relevance/price by default. Check-out date before check-in date is blocked client-side with an inline error. |
| 4 | As a traveler, I want to filter and sort flight/hotel results, so I can narrow down to what fits me. | Applying a filter updates the result count and list without a full page reload. Multiple filters combine with AND logic. Sort options (price, rating, duration) reorder the list correctly. Clearing filters restores the full result set. |
| 5 | As a traveler, I want to pick a fare type, seat, and meal when booking a flight, so my preferences and total price are accurate. | Fare-type selection updates the displayed price and baggage/cancellation terms. Seat map shows unavailable seats as disabled/unselectable and updates the fare summary with any seat surcharge. Meal selection is optional and, if skipped, defaults to "no meal selected" without blocking checkout. |
| 6 | As a traveler, I want to pick a room type when booking a hotel, so my stay matches what I need. | Each room type shows occupancy, bed type, amenities, price, and cancellation terms. Selecting a room type carries its price and policy into the guest-details step. Selecting more rooms/guests than available is blocked with an inline message. |
| 7 | As a traveler, I want to see ratings and reviews on a flight/hotel, so I can judge quality before booking. | Detail page shows an average rating, review count, and at least the first few written reviews, sourced from seed data. If an item has zero seeded reviews, the section shows a neutral "No reviews yet" state rather than an error or blank space. |
| 8 | As a traveler, I want to enter passenger/guest details, so my booking has the right names and contact info. | Form requires at least one traveller/guest with name and age category; contact fields (mobile, email) are validated for format before continuing. Optional fields (GST/state for flights, special requests for hotels) can be left blank without blocking submission. |
| 9 | As a traveler, I want to pay with a mock UPI/QR or card flow, so I can complete a booking without real payment risk. | Selecting UPI shows a fake QR + simulated "waiting for payment" state; selecting Card shows a standard card form with client-side format validation only. Submitting always resolves to a success or failure state within a few seconds and never calls a real payment processor. A failed attempt shows a clear retry action; it does not create a confirmed booking. |
| 10 | As a traveler, I want a confirmation page after a successful payment, so I know my trip is booked. | Confirmation page shows a unique booking reference, a summary of the trip/stay, and links to "View my bookings" and "Back to home." Refreshing the confirmation page does not create a duplicate booking. |
| 11 | As a traveler, I want to sign up and log in, so my bookings are saved to my account. | Signup requires a unique email and a password meeting a minimum strength rule; duplicate email registration is rejected with a clear message. Login with correct credentials establishes a session (cookie); incorrect credentials show a generic "invalid email or password" error (no user enumeration). Logout clears the session and protected pages redirect to login. |
| 12 | As a traveler, I want to view and cancel my past bookings, so I stay in control of my trips. | My Bookings lists all bookings for the logged-in user with status and key details. Cancel is only available on bookings with status "confirmed" and a future date. Cancelling updates status to "cancelled," calculates a simulated refund per the item's cancellation policy (see Decisions & Defaults), and is reflected immediately without a page reload. |
| 13 | As an admin, I want to log in to an admin-only area, so I can manage inventory separately from regular traveler accounts. | Non-admin users attempting to access an admin route receive a 403 and are redirected away; admin users see an admin-only navigation entry after login. |
| 14 | As an admin, I want to add/edit/remove mock flights, so I can keep demo flight data fresh. | Create requires all required Flight fields (see `architecture.md`) before saving; validation errors are shown inline. Edit and delete immediately reflect in traveler-facing search results. Deleting a flight that has existing bookings is blocked with a clear message rather than silently orphaning bookings. |
| 15 | As an admin, I want to add/edit/remove mock hotels, so I can keep demo hotel data fresh. | Same acceptance pattern as flights (#14), applied to Hotel and its room types. |

## Functional Requirements
- Search flights by origin, destination, date(s), travellers, cabin class
- Search hotels by destination, check-in/out dates, occupancy
- Filter and sort results (flights: stops, airline, timing, price; hotels: price, star rating, review score, amenities)
- View flight detail: fare options, baggage, seat map, meal options, cancellation terms, reviews
- View hotel detail: room types, amenities, photos, cancellation terms, reviews
- Capture passenger details (flights) / guest details (hotels)
- Simulate payment via mock UPI/QR and card UI
- Generate a booking confirmation with a unique reference number
- User registration, login, logout, session persistence
- My Bookings: list, view detail, cancel (with simulated refund calculation)
- Admin: authenticate as admin, CRUD flights and hotels

## Non-Functional Requirements
- **Security:** password hashing (bcrypt), input validation on all forms, role-based access control for admin routes, secrets kept in environment variables (never committed)
- **Performance:** Lighthouse ≥ 90 on key pages; paginated or limited result sets to avoid over-fetching
- **Responsiveness:** usable layouts at phone (~375px), tablet (~768px), and laptop (~1440px) widths
- **Accessibility:** semantic HTML, sufficient color contrast, visible focus states, keyboard-navigable forms and filters
- **Reliability:** graceful handling of empty search results and simulated payment failures (no blank screens or unhandled errors)
- **Maintainability:** consistent code conventions across client/server (see `AGENTS.md`)

## MVP Prioritization (MoSCoW) & Phases

**Phase 1 — Must (MVP)**
Home with Flights/Hotels tabs, search, results + filters/sorting, flight fare+seat+meal selection, hotel room selection, reviews & ratings display, passenger/guest details, mock payment (UPI/QR + card), confirmation, auth, My Bookings (view + cancel), admin CRUD for flights/hotels.

**Phase 2 — Should**
Coupons/offers, wishlists/saved items.

**Phase 3 — Could**
Price alerts, user-submitted reviews (vs. seeded-only), richer admin analytics/dashboard.

## Assumptions, Constraints, Risks
- **Constraint:** No third-party APIs — all flight/hotel/payment data is mocked and seeded.
- **Risk:** Scoping both flights *and* hotels (rather than one vertical) roughly doubles the surface area of the MVP; timeline should account for this.
- **Risk:** Seat-map and meal-selection UI is one of the more complex pieces of the flight flow and may take longer than a typical CRUD screen.

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
These were flagged as open questions; each now has a default decision so nothing here blocks the agent. Revisit any of them in review if a different call is wanted — they're defaults, not permanent constraints.

1. **User-submitted reviews:** Out of MVP. Reviews are seed-data-only and read-only through Phase 2; user submission is a Phase 3 "could."
2. **Cancellation refund simulation:** Cancelling a booking calculates a *simulated* refund based on the cancellation policy attached to the booking's fare option (flights) or room type (hotel) at the time of booking — e.g. full refund if cancelled before the policy's free-cancellation cutoff, refund minus the stated cancellation fee if after. No real money moves; this is a displayed number only.
3. **Admin panel structure:** A protected section of the same app (routes under `/admin`, gated by role), not a separate mini-app — simpler to build and deploy for MVP scope.
4. **Seed flight seat map size:** Standard narrow-body layout, 3-3 economy configuration, rows 1–30 (≈180 seats), a handful marked unavailable per flight for realism.

## Glossary
- **OTA (Online Travel Agency):** A company that sells travel services (flights, hotels) from multiple providers through one platform, e.g. MakeMyTrip, Booking.com.
- **PNR (Passenger Name Record):** The unique booking reference for a flight itinerary.
- **Fare class:** A pricing/service tier for the same flight (e.g. Saver, Flexi, Business).
- **Taxes & convenience fee:** Additional charges added to the base fare at checkout.
- **Cancellation policy:** The rules and fees that apply if a booking is cancelled, often time-sensitive (e.g. free before a cutoff, fee after).
- **One-way vs. round-trip:** A single-direction booking vs. an outbound + return booking.
