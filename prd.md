# Atlas — Product Requirements Document (prd.md)

*Source of truth for what Atlas does. `architecture.md` (system design), `design.md` (look, layout and placement) and `AGENTS.md` (how to work) follow this document. This file describes what each page contains and how it behaves; where things sit on screen is defined in `design.md` → Page-Level Layouts.*

## Problem
Existing Indian travel OTAs (MakeMyTrip, Yatra, Ixigo) are built around "conversion hacking": every screen stacks add-ons, coupons, insurance, and cross-sells on top of the user, creating cognitive overload and eroding trust for a one-time revenue bump. There's no clean, trustworthy alternative that respects the user's attention while still covering the full flight + hotel booking journey.

This project is a personal learning exercise: design and build a full-stack (MERN) travel booking web app end-to-end — from research to PRD to architecture to shipped, deployed code — without leaning on third-party booking/payment APIs.

## Goal
Build **Atlas**, a travel booking web app inspired by MakeMyTrip, Yatra, Ixigo and Agoda, where users can search flights and hotels, filter and compare results, and complete a booking (including flight seat/meal selection and hotel room selection) through a simulated payment flow. Users can create an account, view their bookings and cancel them. The app runs on MERN with seeded mock data, no third-party APIs, and is deployed publicly.

## Target Users / Segment
- **Primary:** Individual leisure/business travelers booking domestic flights and hotels between major Indian cities.
- **Secondary (internal):** An admin user who manages the mock flight/hotel inventory so the product can be demoed with realistic data.

*(Since this is a learning/portfolio project rather than a commercial one, "segment" is scoped for realism and demo value rather than actual market sizing.)*

## Coverage
- **Cities:** the 8 Tier-1 Indian cities — Delhi (DEL), Mumbai (BOM), Bengaluru (BLR), Hyderabad (HYD), Chennai (MAA), Kolkata (CCU), Pune (PNQ), Ahmedabad (AMD).
- **Flights:** one-way domestic flights between these cities from four airlines (IndiGo, Air India, Vistara, SpiceJet), several departures per route per day, bookable for the coming three weeks.
- **Hotels:** six hotels in each city (3★ to 5★), each with two or three room types.
- **Currency and time:** prices in Indian rupees (₹); dates and times in Indian Standard Time.

## Core Features (MVP)
- Homepage with **Flights** and **Hotels** search tabs (Flights is the default), featured destinations and best hotels
- Flight search, results with filters and sorting, and a flight details page with fare, seat and meal selection, a route map, baggage/cancellation terms and reviews
- Hotel search, results with filters and sorting, and a hotel details page with a full-screen photo viewer, room selection, reviews and similar stays
- Checkout: traveller/guest and contact details, then mock payment (UPI/QR or card)
- Booking confirmation with a booking reference
- Accounts: sign up, sign in, sign out
- My trips: upcoming and past bookings, cancellation with a simulated refund
- Admin area: create, edit and delete flights and hotels

## User Flow
```
Home (Flights/Hotels tab) → Search → Results (filter/sort) → Details (fare + seat + meal / room)
→ Sign in (if needed) → Traveller or guest details → Review and pay (mock) → Confirmation
```
Secondary flows: sign up / sign in, view trips, cancel a booking, admin inventory management.

Competitor screens and concept references behind this flow are in `docs/research/research-notes.md`.

---

## Page Requirements
What each page contains and how it behaves. Placement and visual treatment: `design.md` → Page-Level Layouts.

### Global (every page)
- **Header:** the Atlas logo/name (links to the homepage); **Destinations** and **Stays** links that go to those homepage sections from any page; **Sign in** when signed out; when signed in, **My trips**, a greeting with the user's first name, and **Sign out**; an **Admin** link for admin accounts only.
- **Footer:** the Atlas name and a line stating that all flights, hotels and payments are simulated.
- **Signed-in pages** (checkout, My trips, confirmation, admin) send signed-out visitors to Sign in and return them to where they were afterwards.
- **Unknown addresses** show a friendly "page not found" message with a link home.
- Every page has its own browser tab title.

