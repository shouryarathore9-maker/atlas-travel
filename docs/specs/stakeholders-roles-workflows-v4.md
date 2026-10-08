# Atlas: Stakeholders, Roles and Workflows

**Context.** Atlas (flights + hotels) is already built per `prd.md`. This document adds the supplier side and the platform side that the first build skipped. It extends `prd.md`; where it conflicts (for example, admin no longer edits flights or hotels), this document wins. For the most part, we intend to keep as much of the existing website codebase untouched as possible: reuse the existing services, models and screens, and extend them rather than rewriting them.

## 1. Changes needed

**Phase rule.** Every change in this document belongs to Phase 2 unless this document says Phase 3. Rewrite the Phase 1, 2 and 3 lists in `prd.md`, and anywhere else phases are mentioned, to match: Phase 1 stays the shipped MVP, Phase 2 becomes everything below, and Phase 3 holds only what is deliberately deferred. Existing Phase 2 and 3 items that this document does not cover (wishlists, price alerts, user-submitted reviews, round-trip flights) need a decision from me (Open Question 6). Inside Phase 2, work in stages and stop after each stage for review.

**Issues this document addresses**
- Supplier side missing: airline and hotel managers, vendor dashboards, bookings reaching suppliers, and a visitor sandbox to explore them (workflows 2, 3, 11, 24, 25).
- Admin does two jobs, operator and inventory typist. Admin becomes oversight: tickets, analytics, commission, offers, audit (workflows 5, 12, 14, 18).
- No pricing strategy: prices come from a rules-based engine with a rate card per airline and per hotel (section 2.3, workflow 1).
- Supplier-initiated cancellations and reschedules with automatic refunds and notifications (workflows 6 to 10).
- One seating plan for every cabin and aircraft; one meal menu for every cabin (workflows 15, 16).
- Passenger details: duplicate names, age categories, saved travellers (workflow 17).
- No e-ticket or boarding pass (workflows 22, 23).
- No admin analytics dashboard (workflow 12).
- No coupons or offers (workflows 18 to 21).
- No settlement between platform and suppliers (workflow 13).

**What this changes in `prd.md`.** Everything in `prd.md`, `architecture.md` and `AGENTS.md` continues to apply unless it is listed here. Only these no longer hold:
- **Admin is no longer the inventory manager.** The admin persona, the "admin area creates, edits and deletes flights and hotels" scope, and user stories 13 to 15 move to airline and hotel managers. Admin becomes oversight.
- **Roles are no longer just `traveler | admin`.** `airline_manager` and `hotel_manager` are added, scoped to a supplier organisation, and the inventory routes under `/api/admin/*` move to manager-scoped routes.
- **Prices are no longer typed in by hand** on the flight and hotel forms. They come from a rules-based pricing engine.
- **Refunds are no longer always computed from the booking's frozen cancellation policy.** Supplier-initiated cancellations, and cancellation after a supplier reschedule, refund in full.
- **"A user only sees their own bookings" gains two exceptions:** a manager sees bookings on their own flights or hotels, and admin sees all.
- **The admin analytics dashboard moves from Phase 3 into scope.**
- **Coupons and offers move from deferred (Phase 2 and Out of Scope) into scope.** Admin can create platform-funded offers and pause any offer; managers create offers for their own supplier only. This gives admin no control over original prices, flights, hotels or refunds.
- **A booking's total can now include a discount line.** Refunds are computed on the amount actually paid.
- **Settlement moves into scope.** The read-only commission and payouts report becomes frozen settlement statements with line queries, adjustments and mark-as-paid.
- **Flights gain an e-ticket at confirmation, and a time-based web check-in with a boarding pass.** The `prd.md` line "a seat is assigned at check-in" now has a real step behind it.
- **Glossary:** the PNR entry changes (flights have a separate airline-style PNR as well as the Atlas booking reference), and "Taxes & convenience fee" drops "convenience fee", since Atlas charges none.
- **Hotels are one supplier per hotel.** There are no property groups; every hotel has its own manager.
- **Customer-initiated cancellation uses platform-owned terms.** The refund formula stays as it is. The terms a fare tier or rate plan carries now come from a small set of platform cancellation templates that suppliers pick from; suppliers no longer write their own cancellation fees. Supplier-initiated cancellations still refund in full.
- **Seat maps, meals and passenger rules change** (workflows 15 to 17). The single 30-row 3-3 seat map for every flight (PRD Decision 4), the single meal menu, and the Adult/Child age groups are replaced.
- **The footer gains "Try as ..." sandbox entries** (section 2.5). The footer line stating that everything is simulated stays.
- **Phases are rewritten** (see the phase rule above).

**How to use it.**
1. Read this document, `prd.md`, `architecture.md`, `design.md` and `AGENTS.md` in full.
2. Design the state machines, endpoints, data-model changes and edge cases yourself, and write the workflow specs. Then update `prd.md`, `architecture.md` and `design.md` first, list everything you decided, and **wait for my approval before writing any code**. Log every data-model change in `architecture.md`.
3. **Ask first; never decide a product question silently.** Whenever a product or user-journey question is not answered here (a "user" being any stakeholder: traveller, airline manager, hotel manager, admin, visitor), ask it with the `AskUserQuestion` tool in the middle of your turn. Give two to four options, put your recommended option first and label it, and make sure I can type an option you did not list. Batch related questions into one call. The **Open Questions** appendix lists the questions I already know about; ask those first, then add yours. Record each answer in `prd.md` once I give it.
4. Flag gaps and red flags in my thinking the same way, as a question with options.
5. **Flag and add any user journeys or workflows that are missing** from section 3.
6. Plan a stage order inside Phase 2 and stop for review after each stage.

