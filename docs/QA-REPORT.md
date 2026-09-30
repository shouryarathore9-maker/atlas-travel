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