### Homepage
- **Search** with two tabs, **Flights** (default) and **Hotels**. Switching tabs keeps what was already typed in the other tab and doesn't reload the page.
  - **Flights:** From and To (any of the 8 cities, with a control to swap them), departure date (today or later), number of travellers (1–9) and cabin class (Economy or Business).
  - **Hotels:** destination city, check-in and check-out dates, adults (1–12), children (0–6) and rooms (1–6).
  - The search button stays disabled until the form is valid, and the first problem is highlighted with a plain-language message (e.g. "Pick a destination different from your origin", "Check-out must be after check-in", "Each room needs at least one adult").
- **Featured destinations:** a photo and name for each city with a one-line description. Four are shown; **View all** reveals all eight and **Show fewer** collapses them again. Choosing a city opens hotel results for it (a stay starting a week out, two nights, two adults, one room).
- **Best hotels:** hotels that are 4★ or 5★ **and** have a guest rating of **4.0 or higher**, best-rated first. Four are shown; **View all** reveals up to the top ten. Each card shows the photo, stars, name, area, guest rating, review count, two highlight amenities and a "from" nightly price, and opens the hotel.
- **Editorial close:** a photo with a short brand quote, and three short promises — *Handpicked stays*, *One honest price*, *No upsell detours*.

### Flight results
- A summary of the search (route, date, travellers, cabin) with **Modify search**, which reopens the search form pre-filled.
- A result count, and one card per flight showing: airline, flight number, aircraft model, guest rating and review count (or "No reviews yet"), departure and arrival times with airport codes (marked "+1" if it arrives the next day), duration, stops ("Non-stop" or number of stops), the lowest price per traveller for the chosen cabin, and **View fares**. **The whole card opens the flight**; the button still behaves as a button.
- **Sort:** lowest price (default), shortest duration, earliest departure, highest rated.
- **Filters:** stops (non-stop / 1 stop or more), airlines (those present in the results), departure time (before 6 AM, 6 AM–12 PM, 12 PM–6 PM, after 6 PM), and a maximum price per traveller. Filters combine (AND), update the list without a page reload, and can be cleared at once.
- Only flights with enough seats for the travellers in the chosen cabin are listed.
- Results are paged (20 per page).
- **Empty states:** "No flights on this route that day" (with Modify search), "No flights match your filters" (with Clear filters), and "That date has already passed" for past dates.

### Flight details
- **Back** to the previous page (normally the results).
- **Header:** airline · flight number · aircraft model, and the route ("Delhi to Mumbai").
- **Schedule:** departure and arrival times, duration, non-stop/stops status, full airport names, travel day and date, guest rating and review count.
- **Route map:** an illustration of the route between the two cities, with the airports labelled.
- **Choose a fare:** selectable fare cards — Saver and Flexi in Economy; Business on airlines that offer it when Business is searched. Each shows price per traveller, cabin and check-in baggage, cancellation terms and date-change terms. A fare without enough seats for the party can't be chosen.
- **Pick your seats** (optional): a 30-row seat map (A–F) with a legend (available, selected, unavailable) and seat prices (window, aisle, middle). Taken seats can't be chosen. With several travellers, each traveller picks their own seat. A summary lists the chosen seats; if none are chosen, a seat is assigned at check-in.
- **Add a meal** (optional): one menu per traveller listing each meal as veg/non-veg with its price; the default is "No meal selected".
- **Baggage & cancellation:** repeats the chosen fare's baggage, cancellation and date-change terms.
- **Ratings & reviews:** average rating, number of reviews, the latest reviews (name, date, stars, comment) with **Show more reviews**; "No reviews yet" when there are none.
- **Price summary:** fare × travellers, taxes & fees, seat and meal charges (when chosen), the total, the cancellation terms, and **Continue** to checkout. Flights that have already departed can't be booked.

