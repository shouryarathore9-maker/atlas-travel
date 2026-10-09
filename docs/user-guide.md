# Atlas — What's New (Phase 2 user guide)

A short guide for each kind of Atlas user: what you can now do, and where to find it. Everything on Atlas is simulated — flights, hotels, payments and payouts.

---

## Visitors (not signed in)

**Try the consoles without an account.** At the bottom of every page:

- **Try as airline manager** — pick one of the four airlines.
- **Try as hotel manager** — pick one of the best hotels.
- **Try as Atlas admin** — the platform console, with a small dataset.

Press **Start demo**. You get a private copy that nobody else sees, and nothing you do reaches the real site. A dark banner stays on top while the demo runs.
- **Airline and hotel demos:** every console page comes filled with demo bookings, requests, statements and tickets. Use **View as a traveller** (the demo traveller already has two trips) to search and book your own airline's flights or your own hotel's rooms (the payment is fake). Then use **Back to the console** to see the booking arrive, with its notification.
- **Leaving:** **Back to traveller view** (or **Leave demo** in the header) deletes the demo. It also ends by itself after 30 minutes idle or 2 hours.
- **Limits:** up to 3 demos per hour. Photo uploads are off in demos (pick from the gallery instead).

**Browse offers.** **Offers** in the header lists every live deal. Each card links to its terms and code.

---

## Travellers

**Searching and choosing**
- Search with **adults, children (2–11) and infants (under 2)**, and **Economy or Business**.
- Prices come from each airline's or hotel's own pricing rules: they move with the date, the day of the week, festivals and how full the flight is. Flights and stays can be booked up to 60 days ahead.
- Flight pages show **Saver / Flexi / Business** fares, each with its baggage, date-change fee and cancellation terms. You also get a cabin seat map (window, aisle and extra-legroom fees shown) and the cabin's meal menu.
- Hotel pages show each room with **Flexible** or **Non-refundable** prices, night by night, and an optional breakfast add-on.

**Checking out**
- Enter each traveller's first and last name. Save people you travel with under **Saved travellers**, and pick them next time.
- **Offers apply themselves** when one fits your booking. You can type a code instead (for example `WELCOME10`, 10% off your first three bookings). The discount appears as its own line.
- Add a **special request** (late check-in, seats together…); the airline or hotel replies to you.
- If the price changed since you looked, you see the new total **before** anything is charged.

