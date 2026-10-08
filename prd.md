# Atlas — Product Requirements Document (prd.md)

*Source of truth for what Atlas does. `architecture.md` (system design), `design.md` (look, layout and placement) and `AGENTS.md` (how to work) follow this document. This file describes what each page contains and how it behaves; where things sit on screen is defined in `design.md` → Page-Level Layouts.*

*Phase 2 (the marketplace: suppliers, pricing engine, offers, settlement, analytics, sandbox) was specified in `docs/specs/stakeholders-roles-workflows-v4.md` and is written into this file. Where the two differ, this file records the decision that was taken (see Decisions & Defaults → Phase 2).*

## Problem
Existing Indian travel OTAs (MakeMyTrip, Yatra, Ixigo) are built around "conversion hacking": every screen stacks add-ons, coupons, insurance, and cross-sells on top of the user, creating cognitive overload and eroding trust for a one-time revenue bump. There's no clean, trustworthy alternative that respects the user's attention while still covering the full flight + hotel booking journey.

The first build (Phase 1) covered only the traveller. A real OTA is a marketplace: suppliers (airlines, hotels) own inventory, prices and policies; the platform owns discovery, booking, payment, tickets and oversight. Phase 2 adds the supplier side and the platform side, so Atlas behaves like a small but honest marketplace.

This project is a personal learning exercise: design and build a full-stack (MERN) travel booking web app end-to-end — from research to PRD to architecture to shipped, deployed code — without leaning on third-party booking/payment APIs.

## Goal
Build **Atlas**, a travel booking web app inspired by MakeMyTrip, Yatra, Ixigo and Agoda, where users can search flights and hotels, filter and compare results, and complete a booking (including flight seat/meal selection and hotel room selection) through a simulated payment flow. Users can create an account, view their bookings and cancel them. Airlines and hotels run their own inventory, prices, offers and policies; the platform admin oversees tickets, analytics, commission, offers, settlement and the audit trail. The app runs on MERN with seeded mock data, no third-party APIs, and is deployed publicly.

## Stakeholders
| Stakeholder | Who they are | Account |
|---|---|---|
| **Visitor** (signed out) | Browses, searches, reads reviews and offers. Cannot book. Can open a throwaway sandbox of a supplier or admin console from the footer. | none |
| **Traveller / booker** | Books and pays, manages trips, applies offers, checks in, asks for help. The booker may differ from the travellers. | `traveler` |
| **Airline manager** | Runs one airline: services and departures, aircraft, fares (through the rate card), seat fees, meals, baggage, offers for its own flights, settlement queries. | `airline_manager` (one per airline, 4) |
| **Hotel manager** | Runs one hotel: room types, rates (through the rate card), availability, offers for its own hotel, settlement queries. | `hotel_manager` (one per hotel, 48) |
| **Platform admin** | Oversees the platform: analytics, all bookings (read-only), tickets, special requests (read-only), commission, cancellation templates, platform offers and the offer kill switch, settlement, audit log. **Does not** run supplier inventory, prices or refunds. | `admin` |

**System actors (simulated, no login):** the mock payment gateway, the in-app notification service, and the daily scheduler. Support and Finance are sections of the admin console, not separate roles. Suppliers are assumed already onboarded and verified; their catalogues start from seed data and their managers can edit them.

## Coverage
- **Cities:** the 8 Tier-1 Indian cities — Delhi (DEL), Mumbai (BOM), Bengaluru (BLR), Hyderabad (HYD), Chennai (MAA), Kolkata (CCU), Pune (PNQ), Ahmedabad (AMD).
- **Flights:** one-way domestic flights between these cities from four airlines (IndiGo, Air India, Vistara, SpiceJet), several departures per route per day, bookable up to **60 days** ahead.
- **Hotels:** six hotels in each city (3★ to 5★), each with two or three room types, bookable for stays starting up to **60 days** ahead.
- **Currency and time:** prices in Indian rupees (₹), whole rupees; dates and times in Indian Standard Time.

## Core Features
**Phase 1 — MVP (shipped)**
- Homepage with **Flights** and **Hotels** search tabs (Flights is the default), featured destinations and best hotels
- Flight search, results with filters and sorting, and a flight details page with fare, seat and meal selection, a route map, baggage/cancellation terms and reviews
- Hotel search, results with filters and sorting, and a hotel details page with a full-screen photo viewer, room selection, reviews and similar stays
- Checkout: traveller/guest and contact details, then mock payment (UPI/QR or card)
- Booking confirmation with a booking reference
- Accounts: sign up, sign in, sign out
- My trips: upcoming and past bookings, cancellation with a simulated refund

**Phase 2 — Marketplace (this release)**
- **Supplier consoles** for airline and hotel managers: overview, catalogue, pricing inputs (rate card), policies, reservations/passenger lists, special requests, offers, settlement statements
- **Admin console** becomes oversight: analytics dashboard, all bookings, tickets, special requests, offers (platform offers + kill switch), commission, cancellation templates, platform pricing limits, supplier suspension, settlement, audit log. The Phase 1 admin inventory editor is removed (inventory moves to the managers).
- **Rules-based pricing engine** with one rate card per airline and per hotel; prices are never typed per flight or room
- **Platform cancellation templates** that fare tiers and rate plans pick from
- **Supplier-initiated cancellations and reschedules** with automatic full refunds, receipts and notifications
- **Seat maps by aircraft configuration and cabin; meal menus by cabin**
- **Passenger details:** first/last names, adults/children/infants, duplicate-name check, saved travellers
- **Offers:** homepage "Offers available today", an offers page, "About this offer" pages, a code field at checkout, automatic festival offers, first-3-bookings offers; platform-funded and supplier-funded
- **E-ticket** (flights) and **voucher** (hotels); **web check-in** with a **boarding pass**
- **Special requests** (flights and hotels) with supplier replies; **help tickets** for booking problems
- **In-app notifications** for every signed-in user
- **Settlement statements** per supplier per month, with queries, adjustments and mark-as-paid
- **Audit log** of every staff action
- **Visitor sandbox** ("Try as airline manager / hotel manager / Atlas admin") that never touches live data

## User Flow
```
Home (Flights/Hotels tab) → Search → Results (filter/sort) → Details (fare + seat + meal / room + rate plan)
→ Sign in (if needed) → Traveller or guest details → Review (offer code) and pay (mock) → Confirmation (e-ticket / voucher)
→ My trips (check in, boarding pass, help, cancel)
```
Secondary flows: sign up / sign in, saved travellers, notifications, offers browsing. Supplier flows: catalogue, pricing, reservations, cancel/reschedule, offers, statements. Admin flows: analytics, tickets, offers, settlement, templates, commission, audit. Visitor flow: Try as … sandbox.

Competitor screens and concept references behind these flows are in `docs/research/research-notes.md`.

---

## Page Requirements
What each page contains and how it behaves. Placement and visual treatment: `design.md` → Page-Level Layouts.

### Global (every page)
- **Header:** the Atlas logo/name (links to the homepage); **Destinations**, **Offers** and **Stays** links that go to those homepage sections from any page; **Sign in** when signed out. When signed in: a **notification bell** with an unread count, a greeting with the user's first name, and **Sign out**, plus role links — travellers: **My trips** and **Saved travellers**; airline and hotel managers: **Supplier console**; admins: **Admin console**.
- **Notification panel** (from the bell): the latest notifications, newest first, unread ones marked; opening one marks it read and follows its link; **Mark all as read** clears the unread count; "You're all caught up" when empty.
- **New notification:** when the unread count goes up (never on page load) the bell gives a short jingle and plays a soft two-note chime made in the browser (no audio files or services). A **Sound on/off** toggle in the panel is remembered in that browser. People who prefer reduced motion get a gentle fade instead of the jingle. Browsers stay silent until the user has interacted with the page.
- **Footer:** the Atlas name, the line stating that all flights, hotels and payments are simulated, and the sandbox entries **Try as airline manager**, **Try as hotel manager** and **Try as Atlas admin**. While a sandbox is active, the chosen entry is replaced by **Back to traveller view**.
- **Signed-in pages** (checkout, My trips, confirmation, saved travellers, consoles) send signed-out visitors to Sign in and return them to where they were afterwards. A page for another role (e.g. the admin console for a traveller) is refused with a notice.
- **Unknown addresses** show a friendly "page not found" message with a link home.
- Every page has its own browser tab title.

### Homepage
- **Search** with two tabs, **Flights** (default) and **Hotels**. Switching tabs keeps what was already typed in the other tab and doesn't reload the page.
  - **Flights:** From and To (any of the 8 cities, with a control to swap them), departure date (today up to 60 days ahead), travellers — **adults** (1–9), **children 2–11** (0–8) and **infants under 2** (0 up to the number of adults), with adults + children ≤ 9 — and cabin class (Economy or Business).
  - **Hotels:** destination city, check-in (today up to 60 days ahead) and check-out dates (stays up to 30 nights), adults (1–12), children (0–6) and rooms (1–6).
  - The search button stays disabled until the form is valid, and the first problem is highlighted with a plain-language message (e.g. "Pick a destination different from your origin", "Check-out must be after check-in", "Each room needs at least one adult", "Each infant needs an adult to travel with").