### Hotel results
- A summary of the stay (city, dates, guests, rooms) with **Modify search**.
- A result count, and one card per hotel showing: photo, star rating, name, area, guest rating and review count, up to four amenities, "Free cancellation" and "Breakfast included" badges where they apply, the lowest nightly price (before taxes) for rooms that fit the party, the number of nights, and **See rooms**. **The whole card opens the hotel** with the same stay details; the button still behaves as a button.
- **Sort:** recommended (default — best guest rating, then stars), price low to high, price high to low, guest rating.
- **Filters:** maximum price per night, star rating (3★/4★/5★), guest rating (any, 3.5+, 4.0+, 4.5+) and amenities (those available in the results — e.g. Free Wi-Fi, Air conditioning, 24-hour room service, Bar, Pet friendly, Spa, Swimming pool, Restaurant, Parking, Fitness centre, Airport shuttle, Business centre). Filters combine (AND) and can be cleared at once.
- Only hotels with a room type that can hold the whole party in the requested number of rooms are listed. Results are paged (20 per page).
- **Empty states:** "No stays available for those dates", "No stays match your filters" (with Clear filters), and "Those dates have already passed".

### Hotel details
- **Photo grid** of the hotel's photos (three). Clicking any photo opens a **full-screen photo viewer** on the same page (no new address, layout unchanged): previous/next arrows, a close button, a position counter ("2 / 3"), the arrow keys and a swipe on touch screens move between photos, and Escape or a click outside the photo closes it.
- **Header:** stars, name, address, guest rating and review count, and the stay dates and guest count.
- A short description of the hotel, and **Amenities**.
- **Choose your room:** every room type with its name, occupancy, bed type, room amenities, breakfast ("Breakfast included" or "Room only"), free-cancellation badge where applicable, cancellation terms, price per room per night plus taxes, a rooms selector and **Select**. Choosing more rooms than are left, or too few rooms for the party, shows an inline message.
- **Ratings & reviews:** as on the flight page.
- **Price summary:** price × rooms × nights, taxes & fees and the total, the room's cancellation terms, and **Reserve**. Until a valid room is selected the total shows "—" and Reserve is disabled.
- **Similar stays in {city}:** up to four other hotels in the same city that can host the same party, closest in star rating first, each priced for the **same dates, guests and rooms** and opening with those same stay details. Hidden when there are none.

### Checkout (two steps on one page, same address)
**Step 1 — details**
- **Flights ("Who's travelling?"):** for **every** traveller, full name (as on ID) and age group (Adult 12+ / Child 2–11).
- **Hotels ("Who's staying?"):** the lead guest's full name, and an optional **Special requests** box (up to 500 characters).
- **Contact details:** email and 10-digit mobile number, both required, pre-filled from the account where available.
- **Continue to payment** checks everything and moves to step 2.

**Step 2 — Review and pay**
- The travellers/guest (with seat and meal per traveller for flights) and contact details, with **Edit** to return to step 1.
- **Payment** with two tabs:
  - **UPI / QR:** a sample QR code, "Scan with any UPI app to pay ₹{total}", a note that it's a simulation, **Simulate payment** and **Simulate a failed payment**. Paying shows "Waiting for payment…".
  - **Card:** card number (16 digits), expiry (MM/YY, not in the past), CVV (3 digits) and name on card, with **Pay ₹{total}**. Checked for format only and never sent anywhere. A card number ending in **0002** simulates a decline. Paying shows "Processing payment…".
- A **failed payment** keeps the user on this page with "Your payment did not go through. No money was taken — please try again.", a **Try again** action, and the chosen method and card details kept. No booking is created.
- If the seat or room was taken by someone else in the meantime, the page explains it (e.g. "Seat 12A is no longer available.") and offers only **Choose again**.
- **Booking summary** (both steps):
  - **Flights:** route ("Delhi → Mumbai"); airline, flight number and fare type; day, date and departure time; base fare, taxes & fees, seats & meals (if any) and total.
  - **Hotels:** hotel name; room type, number of rooms and nights; stay dates; base price, taxes & fees and total; the cancellation terms.
- The in-progress checkout survives the sign-in redirect and a page refresh.

### Booking confirmation
- "Your trip is booked." (flights) or "Your stay is booked." (hotels), the contact email the confirmation goes to, and the **booking reference** (e.g. AT7P98PA).
- Trip summary: title and subtitle, status, departure/arrival (or check-in/check-out), travellers with seats and meals, free-cancellation deadline (or the fee that applies), base, taxes, seats & meals and the amount paid.
- **View my bookings** and **Back to home**.
- Refreshing never creates another booking; it is only visible to the account that made it (anyone else sees "Booking not found").