## 2. Stakeholders, roles and responsibilities

### 2.1 Stakeholders

Atlas is a marketplace. Each decision belongs to whoever owns it in the real world:
- **Suppliers** (airlines, hotels) own inventory, prices and policies.
- **The platform** owns discovery, booking, payment, tickets and oversight.
- **Travellers** book, travel and ask for help.

| Stakeholder | Why they exist |
|---|---|
| **Visitor** (signed out) | Browses, searches and reads reviews, including the homepage offers and each offer's "About this offer" page. Cannot book, so cannot apply an offer; offers limited to the first 3 bookings ask them to sign in. Can open a throwaway sandbox of a supplier or admin console from the footer (section 2.5). |
| **Traveller / Booker** | Books and pays, manages trips, asks for help. The booker may differ from the travellers. Applies codes, receives automatic offers, and sees the discount at checkout and on refund receipts. |
| **Airline Manager** | Runs one airline's flights, fares and rules. Creates supplier-funded offers for its own flights and queries lines on its settlement statements. |
| **Hotel Manager** | Runs one hotel: its rooms, rates and policies. Creates supplier-funded offers for its own hotel and queries lines on its settlement statements. |
| **Platform Admin** | Oversees the platform: tickets, analytics, commission, audit. Creates platform-funded offers, pauses any offer, resolves statement queries and marks statements paid. Does not run supplier inventory. |

**System actors (simulated, no login):** the mock payment gateway; the in-app notification service; the daily scheduler. Regulator-style refund rules are policy inputs, not an actor.

**Support and Finance are not separate roles.** They are sections of the admin console.

**Suppliers are assumed already onboarded and verified.** Their catalogue is preconfigured from seed data, and managers can edit it.

### 2.2 Roles and responsibilities

Every airline and every hotel is its own supplier organisation with exactly one manager account: one manager per airline (4) and one per hotel (48), plus the admin and the existing demo traveller. Managers see and change only their own organisation's data. No airline or hotel may be left without an owner. Passwords are never committed: they live in the same non-public secrets file as the admin's (you may reuse it), and these logins are not publicly available, just like the admin one. How to manage 52 credentials sensibly is Open Question 4.

All signed-in users get an in-app notification bar.

#### Traveller / Booker
- **Sees:** prices and policies, including what happens if the airline or hotel cancels; their own bookings and statuses; an e-ticket (flights) or voucher (hotels), and a boarding pass after check-in; refund receipts, with the offer line; ticket threads and replies; notifications; the discount as its own line at checkout; an "Offers available today" section on the homepage, directly above featured destinations, in the same card style with a "View all" link, where each card opens an "About this offer" page (layout to follow the Yatra reference screenshots, attached with the prompt).
- **Changes:** books and pays (passenger details, seats and meals follow workflows 15 to 17); enters or removes an offer code at checkout; checks in online for flights (workflow 23); cancels under the platform's cancellation terms, shown before booking (existing refund rules); adds a special request (hotels and flights); raises a "my booking has a problem" ticket.
- **Is told:** supplier cancellations or reschedules and the resulting refund; replies to requests and tickets; a receipt for refunds on their own cancellations; when an offer is no longer valid at payment and the total changed; when a supplier cancellation restores their redemption.
- **Cannot touch:** other people's bookings; prices; offer rules; stacking offers; cancellation terms.

**Homepage trust point (all visitors):** "No convenience fee", meaning Atlas adds no booking fee and the traveller pays the fare plus taxes only. Confirm the checkout label "taxes & fees" contains no Atlas charge before using this claim.

#### Airline Manager
- **Sees:** own flights with seats sold, load and revenue; passenger lists, seats, meals and special requests; escalated tickets; own settlement statements (workflow 13); own offers with redemptions and the discount cost to them; the offer, discount and funder on each booking; the effect of a cancellation or reschedule (bookings affected, refunds issued).
- **Changes:**
  - adds, cancels and reschedules flights, and stops sales
  - sets fares through the pricing inputs
  - sets seat fees and blocked seats
  - chooses the aircraft model, which fixes the cabins and seat layout (workflow 15); the same aircraft model has the same layout for every airline, and blocking seats is the only airline-level change to it
  - sets the meals offered in each cabin (workflow 16)
  - sets baggage for future bookings, and picks which platform cancellation template each fare tier uses (section 2.4). Airlines do not write their own customer-cancellation fees
  - creates, edits, pauses and resumes offers for their own flights (workflow 18)
  - queries a line on a settlement statement (workflow 13)
  - replies to special requests and escalations
- **Is told:** new bookings; traveller cancellations; special requests and escalations; statement ready, query answered and paid; own offer expired or exhausted.
- **Cannot touch:** other airlines' data; platform commission; the frozen policy on existing bookings; other suppliers' offers; platform offers; the offer frozen on an existing booking; the platform cancellation templates.

#### Hotel Manager
- **Sees:** reservations; occupancy and revenue per property; special requests; escalated tickets; own settlement statements (workflow 13); own offers with redemptions and the discount cost to them; the offer, discount and funder on each reservation; the effect of a cancellation they trigger.
- **Changes:**
  - room types, amenities and photos (photos are picked from a preset gallery; no uploads)
  - rates through the pricing inputs
  - availability and stop-sell
  - which platform cancellation template each rate plan uses (section 2.4). Hotels do not write their own customer-cancellation fees
  - cancels a reservation the hotel cannot honour
  - creates, edits, pauses and resumes offers for their own hotel (workflow 18)
  - queries a line on a settlement statement (workflow 13)
  - replies to special requests and escalations