- **Offers available today** (directly above featured destinations): active offers a visitor could use, in the same card style as featured destinations. Each card shows the offer image, title, a one-line summary, the code (or "Applied automatically"), and a plain expiry date ("Valid until 9 Nov 2026"). Four are shown with **View all** (to the Offers page). Each card opens that offer's **About this offer** page. Hidden when there are no active offers.
- **Featured destinations:** a photo and name for each city with a one-line description. Four are shown; **View all** reveals all eight and **Show fewer** collapses them again. Choosing a city opens hotel results for it (a stay starting a week out, two nights, two adults, one room).
- **Best hotels:** hotels that are 4★ or 5★ **and** have a guest rating of **4.0 or higher**, best-rated first. Four are shown; **View all** reveals up to the top ten. Each card shows the photo, stars, name, area, guest rating, review count, two highlight amenities and a "from" nightly price (tonight's price for the cheapest room, before taxes), and opens the hotel.
- **Editorial close:** a photo with a short brand quote, and three short promises — *Handpicked stays*, *One honest price* (its line reads "No convenience fee — you pay the fare and taxes, nothing else."), *No upsell detours*.

### Offers page and "About this offer"
- **Offers page** (`/offers`): every active offer, with filter chips **All / Flights / Hotels**. Same card content as the homepage. An empty state when none are active.
- **About this offer** (`/offers/{offer}`), following the reference layout (`docs/research/09-ixigo-about-offer.webp`, `10-ixigo-offer-terms.webp`) in Atlas's calm style:
  - A summary card: offer image, product chip (Flights / Hotels / Flights & hotels), title, **Category** and **Expires on** rows, **Use code: {CODE}** with **Copy** (or "Applied automatically at checkout"), who funds it is not shown, and one primary action — **Search flights** or **Search hotels** (both when the offer covers both).
  - **About the offer:** what you get (e.g. "10% off the base fare, up to ₹1,500"), minimum spend, which airline/hotel it applies to for supplier offers, the validity dates (booking dates).
  - **How to use it:** 1. Search, 2. Choose, 3. Enter the code on the review step (or "it's applied for you").
  - **Terms & conditions:** plain bullet list generated from the offer's rules (one offer per booking; applies to the base fare / room charges only, never taxes, seats, meals or breakfast; refunds are on the amount actually paid; if the offer ends before payment the total is recalculated and shown before you pay; the offer may be paused).
  - Offers limited to the first 3 bookings show "For your first 3 bookings on Atlas" and, for visitors, **Sign in to use this offer**.
  - An expired, exhausted or paused offer's page says so plainly ("This offer has ended") and shows no code.

### Flight results
- A summary of the search (route, date, travellers, cabin) with **Modify search**, which reopens the search form pre-filled.
- A result count, and one card per flight showing: airline, flight number, aircraft model, guest rating and review count (or "No reviews yet"), departure and arrival times with airport codes (marked "+1" if it arrives the next day), duration, stops ("Non-stop" or number of stops), the lowest price per traveller for the chosen cabin (from the pricing engine; **no offer badge**), and **View fares**. **The whole card opens the flight**; the button still behaves as a button.
- **Sort:** lowest price (default), shortest duration, earliest departure, highest rated.
- **Filters:** stops (non-stop / 1 stop or more), airlines (those present in the results), departure time (before 6 AM, 6 AM–12 PM, 12 PM–6 PM, after 6 PM), and a maximum price per traveller. Filters combine (AND), update the list without a page reload, and can be cleared at once.
- Only flights that are on sale (not cancelled, not stopped), whose aircraft has the chosen cabin, and with enough seats in that cabin for the adults and children are listed.
- Results are paged (20 per page).
- **Empty states:** "No flights on this route that day" (with Modify search), "No flights match your filters" (with Clear filters), "That date has already passed" for past dates, and "Flights can be booked up to 60 days ahead" for later dates.

### Flight details
- **Back** to the previous page (normally the results).
- **Header:** airline · flight number · aircraft model, and the route ("Delhi to Mumbai").
- **Schedule:** departure and arrival times, duration, non-stop/stops status, full airport names, travel day and date, guest rating and review count. A rescheduled departure says "Schedule changed by the airline".
- **Route map:** an illustration of the route between the two cities, with the airports labelled.
- **Choose a fare:** selectable fare cards for the searched cabin — **Saver** and **Flexi** in Economy; **Business** in Business (only on aircraft with a business cabin). Each shows the engine price per traveller, cabin and check-in baggage, cancellation terms (from the fare's platform cancellation template) and date-change terms (information only — changing a booking is out of scope). A fare without enough seats in the cabin for the party can't be chosen.
- **Pick your seats** (optional): the seat map of **that flight's aircraft configuration, showing only the searched cabin** (e.g. A321neo business rows 1–4 in 2-2, or economy rows 5–32 in 3-3), with a legend (available, selected, unavailable, extra legroom) and seat prices from the airline's rate card (window, aisle, middle, extra legroom; business seats are included in the fare). Taken and airline-blocked seats can't be chosen. Each adult and child picks their own seat; infants sit on an adult's lap and take no seat. If none are chosen, seats are assigned at web check-in.
- **Add a meal** (optional): one menu per adult and child — the airline's menu **for the cabin being flown** (or the platform default for that cabin), each meal veg/non-veg with its price ("Included" in business); the default is "No meal selected".
- **Baggage & cancellation:** repeats the chosen fare's baggage, cancellation and date-change terms, plus **"If the airline cancels or reschedules"**: "If the airline cancels this flight you get a full refund automatically. If it changes the time, you can keep the new time or cancel for a full refund until 24 hours before the new departure."
- **Ratings & reviews:** average rating, number of reviews, the latest reviews (name, date, stars, comment) with **Show more reviews**; "No reviews yet" when there are none. Reviews belong to the airline's service (flight number), so every departure of the same service shows the same reviews.
- **Price summary:** fare × travellers (adults + children), infant fee × infants (₹1,500 each), taxes, seat and meal charges (when chosen), the total, the cancellation terms, and **Continue** to checkout. Flights that have already departed, are cancelled or have sales stopped can't be booked.

### Hotel results
- A summary of the stay (city, dates, guests, rooms) with **Modify search**.
- A result count, and one card per hotel showing: photo, star rating, name, area, guest rating and review count, up to four amenities, "Free cancellation" and "Breakfast included" badges where they apply, the **average nightly price for the searched stay** (before taxes, labelled "avg per night", cheapest room and rate plan that fit the party), the number of nights, and **See rooms**. **The whole card opens the hotel** with the same stay details; the button still behaves as a button. No offer badge.
- **Sort:** recommended (default — best guest rating, then stars), price low to high, price high to low, guest rating.
- **Filters:** maximum average price per night, star rating (3★/4★/5★), guest rating (any, 3.5+, 4.0+, 4.5+) and amenities (those available in the results — e.g. Free Wi-Fi, Air conditioning, 24-hour room service, Bar, Pet friendly, Spa, Swimming pool, Restaurant, Parking, Fitness centre, Airport shuttle, Business centre). Filters combine (AND) and can be cleared at once.
- Only hotels on sale with a room type that can hold the whole party in the requested number of rooms are listed. Results are paged (20 per page).
- **Empty states:** "No stays available for those dates", "No stays match your filters" (with Clear filters), "Those dates have already passed", and "Stays can be booked up to 60 days ahead".

### Hotel details
- **Photo grid** of the hotel's photos (three). Clicking any photo opens a **full-screen photo viewer** on the same page (no new address, layout unchanged): previous/next arrows, a close button, a position counter ("2 / 3"), the arrow keys and a swipe on touch screens move between photos, and Escape or a click outside the photo closes it.
- **Header:** stars, name, address, guest rating and review count, and the stay dates and guest count.
- A short description of the hotel, and **Amenities**.
- **Choose your room:** every room type with its name, occupancy, bed type, room amenities, and breakfast ("Breakfast included" or "Room only"). Under each room type, one row per **rate plan**:
  - **Flexible** — the hotel's chosen flexible template (e.g. "Free cancellation until 2 days before check-in, then one night's charge").
  - **Non-refundable** — 10% cheaper by default; "Non-refundable".
  - Each row shows the average price per room per night for the stay plus taxes, the total for the stay, a rooms selector and **Select**.
  - On room-only room types, an **Add breakfast (₹X per guest per night)** checkbox.
  - Choosing more rooms than are left, or too few rooms for the party, shows an inline message.
- **If the hotel cancels:** "If the hotel can't honour your reservation, you get a full refund automatically."
- **Ratings & reviews:** as on the flight page.
- **Price summary:** room charges (nights × rooms, night-by-night prices summed), breakfast (if added), taxes and the total, the rate plan's cancellation terms, and **Reserve**. Until a valid room and rate plan are selected the total shows "—" and Reserve is disabled. A **night-by-night** breakdown can be expanded.
- **Similar stays in {city}:** up to four other hotels in the same city that can host the same party, closest in star rating first, each priced (avg per night) for the **same dates, guests and rooms** and opening with those same stay details. Hidden when there are none.

### Checkout (two steps on one page, same address)
**Step 1 — details**
- **Flights ("Who's travelling?"):** for **every** traveller: **first name** and **last name** (as on their Aadhaar or other government ID — "Names must match the traveller's Aadhaar ID. Atlas doesn't check this." — display only), and their type, fixed by the search (Adult 12+, Child 2–11, Infant under 2). Each infant is listed under the adult they travel with.
- **Hotels ("Who's staying?"):** the lead guest's first and last name.
- **Saved travellers:** a **Choose a saved traveller** picker on each traveller fills the names and type; **Save these travellers to my account** (checkbox, off by default) saves new ones after payment succeeds.
- **Special requests** (optional, up to 500 characters) for flights and hotels — one per booking (e.g. "Wheelchair at arrival", "Late check-in around 11 PM"). The hint says the airline or hotel will reply, and that requests aren't guaranteed.
- **Contact details:** email and 10-digit mobile number, both required, pre-filled from the account where available.
- Two travellers in one booking can't have the same name (compared ignoring case and extra spaces): "Two travellers have the same name. Add a middle name or suffix (e.g. Jr.) to tell them apart."
- **Continue to review** checks everything and moves to step 2.

**Step 2 — Review and pay**
- The travellers/guest (with seat and meal per traveller for flights), special request and contact details, with **Edit** to return to step 1.
- **Offer:** an automatic offer the booking qualifies for is shown applied ("Diwali stays — 12% off, applied automatically"). Below it, a collapsed **Have a code?** section opens a code field with **Apply**. A valid code replaces the automatic offer (the traveller sees which one now applies); **Remove** goes back to the automatic offer, if any. Invalid codes explain why in plain words ("This code has expired", "This code is for hotels", "Spend at least ₹5,000 to use this code", "This code is for your first 3 bookings", "This code has been fully used").
- **Payment** with two tabs:
  - **UPI / QR:** a sample QR code, "Scan with any UPI app to pay ₹{total}", a note that it's a simulation, **Simulate payment** and **Simulate a failed payment**. Paying shows "Waiting for payment…".
  - **Card:** card number (16 digits), expiry (MM/YY, not in the past), CVV (3 digits) and name on card, with **Pay ₹{total}**. Checked for format only and never sent anywhere. A card number ending in **0002** simulates a decline. Paying shows "Processing payment…".
- **Price changed:** the server re-prices at payment. If the total differs from what was shown (demand moved the fare, a night's rate changed, or the offer stopped being valid), **no payment is taken**: the page says "The price changed from ₹X to ₹Y" (and why, e.g. "The DIWALI12 offer has ended"), shows the new breakdown, and the traveller presses Pay again.
- A **failed payment** keeps the user on this page with "Your payment did not go through. No money was taken — please try again.", a **Try again** action, and the chosen method and card details kept. No booking is created.
- If the seat or room was taken by someone else in the meantime, the page explains it (e.g. "Seat 12A is no longer available.") and offers only **Choose again**.
- **Booking summary** (both steps):
  - **Flights:** route ("Delhi → Mumbai"); airline, flight number and fare type; day, date and departure time; base fare, infant fees (if any), the offer as its own negative line with its name, taxes, seats & meals (if any) and total.
  - **Hotels:** hotel name; room type, rate plan, number of rooms and nights; stay dates; room charges, breakfast (if any), the offer line, taxes and total; the cancellation terms.
- The in-progress checkout survives the sign-in redirect and a page refresh.
- A traveller who already holds **5 upcoming hotel bookings** can't start another until one is completed or cancelled ("You already have 5 upcoming stays booked…").

### Booking confirmation
- "Your trip is booked." (flights) or "Your stay is booked." (hotels), the contact email the confirmation goes to, the **booking reference** (e.g. AT7P98PA) and, for flights, the **airline PNR** (e.g. 6EQ4ZK).
- Trip summary: title and subtitle, status, departure/arrival (or check-in/check-out), travellers with seats and meals, special request, free-cancellation deadline (or the fee that applies), base, offer line, taxes, seats & meals and the amount paid.
- **View e-ticket** (flights) or **View voucher** (hotels), **View my bookings** and **Back to home**.
- Refreshing never creates another booking; it is only visible to the account that made it (anyone else sees "Booking not found").

### E-ticket (flights) and voucher (hotels)
Printable pages opened from Confirmation and My trips (browser print; no PDF is generated on the server).
- **E-ticket:** booking reference and airline PNR; per passenger the name, type, e-ticket number (simulated, 13 digits), seat (or "Assigned at check-in") and meal; flight: airline, flight number, cabin and fare name, departure and arrival with airport, terminal (simulated), date and time, and duration; baggage per person (check-in and cabin); fare breakdown with any offer and payment status; the frozen cancellation and date-change terms; Atlas contact details; notices ("Carry a government photo ID", "Web check-in opens 48 hours before departure"); and a QR code carrying only the signed booking reference.
- **Voucher:** booking reference, hotel name and address, guest names, check-in and check-out dates, room type, rate plan, rooms, meals (breakfast included / added / room only), payment summary with any offer, cancellation terms and any special request (with the hotel's reply). No QR code.

### Web check-in and boarding pass (flights)
- **Check in** appears on an upcoming confirmed flight booking from **48 hours until 60 minutes before departure**. Before that window it says "Check-in opens {date, time}"; after, "Check-in has closed — please check in at the airport".
- Checking in assigns seats (in the booked cabin) to travellers who didn't choose one, and produces one **boarding pass** per adult and child: passenger name, flight number, route, date, cabin, seat, **boarding time** (45 minutes before departure — not the departure time), gate (simulated, deterministic), boarding sequence number, booking reference and a QR code that encodes only a signed booking-and-passenger reference — never personal details.
- Bookings with an infant can't check in online: "Travellers with an infant check in at the airport counter."
- Checking in again shows the same boarding passes; it never changes seats.

### My trips
- **Upcoming** and **Past & cancelled** groups. Each booking shows its type, reference, title, details, dates, status, amount paid, the offer used (if any), and — if cancelled — who cancelled ("Cancelled by you" / "Cancelled by the airline / hotel") and the refund.
- Per booking: **View details** (confirmation page), **E-ticket** / **Voucher**, **Check in** / **Boarding passes** (flights, in the window), **Cancel booking** (confirmed, future trips only), and **Get help** (raise or view a help ticket).
- **Cancel booking** first shows the simulated refund (calculated on the amount actually paid), then cancels with **Yes, cancel booking** or keeps it with **Keep it**. The list updates immediately and confirms the refund amount; a refund receipt arrives in notifications.
- **Schedule changed:** a rescheduled flight shows the old and new times with **Keep new time** and **Cancel for a full refund** until 24 hours before the new departure. With no response the trip is kept.
- **Special request reply:** the airline's or hotel's reply ("Accepted" / "Can't accommodate" plus a comment) appears on the booking.
- An empty state with a link to start searching when there are no trips.

### Help tickets (traveller)
- **Get help** on a booking opens "What's wrong with this booking?" — a message (10–1,000 characters). One open ticket per booking.
- The ticket page shows the conversation (traveller, Atlas support, and the airline/hotel if escalated), the status (**Open**, **Waiting for the airline/hotel**, **Answered**, **Closed**), and a reply box while it isn't closed. Replies arrive as notifications.

### Saved travellers
- A list of saved people (first name, last name, type), with **Add**, **Edit** and **Delete**. Up to 20 per account. The same duplicate-name rule applies.
- Used by the picker at checkout. An infant who turns 2 is not re-typed automatically — the traveller's type at checkout comes from the search.

### Sign up / Sign in
- **Sign up:** full name, email, password (at least 8 characters with a letter and a number) and an optional mobile number. Signs the user in straight away. Sign-up always creates a traveller account.
- **Sign in:** email and password; wrong details always show the same "Invalid email or password." message. Managers and admins sign in here too and land on their console.
- Each links to the other, and both return the user to the page they came from.

### Supplier console (airline and hotel managers)
Every page shows only the manager's own airline or hotel. Every change applies to future bookings only, is checked on the server and is written to the audit log.
- **Overview:** bookings, revenue (gross booking value) and **seat load factor** (airline) or **occupancy** (hotel) for the last 30 days vs the 30 before; upcoming departures/arrivals; own offers with redemptions and discount cost; unread notifications.
- **Airline — Services & departures:**
  - **Services** (recurring flights): flight number, route (two of the 8 cities), aircraft configuration (from the platform catalogue), departure time, duration, stops, days of the week, start date and optional end date. Add, edit, discontinue (end date). A service with booked departures can't be deleted. Editing a service changes un-booked future departures; booked departures keep their times and the console lists them so the manager can reschedule them one by one.
  - **Departures** (the next 60 days, filterable by date and route): seats sold and load per cabin, revenue, status (on sale, sales stopped, cancelled, rescheduled). Actions: **Stop sales** / **Resume sales**, **Reschedule** (new departure time, same day ± 1 day, shows how many bookings are affected before confirming), **Cancel departure** (shows bookings affected and total refunds before confirming).
  - **Passenger list** per departure: booking reference, passenger names, type, seat, meal, special request (with reply), offer and funder.
- **Hotel — Property & rooms:** description, amenities (from the platform list), up to 6 photos in order (the first three show on the hotel page), picked from the Atlas gallery or **uploaded from the manager's computer**; room types (name, occupancy, bed, room amenities, breakfast included or not, rooms available, taxes per room per night, and the room's base rate, which is saved to the rate card). A room type with bookings can't be deleted or renamed. **Stop sales** / **Resume sales** for the hotel or a room type.
- **Photo uploads (hotel managers):** JPEG, PNG or WebP, at least 400 × 300 pixels and up to 15 MB on the computer; the browser resizes each to at most 1600 px and re-saves it (removing location data) so it's at most 350 KB. A hotel keeps at most **4 uploads**; an upload in use can't be deleted until it's removed from the photos; uploads not in use are deleted a day after upload. Sandboxes can't upload — they pick from the gallery.
- **Hotel — Reservations:** upcoming and past reservations with guest names, room type, rate plan, dates, special request, offer and funder; **Cancel reservation** (future check-ins only, with a required reason) refunds the guest in full.
- **Pricing (rate card):** edit the inputs listed under Pricing Engine below; a **price preview** shows what a sample flight or stay would cost on chosen dates before saving.
- **Policies:**
  - Airline: per fare tier, the baggage allowances and which platform cancellation template it uses; seat fees (window, aisle, middle, extra legroom); blocked seats per aircraft configuration; meals per cabin (or "use the platform default").
  - Hotel: per rate plan, which platform cancellation template it uses (Non-refundable always uses the non-refundable template); breakfast add-on price.
- **Special requests:** open requests with **Accept** or **Can't accommodate** plus a comment (up to 300 characters).
- **Escalated tickets:** tickets admin escalated to this supplier, with a reply box.
- **Offers:** own offers (create, edit, pause, resume) with redemptions and discount cost.
- **Statements:** monthly settlement statements (see Settlement), with **Query this line**. The query appears in Requests & tickets, where the manager can add details until Atlas resolves it; resolved adjustments waiting for the next statement are listed under the statement.

### Admin console (admin accounts only)
- **Analytics** — the dashboard in Workflow 12.
- **Bookings:** every booking, searchable by reference, email, supplier and status; a read-only detail view (travellers, payment, offer and funder, special request and reply, cancellation, tickets). No edits and no manual refunds.
- **Tickets:** all help tickets and statement queries with status filters; **Reply**, **Close** (without reply) or **Escalate to supplier** for booking problems; **Resolve** statement queries as **No change** or **Adjustment** (amount and note).
- **Special requests:** a read-only list of every request and the supplier's reply.
- **Suppliers:** every airline and hotel with its manager, upcoming bookings and status. **Suspend** (a reason of 5–300 characters is required) hides the supplier's flights or hotel from search, the featured list and detail pages, hides its own offers, refuses new quotes and payments ("isn't on sale right now"), signs its manager out and refuses their sign-in ("Your organisation's Atlas account is suspended. Please contact Atlas support." — shown only after a correct password). Existing bookings are untouched: travellers keep them, can view documents, check in and cancel under their frozen terms, and supplier-cancellation jobs already running still finish. **Reactivate** reverses it straight away. Both actions are audit-logged with the reason.
- **Offers:** all offers (platform and supplier) with redemptions and discount by funder; **Create / Edit** platform offers; **Pause / Resume** any offer (the kill switch).
- **Settlement:** every supplier's statements; **Mark as paid** with a mock payment reference.
- **Settings:** the platform **commission rate** (future statements only), the **pricing limits** (below) and the **cancellation templates** (future bookings only).
- **Pricing limits (one platform setting):** a ceiling on every rate-card multiplier (default **×2.0**; admin can set ×1.2–×3.0) and absolute price bounds — flights **₹1,000–₹75,000** per adult/child seat before taxes, hotels **₹500–₹1,50,000** per room per night before taxes (multiples of ₹50). A rate card that breaks them can't be saved (the error names the field); the engine also holds every multiplier and final price inside them at run time, so a change applies at once, even to cards saved earlier. Managers see the limits on their Pricing page and in the preview. Changes are audit-logged.
- **Audit log:** who changed what and when, with before and after, filterable by actor, supplier and action.
- Accounts that aren't admins are turned away with "That area is for administrators only."

### Visitor sandbox
- **Try as airline manager** asks which of the four airlines; **Try as hotel manager** asks which of the best hotels (4★/5★ with guest rating ≥ 4.0); **Try as Atlas admin** starts straight away. No email or sign-up.
- A popup explains: "This is a simulation. Anything you change here stays in your private demo and never appears on the real website." with **Start demo**.
- A banner on every page while it's active: "Demo environment. Data resets automatically. Don't enter real personal details." with **Back to traveller view**.
- Inside a supplier sandbox, **View as a traveller** switches to a demo traveller who can search and book only the sandboxed airline's or hotel's items, so the visitor can see a booking arrive in the console.
- The sandbox ends on **Back to traveller view**, after 30 minutes without activity, or at most 2 hours after it started; everything in it is deleted.

---

## Workflows
Each workflow has a trigger, an actor and an outcome. Phase 1 traveller flows stay as above unless a line here changes them. State machines and edge cases are in `architecture.md` §11.

1. **Supplier sets pricing inputs.** *Trigger:* a manager saves the rate card. *Actor:* airline or hotel manager. *Outcome:* traveller-facing prices come from the engine using those inputs; existing bookings don't change. The server re-prices at payment and re-validates any offer; if the total changed, no payment is taken and the traveller sees the new total before paying (see Checkout → Price changed).
2. **Supplier manages catalogue.** *Trigger:* a manager edits services, departures, the hotel or room types. *Actor:* manager. *Outcome:* changes apply to future bookings only; stopping sales hides the item from search without touching existing bookings; items with bookings can't be deleted.
3. **Booking reaches the supplier.** *Trigger:* a traveller's payment succeeds. *Actor:* traveller, system. *Outcome:* the booking appears in the supplier's departures/passenger list or reservations, with the offer, the discount and who funds it, and the manager is notified.
4. **Special request.** *Trigger:* a traveller adds a request at checkout. *Actor:* traveller, then supplier. *Outcome:* the supplier sees it on the booking and is notified; admin can view it (booking detail and the read-only Special requests list) but is not notified; the supplier's reply (Accepted or Can't accommodate, plus a comment) reaches the traveller as a notification and is written to the audit log. A request can be answered once.
5. **Booking-problem ticket.** *Trigger:* a traveller raises Get help on a booking. *Actor:* traveller, admin, supplier. *Outcome:* admin replies (status Answered), closes without reply (the traveller sees Closed), or escalates to the booking's supplier (status Waiting for the airline/hotel), who replies to the traveller with admin able to see it. The traveller can reply while the ticket isn't closed (status back to Open). Each step notifies the other party and is audit-logged for staff.
6. **Airline cancels a departure.** *Trigger:* the airline manager cancels a future departure. *Actor:* airline manager, system. *Outcome:* the departure can no longer be booked; every confirmed booking on it is cancelled by the supplier and refunded in full (the amount actually paid, after any discount) with no fee; each traveller gets a notification with a refund receipt that shows the offer line and a **Find another flight** link (same route and date); offer redemptions are restored. Processed in bounded batches; if interrupted, the daily job finishes it. One audit entry for the action, recording how many bookings were affected.
7. **Airline reschedules a departure.** *Trigger:* the airline manager changes a departure's time. *Actor:* airline manager, system. *Outcome:* bookings stay valid with the new times; travellers are notified and may **Keep new time** or **Cancel for a full refund** until 24 hours before the new departure (if the change is made later than that, until the new departure time); with no response the trip is kept. A refund covers the amount actually paid, and a cancelled booking's redemption is restored. Seats already chosen are kept. One audit entry.
8. **Hotel cancels a reservation.** *Trigger:* the hotel manager cancels a reservation it can't honour (future check-ins only, reason required). *Actor:* hotel manager, system. *Outcome:* the guest is refunded in full automatically (amount actually paid), notified with a receipt (with the offer line) and a **Find similar stays** link; the rooms return to inventory; the redemption is restored.
9. **Traveller cancels (Phase 1, extended).** *Trigger:* the traveller cancels a booking. *Actor:* traveller. *Outcome:* the refund rule is unchanged (full refund before the frozen free-cancellation deadline, otherwise the amount paid minus the fee, never below zero; non-refundable pays nothing back), computed on the amount actually paid; a refund receipt appears in notifications; the offer redemption is **not** restored; the supplier is notified.
10. **Notifications.** *Trigger:* any event in these workflows. *Actor:* system. *Outcome:* the right users see entries in their notification bar — refunds and receipts, replies, new bookings and reservations, special requests, tickets and escalations, schedule changes, offer expired / exhausted / redemption restored, statement ready / query answered / paid — unread until opened. **Mark all as read** clears them. Notifications never leak between users or out of a sandbox.
11. **Supplier overview.** *Trigger:* a manager opens their console. *Actor:* manager. *Outcome:* bookings, revenue and load or occupancy for their own items only, plus redemptions and discount cost for their own offers.
12. **Admin analytics dashboard.** *Trigger:* admin opens Analytics. *Actor:* admin. *Outcome:* a dashboard across three tabs (**Overview**, **Supply**, **Demand & offers**) showing exactly:
    - KPI cards with the change vs the previous period of the same length: total bookings, gross booking value, net revenue (commission), take rate, average booking value.
    - Cancellation rate, split into traveller-cancelled vs supplier-cancelled, and total refunds issued.
    - Payment success vs failure rate.
    - Bookings and gross booking value over time, flights vs hotels.
    - Top routes, top destination cities and top suppliers by gross booking value.
    - Lead time (travel date minus booking date) distribution, and cancellation rate by lead-time band (0–7, 8–30, 31–60, 61+ days).
    - Flights: seat load factor. Hotels: occupancy proxy (room-nights booked ÷ room-nights offered) and average daily rate (ADR), from bookings in the period — no per-night storage.
    - Conversion funnel (search → view details → start checkout → pay attempt → confirmed) and searches with zero results.
    - Offers: redemptions, discount given by funder, and share of bookings with an offer.
    - Filters (right-hand panel): date range (last 7 / 30 / 90 / 180 days or custom up to 180 days), product (all / flights / hotels), supplier.
    - **Definitions:** gross booking value counts at booking time (confirmed and later-cancelled bookings, before discount). Net revenue counts only **completed** bookings and retained cancellation fees, so it matches settlement; it's read from the same commission calculation, at the rate stored on the statement (the current rate only for bookings not yet in a statement). Take rate = net revenue ÷ gross value of completed bookings.
    - Seeded history (6 months, flagged synthetic) means the dashboard is never empty.
13. **Settlement statements.** *Trigger:* a calendar month closes (the daily job, on or after the 1st, IST). *Actor:* system, manager, admin. *Outcome:* each supplier with activity gets one frozen statement for the month. See Settlement rules below. Managers see only their own; nobody edits a statement after it's created; corrections are adjustments on the next statement.
14. **Audit trail.** *Trigger:* any manager or admin change to inventory, services/departures, pricing inputs, policies, cancellation templates, supplier cancellations and reschedules, special-request replies, tickets, commission, offers (create, edit, pause, resume, kill switch) or statements (adjustments, mark as paid). *Actor:* system. *Outcome:* one permanent, append-only entry **per staff action** (who, role, supplier, action, target, before, after, and a count when one action affects many bookings), reviewable by admin. It is not a notification feed.
15. **Seat selection by cabin.** *Trigger:* a traveller reaches seat selection. *Actor:* traveller. *Outcome:* only the seats of the searched cabin are shown, laid out from the flight's aircraft configuration; a flight whose aircraft has no business cabin offers no business fares. The same configuration has the same layout for every airline; blocked seats are the only airline-level change.
16. **Meal options by cabin.** *Trigger:* an airline manager edits meals for a cabin, or a traveller reaches meal selection. *Actor:* airline manager, traveller. *Outcome:* the airline decides its own meals per cabin; where it has set none, the platform default for that cabin applies (economy default = the Phase 1 menu; business default = a complimentary menu). A traveller only sees the menu of the cabin they fly.
17. **Passenger details.** *Trigger:* a traveller enters passengers at flight checkout. *Actor:* traveller. *Outcome:* first and last name per passenger (Phase 1 name rule applies to each part), the Aadhaar note, adult / child (2–11) / infant (under 2) from the search; infants take no seat and pay ₹1,500 each (not engine-priced, not discounted, untaxed); infants can't outnumber adults; children need at least one adult; children pay the full fare; duplicate names within the booking are rejected on the server after normalising (trimmed, case-insensitive, spaces collapsed); saved travellers autofill, with the same duplicate check.
18. **Manage offers.** *Trigger:* a manager or admin creates, edits, pauses or resumes an offer. *Actor:* airline manager, hotel manager, admin. *Outcome:* platform offers (admin, funded by Atlas) apply to flights, hotels or both; supplier offers (manager, funded by that supplier) apply only to that supplier's items. No approval step. Admin can pause any offer (kill switch, audit-logged); managers see and edit only their own. Edits apply to future bookings only; a redeemed offer can be paused but not deleted. Discount types: percent off (with a maximum cap) and flat amount off.
19. **Browse offers.** *Trigger:* anyone opens the homepage offers section or the Offers page. *Actor:* visitor, traveller. *Outcome:* active offers with plain terms and a plain expiry date; each opens its About this offer page; a first-3-bookings offer asks a visitor to sign in.
20. **Apply an offer at checkout.** *Trigger:* a traveller enters a code, or an automatic offer is eligible. *Actor:* traveller, system. *Outcome:* at most one offer per booking, its discount as its own negative line. Rules under Offers below.
21. **Offer expiry.** *Trigger:* the daily job runs (and every validity check at apply/payment time). *Actor:* system. *Outcome:* offers past their end date become **expired**, offers at their redemption limit become **exhausted**, and their creators are notified once.
22. **E-ticket and voucher.** *Trigger:* a booking's payment succeeds. *Actor:* system. *Outcome:* a flight booking gets an airline-style PNR, e-ticket numbers and an e-ticket; a hotel booking gets a voucher (see Page Requirements).
23. **Web check-in and boarding pass.** *Trigger:* a traveller presses Check in. *Actor:* traveller, system. *Outcome:* available from 48 hours to 60 minutes before departure; assigns seats to travellers without one; produces boarding passes (see Page Requirements). Time-based only — no supplier action, no "checked-in" booking status. Bookings with an infant are told to check in at the airport.
24. **Visitor starts a sandbox.** *Trigger:* a visitor presses a Try as … entry. *Actor:* visitor, system. *Outcome:* a private, temporary copy of one airline (its services and the next 7 days of departures) or one hotel, or the admin console's small dataset, is created and tagged with a sandbox ID, seeded with bookings, offers, statements, tickets and notifications, under the caps below; the popup and banner appear; the footer shows Back to traveller view. Nothing the visitor does reaches real data or another visitor.
25. **Sandbox ends.** *Trigger:* Back to traveller view, 30 minutes idle, the 2-hour limit, or the daily sweep. *Actor:* visitor, system. *Outcome:* every document carrying that sandbox ID is deleted and the visitor is back on the normal site. (Closing the tab can't be told apart from a reload, so a closed tab ends through the idle timer.)
26. **Platform sets cancellation templates.** *Trigger:* admin edits a template. *Actor:* admin. *Outcome:* applies to future bookings only; existing bookings keep their frozen terms; audit-logged. Suppliers pick one template per fare tier or rate plan.

**Workflows added in review (missing from the spec)**

27. **Staff sign-in.** *Trigger:* a manager or admin signs in. *Actor:* manager, admin. *Outcome:* they land on their console; traveller pages (checkout, My trips) aren't offered to staff accounts — staff can't book with a staff account.
28. **Traveller responds to a reschedule.** *Trigger:* Keep new time / Cancel for a full refund on My trips (or from the notification). *Actor:* traveller. *Outcome:* Keep records the choice; Cancel refunds the amount paid in full, restores the redemption and notifies the supplier. After the deadline only the normal cancellation rule applies.
29. **View and print travel documents.** *Trigger:* E-ticket / Voucher / Boarding passes on Confirmation or My trips. *Actor:* traveller. *Outcome:* the printable page; cancelled bookings show "Cancelled" across the document.
30. **Manage saved travellers.** *Trigger:* Saved travellers page, or the save checkbox at checkout. *Actor:* traveller. *Outcome:* add, edit, delete (max 20, duplicate-name rule).
31. **Admin looks up a booking.** *Trigger:* search in Admin → Bookings. *Actor:* admin. *Outcome:* a read-only booking view; no edits, no manual refunds.
32. **Admin changes the commission rate.** *Trigger:* Admin → Settings. *Actor:* admin. *Outcome:* applies to statements created after the change (each statement stores its rate); audit-logged.
33. **Supplier stops and resumes sales.** *Trigger:* Stop sales / Resume sales. *Actor:* manager. *Outcome:* the item disappears from / returns to search and can't be booked while stopped; existing bookings are untouched; audit-logged.
34. **Sandbox traveller completes the loop.** *Trigger:* View as a traveller inside a supplier sandbox. *Actor:* visitor. *Outcome:* the demo traveller searches and books (mock payment) only the sandboxed supplier's items; switching back shows the new booking and its notification in the console.
35. **Daily maintenance job.** *Trigger:* the daily Vercel Cron call. *Actor:* system. *Outcome:* in one idempotent run: materialise departures for the 60-day window (at most 10 new days per run), return hotel rooms whose stays have ended, expire/exhaust offers, close the previous month's statements, finish interrupted bulk cancellations, sweep leftover sandboxes, and roll up the previous day's funnel events. A missed day is repaired by the next run.

## Pricing Engine and Rate Cards
Prices are never stored per flight or per room and never hand-entered. One pure function computes them from the supplier's **rate card** for search results, details pages and the re-pricing at payment. A booking keeps a frozen snapshot of what was charged. Offers apply after the engine's price and never change it. Default inputs below are modelled on real Indian domestic patterns and are editable by each supplier; full formulas are in `architecture.md` §12.

**Airline rate card**
| Rule | Default |
|---|---|
| Base rate (economy) | A fixed component plus a per-km component. Each is a **variable**: either *growing* (a starting value on a start date and an annual growth rate — how real-world inflation enters) or *manual* (a data point the airline updates). Default: fixed ₹1,900 + ₹3.40 per km, both growing 5% a year from 1 Jan 2026, times an airline factor (IndiGo 1.00, SpiceJet 0.97, Air India 1.04, Vistara 1.06) so the four airlines' prices stay close together. |
| Business | Economy base × 3.0 |
| Time of day (departure) | Before 08:00 ×0.95, 08:00–16:59 ×1.00, 17:00–21:59 ×1.10, 22:00 onwards ×0.95 |
| Day of week | Mon–Thu ×1.00, Fri ×1.12, Sat ×1.05, Sun ×1.12 |
| Days to departure | 45–60 ×0.95, 21–44 ×0.85, 7–20 ×1.00, 3–6 ×1.25, 0–2 ×1.50 |
| Demand (seats sold in the cabin) | under 40% ×1.00, 40–70% ×1.15, over 70% ×1.35 |
| Season or event | Date ranges with a multiplier that **replaces** the day-of-week factor (e.g. Diwali week ×1.25, Holi ×1.20, Christmas–New Year ×1.20) |
| Fare tiers | Saver ×1.0 and Flexi ×1.2 (economy); Business ×1.0 (business). Each tier has cabin and check-in baggage and one platform cancellation template; date-change terms are shown for information. |
| Guard rails | Never below 0.75× or above 2.5× the base for that cabin |
| Ancillaries | Seat fees: window ₹350, aisle ₹300, middle ₹0, extra legroom ₹600 (business seats included); meal prices per cabin |
| Route overrides | Optional per-route multiplier or fixed base |

**Hotel rate card** (computed night by night; a stay is the sum of its nights)
| Rule | Default |
|---|---|
| Base rate | ₹ per night per room type (from the Phase 1 seed prices) |
| Day of week (the night's date) | Sun–Thu ×1.00, Fri–Sat ×1.25 |
| Season or event | Peak season or festival ×1.30, off-season ×0.80 (date ranges) |
| Lead time (from booking to check-in) | 30+ days ×0.90, 7–29 days ×1.00, 0–6 days ×1.10 |
| Rate plans | Flexible ×1.00 (a flexible platform template); Non-refundable ×0.90 (the non-refundable template) |
| Breakfast add-on | Per guest per night on room-only rooms: 3★ ₹350, 4★ ₹550, 5★ ₹850 |
| Guard rails | Never below 0.70× or above 2.0× the base |
| Taxes | Fixed per room per night per room type (unchanged from Phase 1); they don't depend on the rate |

**No occupancy factor for hotels:** hotel prices don't depend on how full the property is. Only flights have a demand factor.

**What a manager can change on the rate card** (fixed rule set; no custom rules):
- **Values:** every number in every rule (rates, growth, multipliers, fees, guard rails), and whether each base-rate variable is *growing* or *manual*.
- **On/off per rule:** time of day, day of week, days to departure, demand, season or event, route overrides (airline); day of week, season or event, lead time (hotel). A switched-off rule counts as ×1.0 and keeps its entries for when it's switched back on. The base rate, fare tiers / rate plans and guard rails are always on.
- **Add and remove entries in list-type rules:** season or event ranges, route overrides, demand bands, time-of-day bands and days-to-departure bands (airline); season ranges and lead-time bands (hotel).
- **Validation on save:** multipliers 0.5–3.0; rates and fees positive; banded rules must cover their whole range with no gaps or overlaps (time of day 00:00–23:59, days to departure 0–60, demand 0–100%, lead time 0–60 days); season ranges can't overlap and must have an end after their start; at most 10 bands per rule, 30 seasons and 50 route overrides; the floor must be below the ceiling. Every save is audit-logged with before and after.
- **Not possible:** inventing new rule types or metrics (a custom rule builder is out of scope).

**Real-world patterns behind the defaults:** domestic fares bottom out when booked 21+ days ahead, rise gradually until about day 7, then climb steeply; weekends cost more than weekdays except in festival weeks, when every day is uniformly higher; different airlines' fares on the same route move together.

## Cancellation Templates
The platform owns the terms for cancellations made by the traveller; suppliers pick, they don't write fees.
- **Flights:** *Saver* — no free window, ₹3,500 fee; *Flexible 24h* — free until 24 hours before departure, then ₹1,500; *Business 6h* — free until 6 hours before departure, then ₹1,000. (Defaults: Saver tier → Saver, Flexi → Flexible 24h, Business → Business 6h.)
- **Hotels:** *Free until 3 days*, *Free until 2 days*, *Free until 1 day* before check-in, then one night's charge for one room; *Strict* — no free window, one night's charge; *Non-refundable* — no refund. (Flexible rate plans pick one of the first four; Non-refundable always uses Non-refundable.)
- These reproduce the Phase 1 seed policies, so behaviour doesn't change. The template's terms are shown before booking and frozen on the booking. Admin can edit a template for future bookings only (audit-logged). The refund formula is unchanged and runs on the amount actually paid. Supplier-initiated cancellations and cancellation after a supplier reschedule always refund in full.

## Offers
- **Kinds:** a typed **code**, or **automatic** (festival and seasonal). A **first-3-bookings** rule can sit on either: the account has fewer than 3 paid bookings (supplier-cancelled bookings don't count; traveller-cancelled ones do).
- **Funding:** platform offers are created by admin and funded by Atlas; supplier offers are created by a manager and funded by that supplier, for its own items only.
- **One offer per booking, no stacking.** A typed code replaces an automatic offer. If two automatic offers are eligible, the one that saves the traveller more applies (tie: platform-funded). The traveller always sees which offer applies.
- **What it discounts:** the flight base fare (adults + children) or the hotel room charges (the sum of the nights × rooms) — never infant fees, seats, meals, breakfast or taxes. Percent offers have a maximum cap; flat offers can't exceed the eligible amount. Amounts are whole rupees, rounded down.
- **Tax** is recomputed on the discounted base with the engine's rule (flights: 12% of the base fare). Hotel tax is fixed per room per night, so it doesn't shrink.
- **Validity:** valid-from and valid-to are **booking dates** (IST), festive offers included; a minimum spend applies to the eligible amount; an optional redemption limit.
- **Validation:** when the offer is applied and again when payment is re-priced. If it's no longer valid, no payment is taken and the traveller sees the new total. A redemption counts when payment succeeds; if one redemption is left and two travellers pay at once, exactly one gets it.
- **Frozen on the booking:** offer code, title, discount amount and funder.
- **Restored** when a supplier cancels (or the traveller cancels after a supplier reschedule); **not** restored when the traveller cancels.
- **Calm copy:** no countdown timers, scarcity lines, flashing badges or struck-through "was" prices that were never charged; expiry is a plain date; search results show no offer badges.
- **Statuses:** active → paused ↔ active; active → expired (end date passed) or exhausted (limit reached). Expired and exhausted are final unless the creator extends the date or raises the limit (which makes it active again).

## Settlement
- **Period:** one calendar month (IST). A statement is created for each supplier with activity, on or after the 1st of the next month, and is frozen.
- **What's on it:** a flight booking counts once its arrival time has passed, a hotel booking once its check-out date has passed (nobody marks bookings complete). A traveller cancellation with a retained fee counts in the month it was cancelled (the supplier keeps the fee; commission applies to it). Supplier-cancelled bookings appear as zero lines for information.
- **Columns:** gross before discount, discount split by funder, refunds, commission, net owed to the supplier; plus adjustments carried from resolved queries.
- **Commission:** one global rate, default **10%**, stored on each statement. Commission is charged on base fare + seats & meals (flights) or room charges + breakfast (hotels), not on taxes, which pass through to the supplier.
  - Platform-funded offer: the supplier is paid as if there were no offer (commission on the pre-discount amount); Atlas absorbs the discount, so Atlas's take on that booking is commission minus discount, which can be negative and is shown.
  - Supplier-funded offer: the discount comes off the supplier's side, and commission is charged on the amount after discount.
- **Queries:** a manager can **query a line** with a note — a ticket of type *statement query* with the booking reference, raised by the supplier and answered by admin. Admin resolves it as **No change** or an **Adjustment** (± amount, note) that appears as a line on the next statement.
- **Mark as paid:** admin enters a mock payment reference; the supplier is notified. A statement's lines never change after creation.

## Visitor Sandbox Rules
- **What's copied:** only the chosen airline (its rate card, services and the next 7 days of its departures) or the chosen hotel; never all 52 suppliers. The admin sandbox gets a small dataset (one airline slice and one hotel). Each comes with ~40 seeded bookings (reusing seed data), 2 offers, 2 statements, 3 tickets and a few notifications so nothing is empty.
- **Isolation (enforced on the server):** real travellers and the public catalogue only ever see documents without a sandbox ID; a sandbox session sees only its own documents plus read-only platform data (cities, aircraft catalogue, templates, photo gallery). Sandbox sessions can only call sandbox-scoped endpoints, never the real manager or admin ones. Sandbox actions are logged only inside the sandbox, never in the real audit log.
- **Caps and quotas:** at most 20 sandboxes at once ("The demo is busy — please try again in a few minutes"); per sandbox at most 2,000 documents, 20 new listings and 50 bookings; 3 sandboxes per IP address per hour.
- **Lifetime:** ends on exit, after 30 minutes idle, or after 2 hours at most; a database expiry backstop and the daily sweep delete anything left.
- **Safety:** strict validation and length limits, output always escaped (no raw HTML), free text typed by one visitor never appears on another visitor's screen, no file uploads in a sandbox (photos from the preset gallery), and a `DEMO_MODE` environment variable that switches sandbox creation off.

---

## Cross-page (global) requirements
- **Input rules:**
  - Names: 2–80 letters in any script, plus spaces, apostrophes, hyphens and dots (no digits or emoji); for split names, each of first and last name is 1–40 characters under the same rule and the full name 2–80.
  - Mobile numbers: 10 digits. Emails must be valid. Free text (special requests, ticket messages, replies, offer text) has a stated maximum length and is stored and shown as plain text.
  - Messages appear under the field when it is left and say how to fix the problem.
  - The server re-checks everything the browser checks.
- **Prices:**
  - Always shown in ₹, whole rupees. Flight taxes are 12% of the (discounted) base fare; hotel taxes are fixed per room per night. Atlas adds **no convenience fee** — the checkout line is labelled "Taxes" and contains no Atlas charge.
  - The server recalculates every price at payment with the pricing engine; prices sent by the browser are never trusted. A changed total is shown before any payment is taken.
- **Booking integrity:**
  - A seat, the last room or the last offer redemption can never be sold twice.
  - Double-clicking Pay or Cancel, refreshing, or retrying never creates a duplicate booking, cancellation or refund.
  - A declined payment never creates a booking.
- **Cancellation and refunds:**
  - Traveller cancellations: full refund before the frozen free-cancellation deadline; otherwise the amount paid minus the fee (never below zero); non-refundable pays nothing back. Refunds are on the amount actually paid.
  - Supplier cancellations, and traveller cancellations after a supplier reschedule (within the response window), always refund the amount paid in full.
  - Only confirmed bookings for trips that haven't started can be cancelled. Refunds are never manual — admin can't issue or edit one.
- **Privacy and scoping:**
  - A traveller can only see and act on their own bookings.
  - A manager sees bookings, tickets, statements, offers and notifications for their own airline or hotel only — checked on every endpoint that takes an id.
  - Admin sees all bookings (read-only).
- **Booking limits:** flights and hotel stays up to 60 days ahead; at most 5 upcoming hotel bookings per account.
- **Sessions:** a sign-in lasts 7 days on that browser; repeated sign-in attempts and sandbox creation are rate-limited.
- **Fresh inventory:** flights are always bookable for the coming 60 days.
- **Notifications** reach only their recipient and are kept for 90 days (up to 200 per user).
- **States:** every list and page has loading, empty and error states; nothing ever shows a blank screen or a technical error.
- **Accessibility:**
  - Everything works with a keyboard, with a visible focus ring.
  - The seat map supports the arrow keys and announces each seat's number, position, price and availability.
  - Dialogs (filters on phones, cancel confirmation, photo viewer, notifications panel, sandbox popup, console confirmations) keep focus inside and close with Escape.
  - Charts on the analytics dashboard have a text equivalent (a data table or labelled values).
- **Responsive:** every page works at phone (~375px), tablet (~768px) and laptop (~1280px+) widths. Consoles and the analytics dashboard are usable on phones (tables scroll sideways) but are designed for laptop first.

## User Stories & Acceptance Criteria
Full coverage of every feature — `AGENTS.md`'s Definition of Done checks a feature against the acceptance criteria for its story here. Stories 13–15 (Phase 1 admin inventory) are retired: inventory moved to the managers (stories 31–35).

| # | Story | Acceptance Criteria |
|---|---|---|
| 1 | As a traveler, I want the home page to default to the Flights tab, so I land on the most common action first. | Home page loads with Flights tab visually active and its search form shown. Clicking "Hotels" switches the form and URL/state without a full page reload; clicking back to "Flights" restores it with any values already entered. |
| 2 | As a traveler, I want to search flights between two cities on a date, so I can see available options. | Given valid origin, destination, date (up to 60 days ahead) and travellers (adults, children, infants), results list shows all matching flights sorted by price by default. Given no matches, an empty state with a clear message and a "modify search" action is shown. Given missing or invalid fields (including more infants than adults), the search button stays disabled and the first invalid field is highlighted. |
| 3 | As a traveler, I want to search hotels by destination and dates, so I can see available stays. | Given a valid city and check-in/check-out dates (check-in up to 60 days ahead), results show matching hotels sorted by recommendation (guest rating, then stars) by default, priced as an average per night for the stay. Check-out on or before check-in is blocked client-side with an inline error. |
| 4 | As a traveler, I want to filter and sort flight/hotel results, so I can narrow down to what fits me. | Applying a filter updates the result count and list without a full page reload. Multiple filters combine with AND logic. Sort options (flights: price, duration, departure, rating; hotels: recommended, price both ways, guest rating) reorder the list correctly. Clearing filters restores the full result set. |
| 5 | As a traveler, I want to pick a fare type, seat, and meal when booking a flight, so my preferences and total price are accurate. | Fare-type selection updates the displayed price and baggage/cancellation terms. The seat map shows only the searched cabin of the flight's aircraft configuration; taken and blocked seats are disabled; seat fees update the price summary. Meal selection shows only the cabin's menu, is optional and, if skipped, defaults to "no meal selected" without blocking checkout. |
| 6 | As a traveler, I want to pick a room type and rate plan when booking a hotel, so my stay matches what I need. | Each room type shows occupancy, bed type, amenities and its rate plans (Flexible, Non-refundable) with prices and cancellation terms; room-only rooms offer a breakfast add-on. Selecting a rate plan carries its price, night-by-night breakdown and policy into checkout. Selecting more rooms than available, or too few for the party, is blocked with an inline message. |
| 7 | As a traveler, I want to see ratings and reviews on a flight/hotel, so I can judge quality before booking. | Detail page shows an average rating, review count, and the latest written reviews with "Show more reviews". If an item has no reviews, the section shows a neutral "No reviews yet" state rather than an error or blank space. |
| 8 | As a traveler, I want to enter passenger/guest details, so my booking has the right names and contact info. | Flights require first and last name for every traveller with the Aadhaar note shown; hotels require the lead guest's first and last name. Duplicate names in one booking are rejected by the server with the middle-name/suffix hint. Email and mobile are both required and validated for format before continuing. Special requests are optional (≤ 500 characters). |
| 9 | As a traveler, I want to pay with a mock UPI/QR or card flow, so I can complete a booking without real payment risk. | Selecting UPI shows a sample QR + simulated "waiting for payment" state; selecting Card shows a standard card form with client-side format validation only. Submitting always resolves to a success, failure or "price changed" state within a few seconds and never calls a real payment processor. A failed attempt shows a clear retry action, keeps the entered payment details, and does not create a booking. |
| 10 | As a traveler, I want a confirmation page after a successful payment, so I know my trip is booked. | Confirmation page shows a unique booking reference (and an airline PNR for flights), a summary of the trip/stay, links to the e-ticket or voucher, "View my bookings" and "Back to home." Refreshing the confirmation page does not create a duplicate booking. |
| 11 | As a traveler, I want to sign up and log in, so my bookings are saved to my account. | Signup requires a unique email and a password of at least 8 characters with a letter and a number; duplicate email registration is rejected with a clear message. Login with correct credentials establishes a session (cookie); incorrect credentials show a generic "invalid email or password" error (no user enumeration). Logout clears the session and protected pages redirect to login. |
| 12 | As a traveler, I want to view and cancel my bookings, so I stay in control of my trips. | My trips lists all bookings for the logged-in user, grouped into upcoming and past & cancelled, with status, who cancelled, and key details. Cancel is only available on confirmed bookings with a future date, and shows the simulated refund (on the amount paid) before confirming. Cancelling updates status to "cancelled", calculates the refund per the booking's frozen terms, is reflected immediately without a page reload, and sends a refund receipt notification. |
| 16 | As a traveler, I want to click anywhere on a flight or hotel result card to open it, so I don't have to aim for the small button. | Clicking anywhere on a result card opens that flight's or hotel's detail page with the same search details (travellers and cabin, or stay dates and guests). Hovering the card enlarges it slightly and shows the card's button in its hover state. Clicking the button itself still feels like pressing the button, and keyboard users reach the card through that one button (no extra tab stops). |
| 17 | As a traveler, I want to open hotel photos full-screen, so I can look at them properly before booking. | Clicking any photo in the hotel's photo grid opens a full-screen overlay showing that photo, without leaving the page or changing the page layout. The overlay has previous/next arrow buttons, a close (X) button, and a position counter (e.g. "2 / 3"). It closes on Escape or a click outside the photo; the left/right arrow keys move between photos; on touch screens a horizontal swipe moves between photos. No new buttons or indicators are added to the page itself. |
| 18 | As a traveler, I want to see similar stays on a hotel page, so I can compare alternatives without starting a new search. | A "Similar stays in {city}" section appears after Ratings & reviews. It lists up to 4 other hotels in the same city that can host the same party, excluding the current hotel. Each card's price is for the same check-in/check-out dates, guests and rooms the traveler is currently viewing, and opening a card keeps those same stay details. If there are no other matching hotels, the section is not shown. |
| 19 | As a traveler, I want the homepage to highlight the best hotels, so I can find a great stay quickly. | A "Best hotels" section appears after Featured destinations, listing hotels that have both a high star rating (4★ or 5★) and a guest rating of 4.0 or above, best-rated first. Four are shown, and "View all" reveals up to the top ten (hidden when four or fewer qualify). Each card opens that hotel. The "Stays" link in the navigation goes to this section from any page. If no hotel qualifies, the section is not shown. |
| 20 | As a traveler, I want to browse all destinations from the homepage, so I can start a hotel search from a city I like. | Featured destinations shows four cities with photo, name and a short description; "View all" reveals all eight and "Show fewer" collapses them. Choosing a city opens hotel results for that city with a default stay. The "Destinations" link in the navigation goes to this section from any page. |
| 21 | As a visitor or traveler, I want to see today's offers and read an offer's terms, so I know what I can save before I search. | "Offers available today" sits directly above Featured destinations with up to four active offers and "View all" (Offers page with All/Flights/Hotels chips). Each card opens an About this offer page with the code and Copy (or "Applied automatically"), category, plain expiry date, about, how to use, and terms. First-3-bookings offers ask visitors to sign in. Ended offers say so and show no code. The section is hidden when no offer is active. No countdowns or scarcity copy anywhere. |
| 22 | As a traveler, I want to apply one offer at checkout, so I pay the discounted price. | On the review step an eligible automatic offer is shown applied; "Have a code?" opens a code field; a valid code replaces the automatic offer; invalid codes give a plain reason. The discount appears as its own negative line named after the offer, applies only to the base fare / room charges, never exceeds them, and tax is recomputed per the engine's rule. If the offer is no longer valid at payment, no payment is taken and the new total is shown. Two concurrent payments for the last redemption: exactly one gets it. |
| 23 | As a traveler, I want the airline or hotel to answer my special request, so I know whether it will be met. | A special request entered at checkout appears to the supplier; the supplier's Accepted / Can't accommodate reply with a comment appears on the booking and as a notification; admin sees it in the read-only list; it can only be answered once. |
| 24 | As a traveler, I want an e-ticket or voucher, so I have proof of my booking. | Every paid flight booking has a PNR, an e-ticket number per passenger and a printable e-ticket with the fields in Page Requirements and a QR code with only a signed reference; every hotel booking has a printable voucher without a QR code. Cancelled bookings show "Cancelled" on the document. |
| 25 | As a traveler, I want to check in online, so I get a seat and a boarding pass before I fly. | Check in is available only from 48 hours to 60 minutes before departure; it assigns seats in the booked cabin to travellers without one, never changes chosen seats, and shows one boarding pass per adult and child with boarding time 45 minutes before departure, gate, sequence number and a QR code without personal details. Bookings with an infant are told to check in at the airport. Repeating check-in shows the same passes. |
| 26 | As a traveler, I want to be told and refunded automatically when the airline or hotel cancels, so I'm never out of pocket. | When a supplier cancels, every affected booking becomes "Cancelled by the airline/hotel" with a full refund of the amount paid, a receipt notification showing any offer line, a link to find an alternative, and the redemption restored. Interrupting the bulk run and running the daily job finishes it without double refunds. |
| 27 | As a traveler, I want to choose what happens when my flight is rescheduled, so I can keep it or get my money back. | The booking shows old and new times and Keep new time / Cancel for a full refund until 24 hours before the new departure; Cancel refunds the amount paid in full and restores the redemption; no response keeps the trip; after the deadline only the normal cancellation rule applies. |
| 28 | As a traveler, I want to raise a help ticket on a booking, so I can get a problem sorted. | Get help opens a ticket (one open ticket per booking); admin can reply, close or escalate to the supplier, who can reply; every reply notifies the traveller; status reads Open / Waiting for the airline/hotel / Answered / Closed; the traveller can reply until it's closed. |
| 29 | As a signed-in user, I want a notification bar, so I see what happened to my bookings, requests and statements. | The bell shows the unread count; the panel lists notifications newest first; opening one marks it read and follows its link; Mark all as read clears the count; a user never sees another user's notifications. |
| 30 | As a traveler, I want to save travellers, so checkout is faster next time. | The save checkbox at checkout saves new travellers after a successful payment; the Saved travellers page lists, adds, edits and deletes them (max 20, duplicate-name rule); the checkout picker fills the names. |
| 31 | As an airline manager, I want to manage my services and departures, so my schedule is right. | I can add, edit and discontinue services for my airline only (another airline's ids return 404); departures appear for 60 days; Stop/Resume sales hides/shows a departure in search; editing a service changes only un-booked departures; I can't delete a service with bookings. Every change is in the audit log. |
| 32 | As an airline manager, I want to cancel or reschedule a departure, so travellers are looked after automatically. | Cancel shows the bookings affected and total refunds, then refunds every booking in full with notifications (Workflow 6). Reschedule shows the bookings affected, then updates times and notifies travellers (Workflow 7). Each action creates one audit entry with the count. |
| 33 | As a hotel manager, I want to manage my hotel and rooms, so travellers see accurate details. | I can edit my hotel's description, amenities, photos (from the gallery only) and room types, and stop/resume sales; another hotel's ids return 404; a room type with bookings can't be deleted or renamed. |
| 34 | As a manager, I want to set my prices through a rate card, so prices follow rules instead of guesswork. | I can edit every value, switch each optional rule on or off (off = ×1.0, entries kept), and add or remove seasons, route overrides and bands; the editor rejects gaps, overlaps, out-of-range multipliers and too many entries with a message on the offending row; the price preview matches what search then shows; saving changes search prices immediately and never changes existing bookings; I can't add new rule types. |
| 35 | As a manager, I want to see my reservations and passenger lists, so I can serve travellers. | My departures/reservations list my bookings only, with names, seats, meals, special requests, offer and funder; I'm notified of new bookings and traveller cancellations. |
| 36 | As a manager, I want to create offers for my own airline or hotel, so I can fill seats or rooms. | I can create percent (with cap) or flat offers, code or automatic, with minimum spend, booking-date validity, redemption limit and first-3 flag, for my items only; pause/resume them; see redemptions and discount cost; I can't see or edit other suppliers' or platform offers. |
| 37 | As a manager, I want monthly settlement statements, so I know what Atlas owes me. | A frozen statement per month lists gross, discount by funder, refunds, commission and net with the commission rate; I can query a line with a note; resolutions appear as adjustments on the next statement; I'm notified when a statement is ready, a query is answered, and it's paid. |
| 38 | As an admin, I want an analytics dashboard, so I can see how the platform is doing. | The dashboard shows exactly the measures in Workflow 12 with the stated definitions, filters by date range, product and supplier, compares with the previous period, has text equivalents for charts, and loads in under 3 seconds on 6 months of seeded data. |
| 39 | As an admin, I want to oversee bookings, tickets and special requests, so I can help travellers without touching supplier inventory. | I can search and read every booking (no edit, no refund), reply/close/escalate tickets, and read all special requests; there is no inventory editor; every staff action is audit-logged. |
| 40 | As an admin, I want to manage platform offers and pause any offer, so promotions stay under control. | I can create/edit platform offers and pause/resume any offer (kill switch), see redemptions and discount by funder, and every change is audit-logged. Pausing never changes bookings that already used the offer. |
| 41 | As an admin, I want to settle with suppliers, so their statements are closed properly. | I can see every statement, resolve queries as no change or an adjustment on the next statement, and mark a statement paid with a mock reference; I can't edit a statement; changing the commission rate affects only future statements. |
| 42 | As an admin, I want platform cancellation templates and an audit log, so policies stay consistent and every staff action is traceable. | Editing a template affects only future bookings; the audit log lists every staff action (one entry per action) with who, when, before and after, filterable, and can't be edited or deleted through the app. |
| 43 | As a visitor, I want to try the supplier and admin consoles without an account, so I can see how Atlas works behind the scenes. | Try as airline manager / hotel manager / Atlas admin creates a private demo after the simulation popup; the banner and Back to traveller view are shown; nothing done in the demo appears on the real site or to other visitors; caps, quotas and the per-IP limit return friendly messages; the demo ends and is deleted on exit, after 30 minutes idle or after 2 hours; DEMO_MODE off hides the entries. |

## Functional Requirements
- Search flights by origin, destination, departure date (≤ 60 days), adults, children, infants and cabin class
- Search hotels by destination, check-in (≤ 60 days)/check-out dates, adults, children and rooms
- Filter and sort results (flights: stops, airline, departure time, maximum price; hotels: maximum average price, star rating, guest rating, amenities)
- Engine-computed prices for flights and hotels from supplier rate cards; re-pricing at payment
- View flight details: fare options, route map, baggage, cabin seat map, cabin meal options, cancellation terms, supplier-cancellation statement, reviews
- View hotel details: photos with a full-screen viewer, amenities, room types with rate plans and breakfast add-on, cancellation terms, reviews, similar stays
- Capture traveller details (first/last name, type), special requests, contact details; saved travellers
- Offers: browse, about page, apply at checkout (code or automatic), redemption limits
- Simulate payment via mock UPI/QR and card UI, including declines, retries and price-change confirmation
- Generate a booking confirmation with a unique reference, airline PNR, e-ticket or voucher
- Web check-in and boarding passes
- User registration, login, logout, session persistence; notifications
- My trips: list, view detail, cancel (with simulated refund calculation), reschedule response, help tickets
- Supplier consoles: catalogue, departures, rate card, policies, reservations, special requests, offers, statements
- Admin console: analytics, bookings, tickets, special requests, offers, suppliers (suspend/reactivate), settlement, commission, pricing limits, templates, audit log
- Visitor sandbox for supplier and admin consoles
- Homepage discovery: offers, featured destinations and best hotels, each with "View all"

## Non-Functional Requirements
- **Security:** password hashing (bcrypt), input validation on all forms (client and server), role-based access control on every console route, supplier scoping on every id-taking endpoint, rate-limited sign-in and sandbox creation, secrets kept in environment variables (never committed), signed QR references
- **Free tier:** everything runs on Vercel Hobby and MongoDB Atlas M0 (512 MB storage, 100 operations per second, 500 connections, daily-only cron with ±59 min timing, 300 s function limit). Every growing collection has a retention rule (see `architecture.md` §13); storage and operations are measured before and after each stage.
- **Performance:** Lighthouse ≥ 80 on key traveller pages; paginated or limited result sets; analytics from bounded, indexed queries; no server-side PDF generation; QR codes generated in the browser
- **Responsiveness:** usable layouts at phone (~375px), tablet (~768px), and laptop (~1280px+) widths
- **Accessibility:** semantic HTML, sufficient color contrast, visible focus states, keyboard-navigable forms, filters, seat map, dialogs and consoles; chart text equivalents
- **Reliability:** graceful handling of empty search results, past dates, sold-out seats/rooms, ended offers, changed prices and simulated payment failures; no duplicate bookings, refunds or redemptions under double-submits or concurrent purchases; idempotent, resumable daily job and bulk cancellations
- **Maintainability:** consistent code conventions across client/server (see `AGENTS.md`); Phase 1 services extended, not rewritten

## Success Metrics
Since this isn't a commercial launch, success is measured by engineering/UX benchmarks rather than revenue:
- 100% of user stories (above) demoable end-to-end with no unhandled errors
- Lighthouse scores ≥ 80 for Performance, Accessibility, and Best Practices on the home, results, and detail pages
- Core Web Vitals on those pages: LCP < 2.5s, CLS < 0.1
- Zero critical console errors or unhandled promise rejections during a full booking walkthrough
- Successful public deployment reachable via a single URL
- A first-time user can go from home page to booking confirmation without external help (informal usability check)
- Measured database size stays under 25% of the M0 limit (128 MB) with the 60-day horizon, 6 months of history and 20 active sandboxes

## Out of Scope
- Real payment processing or any real payment gateway integration
- Live/real-time flight or hotel inventory and pricing
- Any third-party travel APIs (including maps — the route map is an illustration)
- Round-trip and multi-city flights; special fares (student, armed forces, senior citizen…)
- GST / business billing details
- Upsell add-ons: travel insurance, cab/car-rental cross-sell, "price drop protection"
- Price alerts and wishlists *(deferred — Phase 3)*
- User-submitted reviews *(deferred — Phase 3; reviews stay seeded/read-only)*
- Supplier onboarding and verification; staff sub-roles (e.g. hotel front desk); password change and account settings for any role
- Manual or goodwill refunds; modifying a booking after creation; no-show handling
- User suspension and listing or review moderation (pausing an offer is not moderation)
- A custom pricing-rule builder (new rule types or metrics on the rate card)
- Occupancy-based hotel pricing; date-aware hotel availability (rooms are a simple counter returned after check-out)
- Gate-scan screens, hotel check-in screens and any checked-in or boarded booking status (web check-in and boarding passes are in scope)
- Settlement: virtual cards, payment methods, GST and TCS lines, chargebacks, credit-note documents
- Offers: wallet credit and cashback, referral codes, loyalty points, bank/card/UPI-conditioned offers (the offer rules leave room for a payment-method condition later), flight + hotel bundle discounts, stacking, targeted or personalised offers, an approval workflow, bulk or single-use unique codes, email or push campaigns, per-traveller redemption limits, offer badges on search results, a convenience-fee waiver
- Email, SMS or push notifications (in-app only)

## User Personas
**1. Priya, 29 — Frequent Short-Trip Flyer**
Marketing executive who books domestic flights every few weeks. Wants to search, compare, and book in minutes without being funneled through insurance/upsell prompts; checks in online and keeps her boarding pass on her phone.

**2. Rohan, 35 — Family Vacation Planner**
Plans 1–2 family hotel and flight trips a year, often with a toddler (infant fare). Reads reviews and room details carefully; needs clear photos, amenities, cancellation terms, and to know what happens if the hotel cancels. Uses festival offers.

**3. Meera, 41 — Airline revenue manager (IndiGo)**
Runs her airline's Atlas presence: services, the rate card, seat fees and meals, and the occasional cancellation. Wants passengers looked after automatically when she cancels, and a clear monthly statement.

**4. Arjun, 38 — Hotel general manager (The Marine Palm, Mumbai)**
Keeps rooms, rates and photos current, answers special requests, runs a monsoon offer, and queries a statement line when the numbers look off.

**5. Atlas admin — Platform operations**
Watches the dashboard, answers tickets, runs festival offers and pauses one that's misbehaving, settles with suppliers, and checks the audit log. Never edits supplier inventory or prices.

## MVP Prioritization & Phases
Phase 1 is the shipped MVP. Phase 2 is required for this release and is built in reviewable stages. Phase 3 is deferred.

**Phase 1 — MVP (shipped)**
Homepage (search tabs, featured destinations, best hotels), flight and hotel search, results + filters/sorting, flight fare + seat + meal selection with route map, hotel room selection with photo viewer and similar stays, reviews & ratings display, traveller/guest details, mock payment (UPI/QR + card), confirmation, auth, My trips (view + cancel). (The Phase 1 admin inventory editor is retired by Phase 2.)

**Phase 2 — Marketplace (this release)**
Everything in this document marked Phase 2: roles and supplier organisations, supplier consoles, pricing engine and rate cards, cancellation templates, supplier cancellations and reschedules, cabin seat maps and meals, passenger details and saved travellers, special requests, help tickets, notifications, e-ticket/voucher, web check-in and boarding pass, offers, settlement, admin analytics dashboard, audit log, visitor sandbox. Stage order: `architecture.md` §15.

**Phase 3 — Deferred**
Wishlists/saved items, price alerts, user-submitted reviews (vs. seeded-only), round-trip flights, discounted prices or offer badges in search results, date-aware hotel availability.

## Assumptions, Constraints, Risks
- **Constraint:** No third-party APIs — all flight/hotel/payment data is mocked and seeded.
- **Constraint:** Free tiers only — Vercel Hobby (personal, non-commercial; daily-only cron) and MongoDB Atlas M0. Nothing may require paying.
- **Constraint:** Phase 1 code stays as untouched as possible: Phase 2 extends the existing services, models and screens.
- **Assumption:** The demo always has flights to book: departures are materialised for the coming 60 days from the airlines' services by the daily job (see `architecture.md` §7).
- **Assumption:** Hotel availability is a count of rooms per room type, not per date; rooms return after check-out (see `architecture.md` → Implementation Deviations). A booking for a far-off date holds its room until that stay ends; the 60-day horizon and the 5-upcoming-stays cap keep this small.
- **Assumption:** Aircraft configurations (seat layouts) are simplified from real ones and recorded below.
- **Assumption:** Festival dates for seasons and offers are taken from the Government of India holiday list for 2026 and 2027 and verified when seeded.
- **Risk:** The first request after a quiet period can take a second or two longer while the server starts up.
- **Risk:** Phase 2 roughly triples the surface area; it's built in stages with review stops.
- **Risk:** Free-tier ceilings (100 operations per second) could be hit by a burst of sandbox creations or a mass cancellation; both are batched and capped, and measured during QA.

### Aircraft configurations (platform catalogue — assumptions)
| Configuration | Cabins and layout | Seats | Flown by (seed) |
|---|---|---|---|
| Airbus A320neo · single-class | Economy rows 1–31, 3-3 (A B C · D E F); extra legroom rows 1, 12, 13 | 186 | IndiGo |
| Airbus A320neo · two-class | Business rows 1–2, 2-2 (A C · D F); economy rows 3–27, 3-3; extra legroom rows 3, 12, 13 | 8 + 150 | Vistara |
| Airbus A321neo · two-class | Business rows 1–4, 2-2; economy rows 5–32, 3-3; extra legroom rows 5, 15, 16 | 16 + 168 | Air India |
| Boeing 737-800 · single-class | Economy rows 1–31, 3-3; extra legroom rows 1, 14, 15 | 186 | SpiceJet |
| ATR 72-600 | Economy rows 1–18, 2-2 (A C · D F); no extra legroom | 72 | IndiGo, on routes under 600 km |

Real cabins differ slightly by airline (e.g. 189 seats on SpiceJet's 737-800, 78 on IndiGo's ATR); Atlas uses one layout per configuration for every airline, and airlines only block seats.

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
These were flagged as open questions; each now has a default decision so nothing here blocks the agent. Revisit any of them in review if a different call is wanted — they're defaults, not permanent constraints.

**Phase 1**
1. **User-submitted reviews:** Out of scope through Phase 2; reviews are seed-data-only and read-only. User submission is a Phase 3 feature.
2. **Cancellation refund simulation:** Cancelling a booking calculates a *simulated* refund from the cancellation terms frozen on the booking — full refund if cancelled before the free-cancellation cutoff, the amount paid minus the stated fee if after (or always, when there's no free window). No real money moves; this is a displayed number only. Phase 2: the terms come from platform templates, and the amount is what was actually paid.
3. **Admin panel structure:** A protected section of the same app (routes under `/admin`, gated by role), not a separate mini-app. Phase 2 adds `/supplier` the same way.
4. **Seat maps:** Phase 1 used one 30-row 3-3 map for every flight. **Replaced in Phase 2** by aircraft configurations (table above).
5. **Payment outcome:** the user chooses success or failure ("Simulate payment" / "Simulate a failed payment"; a card number ending in 0002 declines). A successful payment leads straight to the booking confirmation.

**Phase 2 (answers given in review, 2026-10-08)**
6. **Cancellation terms:** a small platform-owned template set, derived from the seed policies, picked per fare tier or rate plan.
7. **Offer seed dates:** evergreen offers use rolling windows relative to the seed date; festival offers use per-year windows (2026 and 2027) checked against the official holiday calendar.
8. **Sandbox:** includes a demo traveller (View as a traveller); 30-minute idle expiry, 2-hour maximum, database-expiry backstop, sweep in the existing daily Vercel Cron handler. An airline sandbox copies its services and only the next **7 days** of departures; the demo traveller sees only the sandboxed supplier's items.
9. **Manager credentials:** each of the 52 manager accounts gets its own random password, generated by the seed and written to a git-ignored local file (`server/manager-credentials.local.md`); like the admin login, none is published.
10. **Existing production data:** the live database is re-seeded when Phase 2 ships (it holds only seed data and QA bookings).
11. **Leftover Phase 2/3 items:** wishlists, price alerts, user-submitted reviews and round-trip flights move to Phase 3.
12. **Historical seed:** 6 months of history (about 600–900 bookings), flagged synthetic, capped.
13. **Aircraft:** configurations are separate catalogue models (single-class vs two-class), so "same model, same layout" holds.
14. **Schedules:** airlines manage recurring **services**; the daily job materialises dated departures for 60 days; cancel/reschedule/stop sales act on single departures.
15. **Price changed at payment:** no payment is taken; the traveller sees the new total and pays again.
16. **Retention:** audit log permanent, one entry per staff action (a mass cancellation is one entry with a count); notifications 90 days and 200 per user; funnel events kept 14 days and rolled up nightly into permanent daily summaries; closed tickets 1 year; statements and ledger permanent; sandboxes 30 minutes idle / 2 hours; rate-limit counters as before.
17. **Rate plans:** each room type lists Flexible and Non-refundable rows; room-only rooms offer a breakfast add-on; rooms that include breakfast keep it in the price.
18. **Hotel prices on cards:** average per night for the searched stay ("avg per night"); Best hotels (no dates) shows tonight's price as "from".
19. **Saved travellers and special requests:** saved via a checkbox at checkout and managed on a Saved travellers page; one special-request box per booking for flights and hotels.
20. **Hotel rooms:** the counter stays; rooms return once a stay's check-out passes; hotel stays bookable up to 60 days ahead; at most **5 upcoming hotel bookings per account** (proposed cap).
21. **Two automatic offers:** the bigger discount applies (tie: platform-funded).
22. **Retained cancellation fee:** settles in the month of cancellation.
23. **Infant fee:** ₹1,500 per infant per flight.
24. **Rate card editing:** a fixed rule set; managers edit values, switch optional rules on/off (off = ×1.0) and add/remove entries in list-type rules, all validated. No custom rule builder.
25. **Hotel photo uploads (owner request, overrides the spec's "no file uploads"):** hotel managers may upload up to 4 photos (JPEG/PNG/WebP, ≤ 350 KB after in-browser resizing), stored in MongoDB and served from Atlas with long caching; files are checked by their first bytes; unused uploads are deleted after a day. Sandboxes don't get uploads. Worst case ≈ 67 MB for all 48 hotels — measured and reported.
26. **Bell jingle and chime (owner request):** see Global → New notification.
27. **Supplier suspension (owner request):** see Admin console → Suppliers. Suspension is all-or-nothing per supplier (no partial suspension of one route or room type — managers already have Stop sales for that). The manager isn't sent a notification (they can't sign in to read it); the reason lives in the audit log.
28. **Pricing limits (owner request), chosen defaults:** multiplier ceiling ×2.0 (the default rate cards peak at ×1.5); flight fare ₹1,000–₹75,000 (the dearest seeded business fare at its guard-rail ceiling is about ₹63,000; the cheapest seeded economy fare about ₹1,700); hotel night ₹500–₹1,50,000. The structural business-cabin ratio (×1.5–×6) and airline factor (×0.5–×2) keep their own fixed bounds; at save time Atlas also checks that the base fare of every route (economy) and of the longest route (business) falls inside the fare bounds, which catches typos such as ₹340 per km.
29. **Settlement details:** infant fees pass through to the airline like taxes (no commission); a retained cancellation fee is commissioned in full; a traveller cancellation refunded in full doesn't appear on a statement; trips missed in an earlier month appear on the next statement rather than being lost.

**Phase 2 assumptions from the spec, confirmed as written:** funding and commission rules (Settlement); no convenience fee exists — confirmed in code (flight taxes are 12% of the base fare; hotel taxes are seeded per room per night; neither includes an Atlas charge), so the label becomes "Taxes"; tax recomputed on the discounted base; redemption restored only on supplier cancellation; a typed code replaces an automatic offer; validity dates are booking dates; first-3-bookings excludes supplier-cancelled bookings; no offer badges in results; the admin kill switch is not moderation; build order platform offers first, then supplier offers and the funding split; Saturday ×1.05; commission 10%; special requests visible to admin read-only and supplier replies audit-logged; take rate on completed bookings; sandbox hotels from the best-hotels set; sandbox admin actions affect only the sandbox.

**Other defaults chosen while specifying (flag any to change):** business-cabin default meals are complimentary; boarding time is 45 minutes before departure; a reschedule moves a departure by at most one day; flight special requests are one per booking; commission is charged on fares/room charges and add-ons, not taxes; hotel cancellation fee is one night of one room (as in Phase 1); one open help ticket per booking; staff accounts can't book.

## Glossary
- **OTA (Online Travel Agency):** A company that sells travel services (flights, hotels) from multiple providers through one platform, e.g. MakeMyTrip, Booking.com.
- **Booking reference:** Atlas's reference for any booking (e.g. AT7P98PA).
- **PNR (Passenger Name Record):** The airline's reference for a flight booking. Atlas issues a separate airline-style PNR (e.g. 6EQ4ZK) alongside its booking reference.
- **Service:** a recurring flight (flight number, route, time, days of the week); a **departure** is one dated flight of a service.
- **Aircraft configuration:** a catalogue entry fixing an aircraft's cabins and seat layout.
- **Fare tier:** A pricing/service tier for the same flight (Saver, Flexi, Business).
- **Rate card:** a supplier's pricing inputs; the **pricing engine** turns them into prices.
- **Rate plan:** a hotel price variant for a room type (Flexible, Non-refundable).
- **Cancellation template:** a platform-owned set of cancellation terms that a fare tier or rate plan uses.
- **Taxes:** government taxes added to the base fare or room charges. Atlas adds no convenience fee.
- **Offer:** a discount, platform-funded or supplier-funded, applied by code or automatically; **redemption** is one paid booking using it.
- **Settlement statement:** a supplier's frozen monthly account of what Atlas owes it; **commission** is Atlas's share; **take rate** is net revenue ÷ gross value of completed bookings.
- **Seat load factor:** seats sold ÷ seats offered. **Occupancy proxy:** room-nights booked ÷ room-nights offered. **ADR:** room revenue ÷ room-nights sold.
- **Sandbox:** a private, temporary demo copy of one supplier or the admin console.
- **Cancellation policy:** The rules and fees that apply if a booking is cancelled, often time-sensitive (e.g. free before a cutoff, fee after).
- **One-way vs. round-trip:** A single-direction booking vs. an outbound + return booking. Atlas supports one-way.
- **Lead guest:** The person a hotel booking is made under.
