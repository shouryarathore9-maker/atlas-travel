# QA report — QA-1 build + QA-2 verification (30 Sept 2026)

Scope: the two QA documents supplied by the project owner. QA-1 features were built first; QA-2 was then run against the whole app.
Evidence: automated suites (server 34 tests, client 20 tests), two scripted API passes (`qa2-api` 21 checks, `qa2-stories` 11 checks), and browser walkthroughs at 375 / 768 / 1280 px with two separate traveller accounts plus the admin.

Legend: ✅ pass · 🔧 failed, fixed in this QA round (re-verified) · ➖ not applicable (see note)

---

## QA-1 — features added (PRD stories #16–#19; item 4 intentionally not added as a story)

| Item | What was built | Verified |
|---|---|---|
| 1 · Clickable hotel cards (#16) | Invisible full-card link *under* the "See rooms" button; card grows slightly and the button shows its hover state on card hover; button keeps its own pressed state; still one tab stop | ✅ click on card body opens hotel with same stay; RTL test for single focusable link |
| 2 · Photo lightbox (#17) | Full-screen overlay, translucent ←/→ buttons, X top-right, "n / N" counter at bottom, Esc / click-outside close, ←/→ keys, swipe; layout unchanged | ✅ browser script + 4 RTL tests |
| 3 · Similar stays (#18) | "Similar stays in {city}" after Ratings & reviews; up to 4 hotels in the same city that fit the same party; priced for the viewer's exact dates/guests/rooms; links keep the stay | ✅ prices match search for same stay; hopping hotels resets room selection |
| 4 · Flight page (not a story) | Roomier timeline ("2h 20m" / "Non-stop" on one line); illustrated "origami" route map top-right (pure SVG, no APIs, no time/price box) | ✅ DEL→BOM, CCU→BLR, BOM→AMD; no clipped labels; fits 375 px |
| 5 · Best hotels (#19) | Homepage section below destinations: 4★+ **and** 4.0+ guest rating, best-rated first; nav "Stays" scrolls to it from any page | ✅ `GET /api/hotels/featured` + 2 Supertest tests |

---

## QA-2 Part 1 — acceptance criteria, sentence by sentence

| Story | Sentence | Result | How |
|---|---|---|---|
| 1 | Home loads with Flights tab active and its form shown | ✅ | RTL test |
| 1 | Clicking Hotels switches form + URL without reload; back to Flights restores it | ✅ | RTL test (typed value survives) |
| 2 | Valid search shows matching flights sorted by price | ✅ | API script |
| 2 | No matches → empty state with message + "modify search" | ✅ | browser (2 months out) |
| 2 | Missing fields → search disabled, first invalid field highlighted | ✅ | RTL test |
| 3 | Valid city/dates → hotels sorted by relevance by default | ✅ | API script |
| 3 | Check-out before check-in blocked client-side with inline error | ✅ | browser |
| 4 | Filters update count and list without reload | ✅ | browser |
| 4 | Multiple filters combine with AND | ✅ | API script + Supertest |
| 4 | Sort by price / rating / duration reorders correctly | ✅ | API script (flights + hotels) |
| 4 | Clearing filters restores the full set | ✅ | API script |
| 5 | Fare choice updates price and baggage/cancellation terms | ✅ | browser |
| 5 | Unavailable seats disabled; surcharge updates the summary | ✅ | browser + RTL test |
| 5 | Meal optional, defaults to "no meal selected" | ✅ | browser |
| 6 | Each room shows occupancy, bed, amenities, price, cancellation terms | ✅ | browser |
| 6 | Selected room's price and policy carry into guest details | ✅ | browser (checkout summary) |
| 6 | More rooms than available blocked with inline message | ✅ | browser ("Only 3 rooms of this type left.", Reserve disabled) |
| 7 | Average rating, count and first reviews shown | ✅ | API script + browser |
| 7 | Zero reviews → neutral "No reviews yet" | ✅ | API script + RTL test |
| 8 | Requires ≥1 traveller name + age category; contact validated | ✅ | browser + client/server validation |
| 8 | Optional fields can be blank (special requests) | ✅ | browser |
| 8 | "GST/state for flights" optional field | ➖ | GST is explicitly **Out of Scope** in this same PRD, so the field was not built (PRD contradiction — flag for review) |
| 9 | UPI shows fake QR + "waiting for payment" | ✅ | browser |
| 9 | Card form with client-side format validation only | ✅ | browser + client test |
| 9 | Resolves within seconds; never calls a real processor | ✅ | code review + browser |
| 9 | Failure shows a clear retry action | ✅ | browser (UPI + decline card) |
| 9 | Failure does not create a confirmed booking | ✅ | API script + browser count |
| 10 | Unique reference, trip summary, "View my bookings" + "Back to home" | ✅ | browser |
| 10 | Refreshing confirmation doesn't duplicate | ✅ | browser |
| 11 | Unique email + password strength; duplicate rejected clearly | ✅ | Supertest |
| 11 | Correct login sets cookie; wrong login shows generic error | ✅ | Supertest |
| 11 | Logout clears session; protected pages redirect to login | ✅ | browser + Supertest |
| 12 | My Bookings lists all bookings with status + key details | ✅ | browser |
| 12 | Cancel only for confirmed + future bookings | ✅ | browser + Supertest (new started-trip test) |
| 12 | Cancel sets "cancelled", computes simulated refund per policy, no reload | 🔧 | refund was wrong for 0-hour/0-day policies — fixed (Finding 5) |
| 13 | Non-admin gets 403 / is redirected away | ✅ | Supertest + browser |
| 13 | Admin sees an admin-only nav entry | ✅ | browser |
| 14 | Create requires fields; inline errors | ✅ | browser (6 inline errors, focus on first) + Supertest |
| 14 | Edit and delete reflect immediately in search | ✅ | browser (admin session) |
| 14 | Deleting a flight with bookings is blocked clearly | ✅ | Supertest |
| 15 | Same pattern for hotels | ✅ | Supertest |
| 16–19 | See QA-1 table | ✅ | as above |

### AGENTS.md Definition of Done
| # | Point | Result |
|---|---|---|
| 1 | Acceptance criteria pass | ✅ (table above; one PRD contradiction flagged) |
| 2 | No console errors | ✅ clean happy-path walkthrough across 13 screens: 0 errors, 0 warnings (only expected 4xx appear when deliberately testing failures) |
| 3 | Lint clean | ✅ 0 errors (4 pre-existing Fast-Refresh warnings) |
| 4 | New endpoints have success + failure tests | ✅ `GET /api/hotels/featured` (2 tests); new behaviours (concurrent pay, 0-hour refund, names, past dates, started trips) tested |
| 5 | Lighthouse ≥ 80 perf + a11y on touched pages (bar lowered from 90 by the project owner) | ✅ Accessibility 100 everywhere. Best practices 100. Desktop performance 98–100. Mobile performance: flight results 95, flight detail 88, home 85–89, hotel detail 84 — all above 80. |
| 6 | Responsive at 375 / 768 / 1280 | ✅ no horizontal overflow on 7 key pages × 3 widths (after Finding 9) |
| 7 | Server-side validation; protected routes reject | ✅ QA-2 part 2 checks 4–7 |
| 8 | No scope creep | ✅ map is a hand-drawn SVG (no map API); no upsells |

### design.md visual checklist
| Check | Result |
|---|---|
| Colours | ✅ ivory `#F6F1E8` background, ink `#17221F` text, primary button `#9C5436` (documented accessible terracotta) |
| Fonts | ✅ DM Serif Display (Canela fallback) headings, Inter body |
| One primary button per screen | ✅ 0–1 on every page at every width |
| Empty states | ✅ no results, filters, past dates, no reviews, no trips |
| Errors under fields | ✅ signup, checkout, admin, search |
| Keyboard focus rings | 🔧 search pills removed their outline — fixed (Finding 12) |

### architecture.md
Endpoints in §5 all exist (bookings are created by `POST /api/payments/mock`, as recorded in Implementation Deviations). Model fields match §4 plus the recorded deviations. Security §8: bcrypt(js), zod on every write, auth + admin middleware (401/403 verified), rate-limited auth, httpOnly 7-day JWT, restricted CORS, secrets only in `.env` (git-ignored, verified not committed). New deviations from this round are recorded as items 10–13.

---

## QA-2 Part 2 — adversarial tests

| # | Test | Result |
|---|---|---|
| 1 | Two people, one seat (sequential and truly simultaneous) | ✅ second person: "Seat 24A is no longer available." — 🔧 payment form stayed active below the error (Finding 3) |
| 2 | Pay twice (double-click; refresh; Back) | ✅ one booking; 🔧 two identical requests at the same instant returned a misleading error to the second (Finding 1) |
| 3 | Cancel twice; seat/room released | ✅ server refuses the 2nd; seat and room restored exactly once — 🔧 client sent 2 requests (Finding 4) |
| 4 | Peek at another user's booking | ✅ "Booking not found" — 🔧 tab title said "Booking confirmed", no way back (Finding 6) |
| 5 | Sneak into /admin | ✅ turned away — 🔧 the notice rendered below the hero, off-screen (Finding 7) |
| 6 | Logged-out My Bookings | ✅ redirected to sign-in, returns afterwards |
| 7 | Silly inputs | ✅ no crashes — 🔧 emoji names accepted and "too long" message was developer text (Finding 2) |
| 8 | Weird searches | ✅ flights — 🔧 past-date hotel search listed unbookable hotels (Finding 8) |
| 9 | Phone size, search → payment | ✅ after fixing 3 px overflow on the flight header (Finding 9); 🔧 25 px dropdown tap areas (Finding 10) |
| 10 | Wrong card (…0002), retry, no ghost booking | ✅ — 🔧 card details were wiped after a decline (Finding 11) |

### Findings (all fixed and re-verified)
1. Concurrent identical payments: second request now returns the first's booking (200) instead of "seat no longer available".
2. Names: letters in any script + space ' - . only, 2–80 chars, friendly messages; name fields capped at 80.
3. After an availability error, only "Choose again" is offered (payment form hidden). Errors now offer the fitting action: choose again / edit details / try again.
4. Pay and cancel ignore a second click while the first request is in flight.
5. **Refund bug:** a 0-hour (flights) / 0-day (hotels) free window was treated as "free until departure/check-in", refunding in full despite the stated fee. Now the fee applies. Four QA test bookings with the bad snapshot were repaired in the local DB (one had already been cancelled and refunded in full; left as a historical record).
6. Booking-not-found page: correct title and a "View my bookings" link.
7. "Administrators only" notice moved above the homepage hero.
8. Hotel search with a past check-in returns no results; both results pages explain "That date has already passed".
9. Flight header columns fit at 375 px (was 378 px wide).
10. Search dropdowns/date inputs now 36 px+ tall inside the pills.
11. Payment form stays mounted during processing — a declined card keeps its tab and details for the retry.
12. Search pills show the 2 px terracotta focus ring (design.md).
13. Also found while testing: empty filter headings with no results (hidden now); hotel page "Total ₹0" before choosing a room (now "—"); 3 of 4 "Best hotels" shared one photo (each now uses its first photo not already shown); mobile results header re-wrapped when the font loaded (layout shift 0.27 → 0).

### Test data note
QA used two local test accounts (`qa-alice@atlas.test`, `qa-bob@atlas.test`) and made/cancelled a handful of bookings, and one seeded DEL→BLR flight was deleted by the admin test. `npm run seed` resets all of it.

---

# Phase 2 QA (8 Oct 2026)

Scope: Phase 2 stages 1–8 plus the owner's extra requests (supplier suspension, pricing limits, offer artwork, hotel photo uploads, bell chime).
Evidence: server suite **129 tests / 15 files** (Supertest on an in-memory MongoDB), client suite **29 tests**, lint 0 errors, browser walkthroughs on the dev server at ~375 / ~800 / 1280 px, an adversarial code review of the riskiest code (sandbox isolation, authorisation, money, crashes), and a storage measurement.

## Adversarial review — findings and fixes

| # | Finding | Fix | Verified |
|---|---|---|---|
| 1 | **Visitor demos copied a supplier's latest bookings — including real travellers' names, special requests and PNRs — into public, anonymous sandboxes.** A suspended supplier could also be demoed by id. | Demos copy only seeded (synthetic) bookings; suspended suppliers are refused. | 🔧 test: a real booking is never copied, the seeded one is |
| 2 | Resolving a statement query twice at once (double-click) created two adjustments → the supplier would be paid twice. | The query is claimed atomically before the adjustment is created. | 🔧 test: two parallel resolves → one 200, one 409, one adjustment |
| 3 | Two overlapping departure cancellations (retry / daily job) could restore offer redemptions twice (even below zero) and notify travellers twice; the audit entry was written twice. | Each run restores offers and notifies only for bookings it cancelled (by its receipt numbers); redemptions never go below 0; only the request that cancels the flight audits. | 🔧 existing operations tests + review |
| 4 | The orphan sweep could delete a sandbox that another visitor was creating at the same moment. | Sandboxes younger than 10 minutes are never treated as orphans. | 🔧 review |
| 5 | A statement query closed without resolution blocked that line from ever being queried again. | Only open queries block a new one. | 🔧 test |
| 6 | A demo of a hotel that uses uploaded photos couldn't save its property page. | A demo copy may keep the uploads the hotel already shows (it still can't upload). | 🔧 review |

Ruled out by the review: settlement closes are idempotent; mark-paid is atomic; every daily-job step but the sweep runs on real data only; every `bulkWrite` carries the sandbox filter; real and sandbox cookies can't be swapped; bad ids give 400/404, never 500.

## Found in walkthroughs (fixed)
- `/flights` or `/hotels` opened without a search showed a raw validation message and the title "Flights undefined to undefined" → friendly "Where would you like to fly? / Where are you staying?" prompt.
- A page loaded inside a demo could fetch real data before the demo session was known → API calls wait for the first session check.
- Leaving a demo could land on the sign-in page, and its first requests went to the ended sandbox → the app leaves demo mode synchronously and navigates first (back to the console switches the account first).
- Analytics: five KPI cards wrapped 4 + 1; the chart grid squeezed charts at tablet widths; the bookings line fell to zero in recent weeks because seeded history had no bookings for upcoming trips → fixed grid, auto-fit charts, and ~90 seeded bookings for the next 45 days (on seats/rooms already counted as sold).
- Admin Suppliers: supplier names rendered in table-header capitals → plain cells.
- Seeded adjustment note mentioned a seat fee on a hotel's statement → note matches the supplier type.
- Admin Tickets: statement queries couldn't be filtered, and "Resolved" had no tab → type and status filters.

## Measurements
- Database (dev, full seed): 13.5 MB data + 7.9 MB indexes ≈ 21.5 MB; with 20 sandboxes (the cap) ≈ 29 MB — under 6% of the 512 MB M0 limit.
- Analytics API: ~0.5–0.6 s for 30 and 180 days on the seeded data (home connection to Atlas); the dashboard renders in well under the 3 s target.
- Creating a demo: ~2 s (≈ 41 s for 20 back to back from a home connection).

## Live verification (after merge, re-seed and deploy — https://atlas-travel-two.vercel.app)
- Production database re-seeded: 52 suppliers, 144 services, 8,532 departures, 48 hotels, 14 offers, 914 synthetic bookings (88 upcoming), 215 statements over 6 months.
- API smoke test: flight search, featured hotels, offers (themed artwork), admin sign-in, analytics 30 days 0.26 s / 180 days 0.29 s, 215 statements across Apr–Sep, pricing limits.
- Demos on Vercel: hotel and airline demos start, show only seeded guests, and leave cleanly to the homepage (found and fixed live: leaving briefly bounced to sign-in).
- Lighthouse (mobile settings): home — performance 86 · accessibility 100 · best practices 100; offers — 84 · 98 · 100; flight results — 84 · 98 · 100.

---

# Interactive phone QA (8 Oct 2026, after the phone redesign)

Why this round: the owner found the travellers picker rendering as a transparent panel off the side of the search card on an iPhone. My earlier checks were screenshots and page-width measurements — the picker had never been opened after the redesign. This round opened, tapped and double-tapped every control at 390×844 (iPhone) and checked the shared pieces again at 1280px, in real and demo (sandbox) sessions for traveller, airline, hotel and admin.

**Root cause of the reported bug:** the phone rule turning the travellers dropdown into a bottom sheet was placed *above* the base rule in `pages.css`; with equal specificity the later base rule won. A cascade check (`npm run check:css`, now part of `npm run lint`) found 8 more phone declarations silently overridden the same way (result-card padding, font sizes, photo aspect) — all moved and fixed.

| Area | Found | Fixed |
|---|---|---|
| Home search | Travellers picker not a sheet (the reported bug) | Bottom sheet with a dimmed page behind it |
| Phone styles | 8 phone overrides never applied | Moved after their base rules; cascade check added to lint |
| Filters / any long dialog | "Show N stays" sat 500px below the screen | Dialog title (with ×) and footer (main action) stay pinned; safe-area padding was being overwritten by the shorthand — fixed |
| Saved travellers | Double-tap Save created the same traveller twice | Atomic conditional add on the server (+ test); client re-entry guard |
| All create/save actions | Double-tap could create two offers, tickets, messages, services, reschedules or rate-card versions | Server double-tap guard (10 s, per user + request); the duplicate's refusal is ignored by the client; a failed request can be retried at once (+ tests) |
| Hotel rooms | Double-tapping Select cleared the choice | Select keeps the chosen rate |
| Checkout | "Adult 2" heading collided with the field above | Legend inside the row with spacing |
| My trips | Price indented under the details | Left-aligned on phones |
| Saved travellers list | Buttons wrapped under the name on some cards | Always beside the name |
| Console search bars | Date + text field squashed ("Flight n…") | Fields wrap to usable widths |

**Verified working (no change needed):** menu panel and every link; tabs; swap; same-city and date validation; search double-submit (one navigation); sort; Modify search; flight seat picking/moving/double-tap (36px seats, no inner scroll); offer codes (invalid / valid / remove); failed then successful payment, triple-tap Pay → one booking; cancel dialog + double-tap → one refund; help dialog; notifications panel (full width, mark all read, closes on outside tap); photo viewer (next, counter, Escape); departure Stop/Resume sales, Reschedule and Cancel dialogs (double-tap cancel → once); new service (double-tap → one); rate card preview and save; special-request reply (once); offer create/pause with confirmation; statement query dialog; hotel property save; reservation cancel; analytics filters dialog, tabs and data tables; supplier suspend/reactivate (one audit entry); ticket reply/escalate/resolve (once); mark as paid; settings saves; bookings search/detail; admin offer create. Every page 390px wide (no sideways page scroll); desktop unchanged.

New: **Admin → Users** (owner's choice: read-only list) — tested at 390px and by `admin-powers.test.js`.

---

# Owner additions QA (9 Oct 2026): commission per product/supplier, adjustments, per-night hotel inventory, occupancy pricing, UI fixes, motion

**Plan:** automated tests for every new rule, success path and main failure path (Vitest + Supertest); the CSS cascade check; the migration run twice on the dev database plus an overbooking audit; a re-seed; then an interactive pass in the browser at 1280px and 375px — open every new dialog, tap every new button, try one invalid input per form and double-click every submit; then deploy, migrate production and verify live.

**Automated:** server 147 tests (new: `commission.test.js` — schedule maths, override precedence, from-next-month statements, audit/notifications, guard rail, 403/404, several lines per query, standalone adjustments, carried-forward month and its balance, analytics; `hotel-inventory.test.js` — per-night blocking and back-to-back stays, race for the last room, cancellation frees exactly its nights, date-range stop-sell keeps bookings, room count below bookings refused, occupancy pricing pure and through the API; updated booking/console/operations/foundation tests for the counter's removal). Client 38 tests (new motion tests). Lint clean; cascade check clean.

**Migration (dev):** `npm run migrate:phase2b` → 48 hotels, 128 room types, 48 rate cards, commission schedule created; second run changes nothing. Audit after migration and after a re-seed: 0 nights booked above a room type's total.

| Area | Checked | Result |
|---|---|---|
| Home search, 1280px | travellers panel over the Offers cards; adult+child+infant | Panel on top; field reads "3 travellers" (full breakdown in tooltip and for screen readers). Found: Cabin had been narrowed to "Econom▾y" — restored |
| Results → Modify search, 1280px | same party | "3 travellers", Cabin intact |
| Phone travellers sheet, 375px | open, + child, + infant, Done | Sheet pinned to the bottom, Done 44px tall and on screen |
| Settings → Commission | 35% (invalid), then 6% double-clicked | Inline "Between 0% and 30%"; one save, one audit entry (old 5% → new 6%, from November) |
| Suppliers → Commission | 45% (invalid), 4% double-clicked; 375px dialog | Inline error; one save, row shows "4% (own rate) from 1 Nov". Found: the new column pushed the table wider than the page at 1280px — moved under the supplier name |
| Settlement → Add adjustment | empty submit, another supplier's booking, valid double-click; 375px | Field errors; "ATZZZZZZ isn't one of Kala Ghoda Rooms's bookings"; one adjustment, listed as waiting |
| Ticket → Resolve with 2 lines | second amount empty, then double-click | Found: the error didn't say which line — now "Line 2: Enter the amount"; exactly 2 adjustments created |
| Analytics → Supply | bar lengths | Top routes / cities / suppliers stacked full width, bars ~2× longer |
| Hotel demo → Property | stop-sell with last night before first; valid range double-clicked; room count 0 | Inline error; "Deluxe Room: stopped 14 Oct – 16 Oct"; "You have 2 “Deluxe Room” rooms booked on 9 Oct…" (wording fixed). 375px: inputs 48px/16px, buttons 44px, no sideways scroll |
| Hotel demo → Pricing | occupancy rule, preview 10% vs 90% booked, save double-clicked | Rule shown; ₹14,250 → ₹17,800 (×1.25); saved once |
| Hotel demo → Statements | rate line | "Your commission: 10% · 15% from 1 November 2026 · set by Atlas" |
| Branded loader / progress bar | page loads | Flight-path loader with status text; top bar during requests |

Console: no script errors; the only console lines are the browser's log of the deliberate 400/409 responses above.

**Live (https://atlas-travel-two.vercel.app, after deploy):** production migrated with `npm run migrate:phase2b` (48 hotels, 128 room types, 48 rate cards, commission schedule; a second run changed nothing; 0 nights booked above a room type's total). API: commission defaults now 10% / 10%, from 1 November airlines 5% and hotels 15%; 52 suppliers with their rate; 228 statements; hotel search and details show per-night availability; analytics 30 days in 0.6 s. Home at 1280px: the travellers panel sits on top of the offer cards, a mixed party reads "N travellers", Cabin isn't clipped; no console errors.