- **Is told:** new reservations; traveller cancellations; special requests and escalations; statement ready, query answered and paid; own offer expired or exhausted.
- **Cannot touch:** other hotels' data; platform commission; the frozen policy on existing bookings; other suppliers' offers; platform offers; the offer frozen on an existing booking; the platform cancellation templates.

#### Platform Admin
- **Sees:** the analytics dashboard (workflow 12); all bookings; all special requests and vendor replies (a read-only list, no notification); all tickets; settlement statements, supplier queries and adjustments (workflow 13); all offers, platform and supplier, with redemptions and discount cost by funder; the audit log.
- **Changes:** the platform commission rate; the platform cancellation templates (future bookings only, audit-logged); replies to, closes or escalates tickets; creates and edits platform offers; pauses or resumes any offer; resolves statement queries (no change, or an adjustment on the next statement); marks statements paid.
- **Is told:** new tickets; statement queries; when a platform offer expires or is exhausted.
- **Cannot touch:** flights, hotels, prices, or refunds (refunds are never manual); a statement once frozen.

**Pricing rule for the whole system:** prices come from a rules-based pricing engine using inputs the supplier sets. They are never hand-entered per flight by an admin and never random seed values. Offers apply after the engine's price and appear as a separate line; they never change the engine's output.

### 2.3 Pricing engine and rate cards

**Problem this solves.** Today every flight or hotel room outside the seed is typed in by hand, with every price entered manually. There is no structured way to price, no allowance for real-world inflation, and no difference between booking months ahead and booking the same day.

**Rule.** Each airline and each hotel owns one **rate card**: a set of inputs. Prices are never stored per flight or per room. They are computed from the rate card by one pure function, used for search results, details pages and the re-pricing at payment. A booking keeps a frozen snapshot of what was charged. Offers apply after the engine's price and never change it. Claude Code generates reasonable default inputs for every rate card, researching what real-world costs and ranges look like; do not over-engineer it.

#### Airline rate card

| Rule | Example input the airline sets |
|---|---|
| Base rate | ₹ per km, per cabin (business as a multiplier). The base may be a formula of variables, each either growing over time at a fixed rate from a fixed starting value (both the starting value and the growth rate editable) or a manually updated data point. This is how real-world inflation enters. The airline can configure the formula; Claude Code creates a sensible default modelled on how airlines build a base rate. Keep it simple. |
| Time of day | Early-morning ×0.95, midday ×1.0, evening peak ×1.10, late-night ×0.95 |
| Day of week | Mon–Thu ×1.0, Fri ×1.12, **Sat ×1.05**, Sun ×1.12 |
| Days to departure | 45–60 days ×0.95, 21–44 ×0.85, 7–20 ×1.0, 3–6 ×1.25, 0–2 ×1.5. Flights are bookable up to 60 days ahead; the 45–60 band keeps prices from falling the further ahead someone books, since real fares bottom out around 21–28 days. |
| Demand | Seats sold in the cabin: under 40% ×1.0, 40–70% ×1.15, over 70% ×1.35 |
| Season or event | Date ranges with a multiplier (festivals, holidays). A festival range replaces the day-of-week rule for those dates: every day is uniformly higher and the mid-week discount disappears. |
| Fare tiers | Saver ×1.0, Flexi ×1.2, each with its baggage and the platform cancellation template it uses (section 2.4). Date-change terms are shown for information only, since modifying a booking is out of scope. |
| Guard rails | Floor and ceiling as a multiple of base |
| Ancillaries | Seat prices (window, aisle, extra legroom), meal prices |
| Route overrides | A specific route's multiplier or fixed base rate |

**Real-world patterns behind this card.** Domestic fares tend to bottom out when booked 21 or more days before departure, rise gradually until about day 7, then climb more steeply. Weekends generally cost more than weekdays, but events override the pattern: in festival weeks (Holi, Diwali, Navratri, Christmas) every day is uniformly higher. Different airlines' prices on the same route and window are strongly positively correlated, so default inputs for the four airlines should sit close together rather than being independent.

#### Hotel rate card

Each hotel has one rate card, and a stay's price is computed night by night.

| Rule | Example input the hotel sets |
|---|---|
| Base rate | ₹ per night per room type (Standard, Deluxe, Suite) |
| Day of week | Sun–Thu ×1.0, Fri–Sat ×1.25 |
| Season or event | Date ranges with a multiplier (peak season or festival ×1.3, off-season ×0.8) |
| Lead time | 30+ days ahead ×0.9, 7–29 days ×1.0, 0–6 days ×1.1 |
| Rate plans | Flexible ×1.0 (platform "flexible" cancellation template), Non-refundable ×0.9 (platform "non-refundable" template), optional breakfast add-on per person per night |
| Guard rails | Floor and ceiling as a multiple of base |

**No occupancy factor.** Hotel prices do not depend on how full the property is. Availability therefore stays a simple counter per room type, and no per-night data is needed. Only flights have a demand factor (seats sold).

### 2.4 Customer cancellation terms

The platform owns the terms for cancellations made by the traveller; suppliers do not negotiate them. This keeps disputes between booker and platform small.
- The platform defines a small, fixed set of **cancellation templates** (for example flexible, standard, non-refundable): a free-cancellation window and a fee after it. They are derived from the policies already in the seed, so existing behaviour does not change.
- A fare tier or hotel rate plan chooses one template. Suppliers cannot type their own fees.
- The template's terms are shown before booking and frozen on the booking (the existing frozen policy), so a later template edit never changes what a traveller agreed to. The refund formula is unchanged and runs on the amount actually paid.
- Admin can edit a template for future bookings only (audit-logged). Admin still never issues or edits refunds.
- Supplier-initiated cancellations and cancellation after a supplier reschedule always refund in full, regardless of template.