### My trips
- **Upcoming** and **Past & cancelled** groups. Each booking shows its type, reference, title, details, dates, status, amount paid, and — if cancelled — the simulated refund.
- **View details** opens the booking's confirmation page.
- **Cancel booking** (confirmed, future trips only) first shows the simulated refund, then cancels with **Yes, cancel booking** or keeps it with **Keep it**. The list updates immediately and confirms the refund amount.
- An empty state with a link to start searching when there are no trips.

### Sign up / Sign in
- **Sign up:** full name, email, password (at least 8 characters with a letter and a number) and an optional mobile number. Signs the user in straight away.
- **Sign in:** email and password; wrong details always show the same "Invalid email or password." message.
- Each links to the other, and both return the user to the page they came from.

### Admin (admin accounts only)
- **Flights** and **Hotels** tabs, a search box, and a paged list.
  - Flights list: flight, route, departure, lowest price — searchable by flight number, airline, city or airport code.
  - Hotels list: hotel, city, stars, lowest price — searchable by hotel name or city.
- **Add flight / Add hotel**, **Edit** and **Delete** on every entry.
  - **Flight form:** airline, flight number, aircraft, from/to, departure and arrival (IST), stops, one or more fares (type, price, seats, baggage, cancellation window and fee, date-change fee), meals, and seat map (rows, seats per row, seat prices, unavailable seats).
  - **Hotel form:** name, city, address, stars, description, amenities, photo paths, and one or more room types (name, occupancy, bed, amenities, breakfast, price, taxes, cancellation window and fee, rooms available).
- Required fields are checked with inline messages before saving; changes appear in traveller search immediately.
- Deleting asks for confirmation and is refused for items that have bookings.
- Non-admin accounts are turned away with "That area is for administrators only."

---

## Cross-page (global) requirements
- **Input rules:**
  - Names: 2–80 letters in any script, plus spaces, apostrophes, hyphens and dots (no digits or emoji).
  - Mobile numbers: 10 digits. Emails must be valid.
  - Messages appear under the field when it is left and say how to fix the problem.
  - The server re-checks everything the browser checks.
- **Prices:**
  - Always shown in ₹. Flight taxes & fees are 12% of the base fare; hotel taxes are per room per night.
  - The server recalculates every price at payment; prices sent by the browser are never trusted.
- **Booking integrity:**
  - A seat or the last room can never be sold twice.
  - Double-clicking Pay or Cancel, refreshing, or retrying never creates a duplicate booking or cancellation.
  - A declined payment never creates a booking.
- **Cancellation and refunds:**
  - Full refund before the fare's or room's free-cancellation deadline; otherwise the total minus the stated fee (never below zero).
  - A fare or room with no free-cancellation window always charges the fee.
  - Only confirmed bookings for trips that haven't started can be cancelled.
- **Privacy:** a user can only see and cancel their own bookings.
- **Sessions:** a sign-in lasts 7 days on that browser; repeated sign-in attempts are rate-limited.
- **Fresh inventory:** flights are always bookable for the coming three weeks.
- **States:** every list and page has loading, empty and error states; nothing ever shows a blank screen or a technical error.
- **Accessibility:**
  - Everything works with a keyboard, with a visible focus ring.
  - The seat map supports the arrow keys and announces each seat's number, position, price and availability.
  - Dialogs (filters on phones, cancel confirmation, photo viewer) keep focus inside and close with Escape.
- **Responsive:** every page works at phone (~375px), tablet (~768px) and laptop (~1280px+) widths.

## User Stories & Acceptance Criteria
Full coverage of every MVP feature — `AGENTS.md`'s Definition of Done checks a feature against the acceptance criteria for its story here, so every MVP story has one.