**After booking — My trips**
- **E-ticket / hotel voucher** to view or print. For flights: **Web check-in** opens 48 hours before departure (until 60 minutes before) and gives **boarding passes with a QR code**.
- **Cancel** shows your refund under the terms you agreed to when you booked.
- If the **airline cancels** a flight or the **hotel cancels** a stay, you're refunded in full automatically. You get a receipt and a link to find another option.
- If the airline **changes the time**, choose **Keep new time** or **Cancel for a full refund** (until 24 hours before the new time).
- **Get help** on any booking opens a ticket with Atlas support. Replies arrive in the **bell**, which now gives a little jingle and chime when something new arrives (turn the sound off in the bell's panel).

---

## Airline managers (Supplier console → your airline)

Sign in with your airline's manager account. Accounts are listed in `server/manager-credentials.local.md` on the developer's machine.

- **Overview:** bookings and revenue for the last 30 days, plus today's and tomorrow's departures.
- **Services:** your recurring flights (route, aircraft, time, days of the week). Adding one creates its dated departures for the next 60 days automatically.
- **Departures:** each dated flight, with seats sold per cabin and the passenger list.
  - **Stop sales** / **Resume sales** for a single flight.
  - **Reschedule** a departure: passengers are told and can keep the new time or cancel for a full refund.
  - **Cancel departure:** every passenger is refunded in full and notified. You give a reason, and it's recorded in the audit log.
- **Pricing (your rate card):** base fare (a fixed amount plus a per-km amount, which can grow with inflation each year), business-cabin ratio, and the rules for time of day, day of week, days to departure, demand, festival seasons and route overrides. Each optional rule can be switched off. You also set fare tiers (with baggage and cancellation terms), seat fees and guard rails.
  - Use the **price preview** to test before saving.
  - **Atlas limits** apply: each multiplier is at most ×2.0, and fares stay within ₹1,000–₹75,000 per traveller. The page shows the current limits.
- **Policies:** the meal menu per cabin, and blocked seats per aircraft.
- **Requests & tickets:** answer special requests (**Accepted** / **Can't accommodate** + a comment), reply to tickets Atlas support escalated to you, and follow your statement queries.
- **Offers:** create your own discounts for your flights (code or automatic, % or flat, minimum spend, limit, dates). Pause or resume them. You fund these discounts.
- **Statements:** a statement arrives on the 1st of each month for the month before. It shows completed trips, cancellation fees you kept, discounts (Atlas-funded or yours), commission, any **adjustments** and the **net Atlas owes you**. Statements never change.
  - **Your commission rate** is shown at the top, read-only (e.g. "10% · 12% from 1 November 2026"). Atlas sets it; a change always starts on the 1st of a month, and you're notified.
  - If a line looks wrong, press **Query this line**. Atlas answers with "no change" or one or more **adjustments** — each with its reason — on your next statement. Adjustments Atlas adds are listed under **Coming on your next statement**.
  - If a month ends below zero (an adjustment larger than what you earned), nothing is paid: it shows **Nothing to pay · carried forward**, and the amount opens next month's statement as a balance line.
  - You're notified when a statement is ready, when a query is answered, when an adjustment is added and when a statement is paid.

## Hotel managers (Supplier console → your hotel)

- **Property & rooms:** description, amenities, room types (occupancy, beds, breakfast included, number of rooms, taxes, base rate). Each room type shows how many are booked tonight and its busiest upcoming night. You can't set fewer rooms than are already booked on an upcoming night.
  - **Stop sales** for the hotel or one room type stops all dates. **Stop sales on dates** stops chosen room types from a first to a last night (up to 90 days ahead); **Resume sales** reopens them. Guests already booked on those nights keep their reservations.
  - Rooms are counted night by night: a stay can be booked only if every night has a room free, and a cancellation frees exactly that stay's nights.
  - **Photos:** pick from the Atlas gallery or **upload your own**: JPEG, PNG or WebP, at least 400×300 pixels, up to 4 uploads. Each is resized in your browser to at most 350 KB, with location data removed.
  - The **first photo** is your hotel's main picture everywhere travellers see it: search results, Best hotels on the homepage and similar stays.
  - Gallery photos are always available. Uploads you don't use are removed after a day.
- **Reservations:** every booking. **Cancel** one you can't honour: the guest is refunded in full automatically and offered similar stays.
- **Pricing:** base rate per room type, weekend and festival/off-season rules, lead time, **occupancy** (prices rise as a room type fills up on a night: by default ×1.1 from 50% booked, ×1.25 from 80%), rate plans (Flexible with your chosen free-cancellation window; Non-refundable cheaper), breakfast price and guard rails. Room nights stay within Atlas's ₹500–₹1,50,000 limit.
- **Requests & tickets**, **Offers** and **Statements** work as for airlines.

---

## Atlas admins (Admin console)

The console opens on **Analytics**.

- **Analytics:** a dashboard with three tabs.
  - **KPIs** compared with the previous period: bookings, gross booking value, net revenue, take rate and average booking value.
  - **Overview:** bookings over time, cancellations and payments.
  - **Supply:** top routes, cities and suppliers; seat load factor, hotel occupancy and average daily rate.
  - **Demand & offers:** lead time, the conversion funnel, zero-result searches and offer use.
  - **Filters:** date range (7/30/90/180 days or custom), product and supplier. Every chart has a **Show data** table.
- **Bookings:** search any booking by reference, email or PNR. Read-only: no edits, no manual refunds.
- **Suppliers:** each supplier's commission is shown under its name. **Commission** sets that supplier's own rate (0–30%; leave blank for the product default) from the 1st of next month; the manager is notified. **Suspend** an airline or hotel, with a reason. Its flights or rooms and its offers disappear from the site, new bookings are refused, and its manager is signed out and can't sign in. Existing bookings are untouched. **Reactivate** restores everything instantly. Both actions are audit-logged.
- **Tickets:** traveller help tickets (**Reply**, **Close**, **Escalate to the airline/hotel**) and supplier **statement queries**. **Resolve** a query as **No change** or an **Adjustment** — up to 5 lines, each a ± amount (negative if the supplier was overpaid) and a reason — which appear on that supplier's next statement. Filter by type and status.
- **Special requests:** a read-only list of every request and reply.
- **Offers:** all offers with redemptions and discount cost. Create or edit **platform-funded** offers, and **Pause/Resume** any offer (the kill switch).
- **Settlement:** every supplier's monthly statements. Enter a mock payment reference to **Mark as paid**; the supplier is notified. **Add adjustment** corrects a supplier's next statement without a query (amount, reason, optional booking reference); adjustments waiting for a statement are listed. A statement below zero is **carried forward** and can't be marked paid.
- **Settings:**
  - **Commission:** one default rate for all airlines and one for all hotels (0–30%). A change applies from the 1st of next month, so statements already created never change.
  - **Pricing limits:** the highest multiplier allowed on any rate card, and the lowest/highest flight fare and room-night price. Changes apply to search prices immediately, and rate cards outside them can't be saved.
  - **Cancellation templates:** the terms suppliers choose from; changes apply to future bookings only.
- **Audit log:** who changed what and when, with before and after, filterable by supplier, role and action.