### 2.5 Visitor sandbox ("Try as ...")

**Purpose.** Let any visitor, including a recruiter, explore the supplier and admin sides without an account and without touching live data.
- **Entry.** The footer on every page offers **Try as airline manager**, **Try as hotel manager** and **Try as Atlas admin**. No email or sign-up. For an airline the visitor picks one of the 4; for a hotel they pick from the best-hotels set (4★ or 5★ with a guest rating of 4.0 or more, the same set as the homepage).
- **What is created.** A private, temporary copy of only that one airline or hotel (inventory, rate card, bookings, offers, statements, tickets), tagged with a sandbox ID. Never copy all 48 hotels or all 4 airlines; that would exceed the free-tier operations limit. The copy comes with seeded bookings so dashboards are not empty; reuse the existing seed data where possible.
- **Admin sandbox.** It contains everything the admin is meant to be able to see (analytics, bookings, tickets, special requests, offers, statements, audit log), built from a small seeded dataset. Admin actions work inside the sandbox, but they act only on the sandbox copy and never change real data.
- **Notice.** On entry a popup says this is a simulation and changes will not appear on the real website. A persistent banner says: "Demo environment. Data resets automatically. Don't enter real personal details."
- **Footer while a sandbox is active.** The button the visitor chose is replaced by **Back to traveller view**. Pressing it ends the sandbox immediately.
- **Isolation, enforced in the service layer and not only in the UI.** Real travellers and the public catalogue see only documents with no sandbox ID. A sandbox session sees the base data plus its own documents. Nothing a sandbox user does can touch base data. Sandbox sessions cannot call real manager or admin endpoints at all, only sandbox-scoped ones.
- **Deleted as soon as possible.** On exit, when the visitor goes idle (short idle expiry), with a database TTL index as a backstop, and by a daily sweep for anything left. A sandbox must never sit in storage.
- **Guardrails.** A cap on how many sandboxes exist at once; per-sandbox quotas (listings, bookings, total documents); a per-IP rate limit on sandbox creation; strict validation, length limits, escaped output and no raw HTML; free text typed by one visitor never renders on another visitor's screen; no file uploads anywhere, with photos picked from a preset gallery; a `DEMO_MODE` environment variable that switches sandbox creation off; sandbox actions are logged only in the sandbox, never in the real audit log.

## 3. Workflows

Each workflow has a trigger, an actor and an outcome. Existing traveller flows in `prd.md` stay as they are unless a line below changes them.

1. **Supplier sets pricing inputs.** *Trigger:* manager edits pricing inputs. *Actor:* airline or hotel manager. *Outcome:* traveller-facing prices come from the engine using those inputs; existing bookings do not change; the server re-prices at payment, and the traveller is told if the total changed. Offers are re-validated at that re-pricing; if an offer stopped being valid, the traveller is told and the total changes.
2. **Supplier manages catalogue.** *Trigger:* manager edits their flights or hotels. *Actor:* airline or hotel manager. *Outcome:* changes apply to future bookings only; stopping sales hides the item from search without touching existing bookings; items with bookings cannot be deleted.
3. **Booking reaches the supplier.** *Trigger:* a traveller's payment succeeds. *Actor:* traveller, system. *Outcome:* the booking appears in the supplier's reservations and the manager is notified. The reservation shows the offer, the discount and who funds it.
4. **Special request.** *Trigger:* traveller adds a request at checkout (hotels and flights). *Actor:* traveller, then vendor. *Outcome:* the vendor receives it on the booking and is notified; admin can view it (booking detail and a read-only Special requests list) but is not notified; the vendor's reply (accepted, or can't accommodate, plus a comment) reaches the traveller and is written to the audit log.
5. **Booking-problem ticket.** *Trigger:* traveller raises "my booking has a problem" on a booking. *Actor:* traveller, admin, vendor. *Outcome:* admin replies, closes without reply (the traveller sees Closed), or escalates to the booking's vendor, who sees the message and replies to the traveller with admin able to see it.
6. **Airline cancels a flight.** *Trigger:* airline manager cancels a future flight. *Actor:* airline manager, system. *Outcome:* every affected booking is automatically refunded in full with no fee, travellers are notified with a receipt and a way to rebook, the flight can no longer be booked, and the vendor-cancellation policy is stated on flight details pages. The refund covers the amount actually paid after any discount, the receipt shows the offer line, and the offer redemption is restored.
7. **Airline reschedules a flight.** *Trigger:* airline manager changes a flight's times. *Actor:* airline manager, system. *Outcome:* bookings stay valid with the new times, and affected travellers are notified and may keep the trip or cancel for a full refund until 24 hours before the new departure; with no response the trip is kept. Any refund covers the amount actually paid after discount, and a cancelled booking's redemption is restored.
8. **Hotel cancels a reservation.** *Trigger:* hotel manager cancels a reservation they cannot honour. *Actor:* hotel manager, system. *Outcome:* the guest is refunded in full automatically, notified with a receipt and a way to find similar stays, and the vendor-cancellation policy is stated on hotel details pages. The refund covers the amount actually paid after any discount, the receipt shows the offer line, and the offer redemption is restored.
9. **Traveller cancels (existing, extended).** *Trigger:* traveller cancels a booking. *Actor:* traveller. *Outcome:* refund rules are unchanged, plus a refund receipt appears in their notifications. Refunds run on the amount actually paid, and the offer redemption is not restored.
10. **Notifications.** *Trigger:* any event above. *Actor:* system. *Outcome:* the right users see entries in their notification bar (refunds, receipts, replies, new reservations, requests and tickets; offer expired, offer exhausted, redemption restored; statement ready, query answered, paid), unread until opened. The bar has a **Mark all as read** action so old entries stop showing as new.
11. **Vendor overview.** *Trigger:* a manager opens their overview. *Actor:* airline or hotel manager. *Outcome:* they see bookings, revenue and load or occupancy for their own items only, plus redemptions and discount cost for their own offers.
12. **Admin analytics dashboard.** *Trigger:* admin opens Analytics. *Actor:* admin. *Outcome:* a dashboard showing exactly the data below, on one page or several, whichever stays uncluttered (drop anything that clutters). The attached screenshot is a reference for the look only (KPI strip across the top, filters in a right-hand panel, clean line and bar charts); its data categories do not apply.
   - KPI cards, each with the change vs the previous period: total bookings, gross booking value, net revenue (commission), take rate, average booking value.
   - Cancellation rate, split into user-cancelled vs supplier-cancelled, and total refunds issued.
   - Payment success vs failure rate.
   - Bookings and revenue over time, with a flights vs hotels split.
   - Top routes, top destination cities, and top suppliers by gross booking value.
   - Lead time (travel date minus booking date), with cancellation rate by lead time.
   - Flights: seat load factor. Hotels: occupancy proxy and average daily rate (ADR), derived from bookings over the selected period with no new per-night storage.
   - Conversion funnel (search, view details, start checkout, pay, confirmed) and searches with zero results. This needs a small event log written at those steps.
   - Offers: redemptions, discount given by funder, and the share of bookings with an offer.
   - Filters: date range, flights or hotels, supplier.
   - Seed a few hundred historical bookings over the past couple of months with mixed statuses, so the dashboard is never empty.
   - Net revenue counts only completed bookings, so it matches settlement. Gross booking value counts at booking time. Take rate is net revenue divided by the gross booking value of **completed bookings only**, so both sides use the same basis. Net revenue is read from the same commission calculation as the settlement statements, using the rate stored when that booking was settled (the current config rate only for bookings not yet in a statement), so a later rate change never rewrites history.