| # | Story | Acceptance Criteria |
|---|---|---|
| 1 | As a traveler, I want the home page to default to the Flights tab, so I land on the most common action first. | Home page loads with Flights tab visually active and its search form shown. Clicking "Hotels" switches the form and URL/state without a full page reload; clicking back to "Flights" restores it with any values already entered. |
| 2 | As a traveler, I want to search flights between two cities on a date, so I can see available options. | Given valid origin, destination, and date, results list shows all matching flights sorted by price by default. Given no matches, an empty state with a clear message and a "modify search" action is shown. Given missing or invalid fields, the search button stays disabled and the first invalid field is highlighted. |
| 3 | As a traveler, I want to search hotels by destination and dates, so I can see available stays. | Given a valid city and check-in/check-out dates, results show matching hotels sorted by recommendation (guest rating, then stars) by default. Check-out on or before check-in is blocked client-side with an inline error. |
| 4 | As a traveler, I want to filter and sort flight/hotel results, so I can narrow down to what fits me. | Applying a filter updates the result count and list without a full page reload. Multiple filters combine with AND logic. Sort options (flights: price, duration, departure, rating; hotels: recommended, price both ways, guest rating) reorder the list correctly. Clearing filters restores the full result set. |
| 5 | As a traveler, I want to pick a fare type, seat, and meal when booking a flight, so my preferences and total price are accurate. | Fare-type selection updates the displayed price and baggage/cancellation terms. Seat map shows unavailable seats as disabled/unselectable and updates the price summary with any seat surcharge. Meal selection is optional and, if skipped, defaults to "no meal selected" without blocking checkout. |
| 6 | As a traveler, I want to pick a room type when booking a hotel, so my stay matches what I need. | Each room type shows occupancy, bed type, amenities, price, and cancellation terms. Selecting a room type carries its price and policy into checkout. Selecting more rooms than available, or too few for the party, is blocked with an inline message. |
| 7 | As a traveler, I want to see ratings and reviews on a flight/hotel, so I can judge quality before booking. | Detail page shows an average rating, review count, and the latest written reviews with "Show more reviews". If an item has no reviews, the section shows a neutral "No reviews yet" state rather than an error or blank space. |
| 8 | As a traveler, I want to enter passenger/guest details, so my booking has the right names and contact info. | Flights require a full name and age group for every traveller; hotels require the lead guest's full name. Email and mobile are both required and validated for format before continuing. The hotel special-requests box is optional. |
| 9 | As a traveler, I want to pay with a mock UPI/QR or card flow, so I can complete a booking without real payment risk. | Selecting UPI shows a sample QR + simulated "waiting for payment" state; selecting Card shows a standard card form with client-side format validation only. Submitting always resolves to a success or failure state within a few seconds and never calls a real payment processor. A failed attempt shows a clear retry action, keeps the entered payment details, and does not create a booking. |
| 10 | As a traveler, I want a confirmation page after a successful payment, so I know my trip is booked. | Confirmation page shows a unique booking reference, a summary of the trip/stay, and links to "View my bookings" and "Back to home." Refreshing the confirmation page does not create a duplicate booking. |
| 11 | As a traveler, I want to sign up and log in, so my bookings are saved to my account. | Signup requires a unique email and a password of at least 8 characters with a letter and a number; duplicate email registration is rejected with a clear message. Login with correct credentials establishes a session (cookie); incorrect credentials show a generic "invalid email or password" error (no user enumeration). Logout clears the session and protected pages redirect to login. |
| 12 | As a traveler, I want to view and cancel my bookings, so I stay in control of my trips. | My trips lists all bookings for the logged-in user, grouped into upcoming and past & cancelled, with status and key details. Cancel is only available on bookings with status "confirmed" and a future date, and shows the simulated refund before confirming. Cancelling updates status to "cancelled," calculates the refund per the booking's cancellation policy (see Decisions & Defaults), and is reflected immediately without a page reload. |
| 13 | As an admin, I want to log in to an admin-only area, so I can manage inventory separately from regular traveler accounts. | Non-admin users attempting to access an admin route receive a 403 and are redirected away with a notice; admin users see an admin-only navigation entry after login. |
| 14 | As an admin, I want to add/edit/remove mock flights, so I can keep demo flight data fresh. | Create requires all required Flight fields (see `architecture.md`) before saving; validation errors are shown inline. Edit and delete immediately reflect in traveler-facing search results. Deleting a flight that has existing bookings is blocked with a clear message rather than silently orphaning bookings. |
| 15 | As an admin, I want to add/edit/remove mock hotels, so I can keep demo hotel data fresh. | Same acceptance pattern as flights (#14), applied to Hotel and its room types. |
| 16 | As a traveler, I want to click anywhere on a flight or hotel result card to open it, so I don't have to aim for the small button. | Clicking anywhere on a result card opens that flight's or hotel's detail page with the same search details (travellers and cabin, or stay dates and guests). Hovering the card enlarges it slightly and shows the card's button in its hover state. Clicking the button itself still feels like pressing the button, and keyboard users reach the card through that one button (no extra tab stops). |
| 17 | As a traveler, I want to open hotel photos full-screen, so I can look at them properly before booking. | Clicking any photo in the hotel's photo grid opens a full-screen overlay showing that photo, without leaving the page or changing the page layout. The overlay has previous/next arrow buttons, a close (X) button, and a position counter (e.g. "2 / 3"). It closes on Escape or a click outside the photo; the left/right arrow keys move between photos; on touch screens a horizontal swipe moves between photos. No new buttons or indicators are added to the page itself. |
| 18 | As a traveler, I want to see similar stays on a hotel page, so I can compare alternatives without starting a new search. | A "Similar stays in {city}" section appears after Ratings & reviews. It lists up to 4 other hotels in the same city that can host the same party, excluding the current hotel. Each card's price is for the same check-in/check-out dates, guests and rooms the traveler is currently viewing, and opening a card keeps those same stay details. If there are no other matching hotels, the section is not shown. |
| 19 | As a traveler, I want the homepage to highlight the best hotels, so I can find a great stay quickly. | A "Best hotels" section appears after Featured destinations, listing hotels that have both a high star rating (4★ or 5★) and a guest rating of 4.0 or above, best-rated first. Four are shown, and "View all" reveals up to the top ten (hidden when four or fewer qualify). Each card opens that hotel. The "Stays" link in the navigation goes to this section from any page. If no hotel qualifies, the section is not shown. |
| 20 | As a traveler, I want to browse all destinations from the homepage, so I can start a hotel search from a city I like. | Featured destinations shows four cities with photo, name and a short description; "View all" reveals all eight and "Show fewer" collapses them. Choosing a city opens hotel results for that city with a default stay. The "Destinations" link in the navigation goes to this section from any page. |

## Functional Requirements
- Search flights by origin, destination, departure date, travellers and cabin class
- Search hotels by destination, check-in/out dates, adults, children and rooms
- Filter and sort results (flights: stops, airline, departure time, maximum price; hotels: maximum price, star rating, guest rating, amenities)
- View flight details: fare options, route map, baggage, seat map, meal options, cancellation terms, reviews
- View hotel details: photos with a full-screen viewer, amenities, room types, cancellation terms, reviews, similar stays
- Capture traveller details (flights) / lead-guest details and special requests (hotels), plus contact details
- Simulate payment via mock UPI/QR and card UI, including declines and retries
- Generate a booking confirmation with a unique reference number
- User registration, login, logout, session persistence
- My trips: list, view detail, cancel (with simulated refund calculation)
- Admin: authenticate as admin, search, create, edit and delete flights and hotels
- Homepage discovery: featured destinations and best hotels, each with "View all"

## Non-Functional Requirements
- **Security:** password hashing (bcrypt), input validation on all forms (client and server), role-based access control for admin routes, rate-limited sign-in, secrets kept in environment variables (never committed)
- **Performance:** Lighthouse ≥ 80 on key pages; paginated or limited result sets to avoid over-fetching
- **Responsiveness:** usable layouts at phone (~375px), tablet (~768px), and laptop (~1280px+) widths
- **Accessibility:** semantic HTML, sufficient color contrast, visible focus states, keyboard-navigable forms, filters, seat map and dialogs
- **Reliability:** graceful handling of empty search results, past dates, sold-out seats/rooms and simulated payment failures (no blank screens or unhandled errors); no duplicate bookings under double-submits or concurrent purchases
- **Maintainability:** consistent code conventions across client/server (see `AGENTS.md`)

## Success Metrics
Since this isn't a commercial launch, success is measured by engineering/UX benchmarks rather than revenue:
- 100% of MVP user stories (above) demoable end-to-end with no unhandled errors
- Lighthouse scores ≥ 80 for Performance, Accessibility, and Best Practices on the home, results, and detail pages
- Core Web Vitals on those pages: LCP < 2.5s, CLS < 0.1
- Zero critical console errors or unhandled promise rejections during a full booking walkthrough
- Successful public deployment reachable via a single URL
- A first-time user can go from home page to booking confirmation without external help (informal usability check)

## Out of Scope
- Real payment processing or any real payment gateway integration
- Live/real-time flight or hotel inventory and pricing
- Any third-party travel APIs (including maps — the route map is an illustration)
- Round-trip and multi-city flights; special fares (student, armed forces, senior citizen…)
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

## MVP Prioritization (MoSCoW) & Phases

**Phase 1 — Must (MVP)**
Homepage (search tabs, featured destinations, best hotels), flight and hotel search, results + filters/sorting, flight fare + seat + meal selection with route map, hotel room selection with photo viewer and similar stays, reviews & ratings display, traveller/guest details, mock payment (UPI/QR + card), confirmation, auth, My trips (view + cancel), admin CRUD for flights/hotels.

**Phase 2 — Should**
Coupons/offers, wishlists/saved items.

**Phase 3 — Could**
Price alerts, user-submitted reviews (vs. seeded-only), round-trip flights, richer admin analytics/dashboard.

## Assumptions, Constraints, Risks
- **Constraint:** No third-party APIs — all flight/hotel/payment data is mocked and seeded.
- **Constraint:** Hosting is Vercel's free Hobby plan (frontend and API on one domain) with MongoDB Atlas's free tier as the database. The Hobby plan is for personal, non-commercial use, which fits this learning project; its usage limits are far above what a portfolio demo needs.
- **Assumption:** The demo always has flights to book: flights cover the coming three weeks, and a daily scheduled job keeps that window full (see `architecture.md` §7).
- **Assumption:** Hotel availability is a count of rooms per room type, not per date (see `architecture.md` → Implementation Deviations).
- **Risk:** The first request after a quiet period can take a second or two longer while the server starts up.
- **Risk:** Scoping both flights *and* hotels (rather than one vertical) roughly doubles the surface area of the MVP; timeline should account for this.
- **Risk:** Seat-map and meal-selection UI is one of the more complex pieces of the flight flow and may take longer than a typical CRUD screen.

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
These were flagged as open questions; each now has a default decision so nothing here blocks the agent. Revisit any of them in review if a different call is wanted — they're defaults, not permanent constraints.

1. **User-submitted reviews:** Out of MVP. Reviews are seed-data-only and read-only through Phase 2; user submission is a Phase 3 "could."
2. **Cancellation refund simulation:** Cancelling a booking calculates a *simulated* refund based on the cancellation policy attached to the booking's fare option (flights) or room type (hotel) at the time of booking — full refund if cancelled before the policy's free-cancellation cutoff, refund minus the stated cancellation fee if after (or always, when the policy has no free window). No real money moves; this is a displayed number only.
3. **Admin panel structure:** A protected section of the same app (routes under `/admin`, gated by role), not a separate mini-app — simpler to build and deploy for MVP scope.
4. **Seed flight seat map size:** Standard narrow-body layout, 3-3 economy configuration, rows 1–30 (≈180 seats), a handful marked unavailable per flight for realism.
5. **Payment outcome:** the user chooses success or failure ("Simulate payment" / "Simulate a failed payment"; a card number ending in 0002 declines). A successful payment leads straight to the booking confirmation.

## Glossary
- **OTA (Online Travel Agency):** A company that sells travel services (flights, hotels) from multiple providers through one platform, e.g. MakeMyTrip, Booking.com.
- **PNR (Passenger Name Record):** The unique booking reference for a flight itinerary. Atlas shows a booking reference (e.g. AT7P98PA) for flights and hotels alike.
- **Fare class:** A pricing/service tier for the same flight (e.g. Saver, Flexi, Business).
- **Taxes & convenience fee:** Additional charges added to the base fare at checkout.
- **Cancellation policy:** The rules and fees that apply if a booking is cancelled, often time-sensitive (e.g. free before a cutoff, fee after).
- **One-way vs. round-trip:** A single-direction booking vs. an outbound + return booking. Atlas supports one-way.
- **Lead guest:** The person a hotel booking is made under.