13. **Settlement statements.** *Trigger:* a settlement period closes. *Actor:* system, supplier manager, admin. *Outcome:* each supplier gets a frozen statement for the period, replacing the old read-only report; managers see only their own, and statements are never edited. A booking counts as completed once its travel date has passed, and no one marks it; nothing about a booking changes after it enters a statement, so corrections are adjustments only. A settlement period is one calendar month (fewer documents on the free tier). A hotel booking counts as completed once its check-out date has passed. When a traveller cancels and a cancellation fee is retained, the supplier keeps the fee and commission applies to it.
   - A statement lists gross before discount, discount split by funder, refunds, commission, and net owed to the supplier.
   - The commission rate is stored on each statement, so a later rate change affects only future statements.
   - Platform-funded offer: the supplier is paid as if no offer existed (commission on the pre-discount base); Atlas absorbs the discount, so Atlas's take on that booking is commission minus discount, which can be negative and is shown. Supplier-funded offer: the discount comes out of the supplier's side, and commission is charged on the amount after discount.
   - The supplier can query a line with a note. This reuses the ticket system with a new type and the booking reference, in the opposite direction (supplier raises it, admin answers).
   - Admin resolves a query as no change, or applies an adjustment that appears as a line on the next statement.
   - Admin presses Mark as paid with a mock reference, and the supplier is notified.
   - Analytics reads net revenue from the same commission calculation.
14. **Audit trail.** *Trigger:* any manager or admin change to inventory, pricing inputs, policies, cancellation templates, cancellations, special-request replies, tickets, commission, offers (create, edit, pause, resume, the admin kill switch) or statements (adjustments, mark as paid). *Actor:* system. *Outcome:* admin can review who changed what and when. The audit log is a permanent, append-only record of staff actions (who, what, when, before and after), reviewed after the fact. It is not a notification feed. Notifications are per-recipient, temporary, and tell someone that something needs attention or has happened to them. One event can appear in both, for different reasons.

15. **Seat selection by cabin.** *Trigger:* traveller reaches seat selection on a flight booking. *Actor:* traveller. *Outcome:* only the seats of the cabin they searched for (business or economy) are shown, laid out according to that flight's aircraft type; a flight whose aircraft has no business cabin offers no business fares. Every aircraft type in the seed has its own realistic layout (for example an A321neo with 2-2 business in rows 1 to 4 and 3-3 economy behind, or an ATR 72 with 2-2 economy only); research or assume sensible layouts for each aircraft type used and record the assumptions in `prd.md`. The same aircraft model has the same layout for every airline; blocked seats are the only airline-level change.
16. **Meal options by cabin.** *Trigger:* airline manager edits the meals for a cabin, or a traveller reaches meal selection. *Actor:* airline manager, traveller. *Outcome:* the airline decides its own meals per cabin. Where it has set nothing, a platform default menu applies, with a separate default for business and for economy (today's common menu becomes the economy default). A traveller only ever sees the menu for the cabin they are flying.
17. **Passenger details.** *Trigger:* traveller enters passengers at flight checkout. *Actor:* traveller. *Outcome:* each passenger has separate first and last name fields (keep the existing name rule already implemented, which allows apostrophes and dots, for example D'Souza and S. Kumar, within its existing length limits) and a note that the name must match their Aadhaar ID (not verified, display only). Duplicate names within a booking are rejected server-side after normalising (trimmed, case-insensitive, spaces collapsed), with an error that suggests adding a middle name or suffix, since real people can share names. Each passenger is an adult, a child (2 to 11) or an infant (under 2): infants take no seat, cannot outnumber adults, and a child cannot travel without an adult. A child pays the full fare; an infant pays a small flat fee that is not engine-priced. Saved travellers can autofill, and the same duplicate check applies there.
18. **Manage offers.** *Trigger:* manager or admin creates, edits, pauses or resumes an offer. *Actor:* airline manager, hotel manager, admin. *Outcome:* platform offers (created by admin, funded by Atlas) apply to flights, hotels or both; supplier offers (created by a manager, funded by that supplier) apply only to that supplier's own items. There is no approval step. Admin can pause any offer as a kill switch (audit-logged); managers see and edit only their own. Edits apply to future bookings only, and a redeemed offer can be paused but not deleted. Discount types are percent off (with a maximum cap) and flat amount off. An offer carries, as a rough idea: a code or "auto", title and description, discount type and value, minimum spend, valid-from and valid-to as booking dates, a redemption limit, product scope, a first-3-bookings flag, and a status (active, paused, expired, exhausted).
19. **Browse offers.** *Trigger:* anyone opens the homepage offers section or the offers page. *Actor:* visitor, traveller. *Outcome:* they see active offers they could use, with plain terms and a plain expiry date; each offer opens an "About this offer" page; an offer limited to the first 3 bookings asks a visitor to sign in.
20. **Apply an offer at checkout.** *Trigger:* traveller enters a code, or an automatic offer is eligible. *Actor:* traveller, system. *Outcome:* at most one offer is applied, and the discount appears as its own line.
   - An offer is a typed code, or automatic (festival and seasonal). A first-3-bookings rule (fewer than 3 paid bookings on the account; a supplier-cancelled booking does not count) can sit on either.
   - One offer per booking, no stacking. A typed code replaces an automatic offer. The traveller always sees which offer is applied.
   - It applies to the flight base fare or the hotel room charges (the sum of the nights), never to seat fees, meals, taxes or government charges, and never exceeds the eligible amount.
   - Tax is recomputed on the discounted base using the pricing engine's existing rule (flights 12% of the base fare; hotel tax is fixed per room per night, so it does not shrink). Do not hardcode a different rule.
   - The price breakdown shows the offer as its own negative line with the offer's name.
   - The code field is a collapsed "Have a code?" section on the review step of checkout, not bolted onto the busy screen (`design.md` rule).
   - The server validates when the offer is applied and again when payment is re-priced. If it is no longer valid, the traveller is told and the total changes; nothing is dropped silently.
   - A redemption counts when payment succeeds, not when the code is applied. If one redemption is left and two travellers pay at once, one gets it.
   - The offer code, title, discount amount and funder are frozen on the booking, so later edits never change it (use the existing `fareBreakdown.discounts` slot).
   - Search results show the engine's price with no offer badge; the discount appears only at checkout.
   - Calm copy: no countdown timers, scarcity lines, flashing badges, or struck-through "was" prices that were never charged. Expiry is shown as a plain date.
21. **Offer expiry.** *Trigger:* the daily scheduler runs. *Actor:* system. *Outcome:* offers past their date or at their redemption limit become expired or exhausted, and their creators are notified.
22. **E-ticket and voucher.** *Trigger:* a booking's payment succeeds. *Actor:* system. *Outcome:* a flight booking gets an e-ticket at confirmation; a hotel booking gets a voucher. **Reference:** a real Indian domestic e-ticket (for example an IndiGo itinerary, with or without an OTA wrapper) shows the booking reference and the airline PNR; per passenger the name, e-ticket number, seat and meal; per flight the airline, flight number, cabin and fare name, departure and arrival with airport, date, time and terminal, and duration; baggage per person (check-in and cabin); the fare breakdown and payment status; cancellation and date-change terms; contact details; and notices such as carrying photo ID. Atlas's version is a simpler subset: booking reference, a separate airline-style PNR, per-passenger name, e-ticket number, seat and meal, flight details, baggage, fare breakdown with any offer, the frozen cancellation terms, and a QR code. Terminal and e-ticket numbers are simulated, deterministic reference data. The hotel voucher shows the booking reference, hotel, guest names, dates, room type, rate plan, meals, payment summary, cancellation terms and any special request, with no QR.
23. **Web check-in and boarding pass.** *Trigger:* traveller presses Check in on a flight booking. *Actor:* traveller, system. *Outcome:* the button is available only from 48 hours to 60 minutes before departure; it assigns seats to travellers who skipped seat selection and produces a boarding pass. **Reference:** a real boarding pass shows passenger name, flight number, route, date, cabin, seat, boarding time (which is not the departure time), gate, a boarding group or check-in sequence number, the booking reference, and a barcode or QR code carrying a compressed copy of those fields. Atlas's version shows the same fields, with gate and boarding time as simulated deterministic values, and a QR that encodes only a signed booking and passenger reference, not personal details. It is time-based only, with no supplier action. Bookings with an infant are told to check in at the airport.
24. **Visitor starts a sandbox.** *Trigger:* a visitor presses a "Try as ..." button in the footer. *Actor:* visitor, system. *Outcome:* a private, temporary copy of one airline or hotel (or the admin console) is created and tagged with a sandbox ID, seeded with bookings, under the caps, quotas and rate limit in section 2.5; the visitor sees the "simulation" popup and the demo banner; the footer shows **Back to traveller view** in place of the chosen button. Nothing the visitor does reaches real data or another visitor.
25. **Sandbox ends.** *Trigger:* the visitor presses Back to traveller view, goes idle, closes the tab, the TTL passes, or the daily sweep runs. *Actor:* visitor, system. *Outcome:* every document carrying that sandbox ID is deleted as soon as possible and the visitor is back on the normal site.
26. **Platform sets cancellation templates.** *Trigger:* admin edits a cancellation template. *Actor:* admin. *Outcome:* the change applies to future bookings only, bookings already made keep their frozen terms, and the edit is audit-logged. Suppliers see which templates exist and pick one per fare tier or rate plan (workflows 1 and 2).

## 4. Constraints

**These apply to everything in this document.**
- Everything in `prd.md`, `AGENTS.md`, `architecture.md` and `design.md` that this document does not change still applies. No real third-party APIs or payments, ever.
- **Stack: free tiers only.** MongoDB Atlas free tier (M0) and Vercel's Hobby plan (free). Believed limits, to be verified against current documentation and not trusted from here: M0 has 512 MB storage, about 100 operations per second and 500 connections; Hobby has daily-only cron with loose timing, a 300 s function limit and non-commercial use only. Nothing in this document may require paying or exceed them.
- **Keep the existing codebase as untouched as possible.** Reuse the existing pricing, inventory and refund services; extend, do not rewrite.

**Rules for the new work**
- **Unbounded growth.** Every collection that grows (notifications, audit log, funnel events, tickets, statements, ledger entries, sandboxes, rate-limit counters) gets a retention rule, TTL or cap, decided with me. The funnel event log is sampled or short-lived and never written per keystroke.
- **No document bloat.** No per-seat or per-night documents; keep seats and nights inside bounded documents. Dated flights must not multiply storage beyond the horizon below.
- **Flight horizon: 60 days.** Rough estimate: about 8,600 dated flights (36 routes × 4 daily × 60 days) against about 3,000 today, which is roughly 17–35 MB raw and 25–50 MB with indexes if each flight stays compact (a short list of taken seats, never a document or object per seat). Raise the existing `SEED_DAYS` to 60 and keep the existing rolling window and daily job. Measure real size and operations; if usage is too high, drop to 30 days rather than redesigning. Seed in batches, and cap how many days one cron run generates so the first catch-up after the change never bursts past the operations limit.
- **Scheduling.** Only daily cron exists. Flight-window extension, offer expiry, statement close and the sandbox sweep share a minimal number of daily handlers (check the Hobby cron-job limit). Each job is idempotent and repairs a missed day by itself, as the flight job already does.
- **Bulk operations.** A supplier cancelling a flight refunds many bookings: process in bounded batches, idempotent, resumable, within the function time limit, with no N+1 queries.
- **CPU.** No heavy work per request: no server-side PDF generation, QR codes generated cheaply (client-side if possible), analytics from bounded or pre-aggregated queries, indexed and paginated.
- **Dependencies.** No new paid or commercially restricted dependencies; check licences for charts, QR and anything else added.
- **Storage.** No file uploads; photos come from a preset gallery.
- **Sandbox.** Copy one item only, cap concurrent sandboxes, short life (section 2.5).
- **Measure, do not guess.** Report real database size and operation counts before and after seeding, and after the sandbox and analytics features exist.

**Post-merge audit (do not start until I approve).** Once all the changes in this document are merged, audit the new additions for anything that could exceed the free-tier limits or require paying: unbounded collection growth, N+1 queries, per-seat or per-night document bloat, bulk operations, sub-daily scheduling assumptions, CPU-heavy requests, new paid dependencies. Measure real database usage, then report the risks (only if they exist) with proposed small fixes. **Do not change anything for this audit until I approve.**

## 5. Risks and QA

QA was already done for the original website (see `docs/QA-REPORT.md`). Do the same for every new addition: plan the scenarios, write the tests in the existing stack, run them, report the results, fix what breaks, and try hard to break the website, especially the new additions. Claude Code owns this section completely. Existing tests must keep passing except where this document deliberately changes behaviour, and such tests are updated, not deleted.

Hot spots to cover at minimum (not a limit): vendor scoping (supplier A must not see or change supplier B's flights, hotels, bookings, tickets, statements, offers or notifications, checked on every endpoint that takes an id); sandbox isolation and abuse (cannot touch real data, quotas and caps, script-injection strings in every free-text field including ticket comments, special requests and offer text); concurrency (last seat, last room, last offer redemption, double-clicking pay, cancel or a mass refund); money (rounding, discounts larger than the eligible amount, refunds on the amount actually paid, a negative platform take, frozen statements staying frozen); time (IST boundaries, the 48-hour to 60-minute check-in window, offer validity dates, "completed" after the travel date); pricing (the engine as a pure function, guard rails, festival override, re-pricing at payment); notifications and the audit log (nothing leaks between users, Mark all as read); and free-tier safety (measured storage, a burst of requests against the operations limit, cron idempotency).

## Appendix A. Open questions to ask me first

Ask each with `AskUserQuestion` (recommended option first, free typing allowed). The recommendation is shown after each. Questions already answered are recorded in Appendix B.
1. **Cancellation templates.** Confirm a small platform-owned template set picked by suppliers, versus one flat policy for everything. *Recommended:* the template set, derived from existing seed policies, because a single flat policy would make Saver and Flexi, and Flexible and Non-refundable, meaningless.
2. **Offers seed freshness.** Fixed dates would leave the demo showing only expired offers within months. *Recommended:* rolling or per-year windows, with festival dates verified from an authoritative calendar rather than memory.
3. **Sandbox details.** Is there a sandbox traveller inside the sandbox so a visitor can complete the loop (vendor creates, traveller books, vendor sees it)? Idle expiry; caps and quotas; reset mechanism (Vercel daily cron or GitHub Actions). *Recommended:* yes to a sandbox traveller, 30-minute idle expiry, Vercel cron.
4. **Credentials for 52 managers.** *Recommended:* one shared password per role family (airline managers, hotel managers) from the non-public secrets file, with predictable account emails.
5. **Existing production data.** *Recommended:* backfill supplier ids on existing bookings, or re-seed if the live site holds nothing worth keeping; ask me which.
6. **Leftover Phase 2 and 3 items** (wishlists, price alerts, user-submitted reviews, round-trip). *Recommended:* all move to Phase 3.
7. **Historical seed depth.** A couple of months is thin for period-over-period and lead-time charts. *Recommended:* 6 months, capped, flagged synthetic.

## Appendix B. Decisions made and assumptions already made

**Decided by me:**
- **Flight horizon:** 60 days, falling back to 30 only if measured usage is too high (section 4).
- **Hotel pricing has no occupancy factor.**
- **Airline and hotel names stay as seeded** (Air India, Vistara and so on). The footer already states everything is simulated; no renaming anywhere.
- **Passenger names:** keep the existing rule.
- **Infants and children:** child pays the full fare, infant pays a small flat fee, no seat.
- **Settlement:** retained cancellation fee goes to the supplier and commission applies to it; hotel bookings complete at check-out.
- **Supplier reschedule:** the traveller may keep or cancel for a full refund until 24 hours before the new departure, defaulting to keep.
- **E-ticket and boarding pass:** simpler versions of real ones, with the fields listed in workflows 22 and 23.

**Assumptions made on my behalf (confirm or replace):**
- **Funding and commission:** the funding rules in workflow 13 are an assumption. Confirm or replace them.
- **Convenience fee:** none exists, so there is no fee-waiver offer type. Confirm that "taxes & fees" contains no Atlas charge.
- **Tax on a discounted fare:** recomputed on the discounted base using the engine's current rule (flights 12% of the base fare; hotel tax fixed per room per night). Confirm that rule.
- **Redemption restore:** restored on supplier cancellation, not on traveller cancellation (an anti-abuse assumption).
- **Automatic offer versus typed code:** a typed code replaces an automatic offer instead of picking the better of the two.
- **Validity dates:** valid-from and valid-to are booking dates for every offer, festive offers included.
- **First-3-bookings:** fewer than 3 paid bookings on the account; supplier-cancelled bookings do not count.
- **Search price display:** results show the engine's price with no offer badge. Showing discounted prices in results is a possible later change.
- **Cancelled bookings and retained fees:** if `prd.md` already says how a retained cancellation fee is treated, that rule runs on the amounts actually paid. Flag it if it does not fit.
- **Admin kill switch:** admin can pause any offer. Confirm this is not "moderation", which is out of scope.
- **Build order:** platform offers first (code, automatic, first-3-bookings); supplier-funded offers and the funding split in the settlement statements second.
- **Platform cancellation templates:** a small platform-owned set that suppliers pick from, instead of each supplier writing its own fees (section 2.4). Confirm via Open Question 1.
- **Saturday flight multiplier:** ×1.05, lower than Friday and Sunday. The time-of-day defaults for midday and late-night are also assumptions. All are editable by the airline.
- **Commission:** one global rate; Claude Code picks a plausible default (around 10%) and tells me what it chose.
- **Special requests:** admin sees them in a read-only list and on the booking, with no notification; the vendor's reply is audit-logged.
- **Take rate:** net revenue divided by the gross value of completed bookings only.
- **Sandbox hotel choices:** the best-hotels set (4★ or 5★, guest rating 4.0 or more).
- **Sandbox admin:** actions work but only on the sandbox copy.
## Appendix C. Decided out of scope

Supplier onboarding and verification; passenger-submitted reviews (reviews stay seeded); manual or goodwill refunds; modifying a booking after creation; user suspension and listing or review moderation; staff sub-roles such as hotel front desk; no-show handling; occupancy-based hotel pricing; gate-scan screens, hotel check-in screens and any checked-in or boarded booking status (web check-in and the boarding pass in workflow 23 stay in scope).

Settlement does not cover virtual cards, payment methods, GST and TCS lines, chargebacks or credit-note documents.

Offers do not cover wallet credit and cashback; referral codes; loyalty points; bank, card or UPI-conditioned offers (leave room in the offer rules for a payment-method condition later); flight and hotel bundle discounts; stacking multiple offers; targeted or personalised offers; an offer approval workflow; bulk or single-use unique code generation; email or push campaigns; per-traveller redemption limits; offer badges on search results; a convenience-fee waiver.

## Appendix D. Seed data for offers

A small, fixed set, none random: a first-3-bookings code; an automatic festive offer covering flights and hotels for the festivals that drive the most travel and hotel bookings (Diwali; Navratri and Dussehra; 2 to 3 days around Holi; Makar Sankranti and Pongal), with booking-date validity; one supplier offer for each of two airline managers and two hotel managers (not all 52), using the supplier names in the seed data; one expired offer and one exhausted offer, so those states can be seen. All are platform offers unless stated.

## Appendix D (continued). Seed data for everything else

Offers are not the only thing that must not open empty. Seed, from the existing seed data where possible and never random: a few hundred historical bookings over the past couple of months with mixed statuses (confirmed, cancelled by traveller, cancelled by supplier); matching settlement statements (some paid, one with a supplier query, one with an adjustment); a few tickets in different states and a few special requests with replies; some notifications; and the rate card defaults for every airline and hotel. The sandbox copy reuses the same data for its one airline or hotel (section 2.5). Historical depth is Open Question 7.
