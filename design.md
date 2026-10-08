# Atlas — Design System & UX Rules (design.md)

*Built from `prd.md`. Governs visual and interaction design for every screen. `prd.md` says what each page contains and how it behaves; this file says how it looks and where things sit (see Page-Level Layouts).*

## Brand Direction
**Positioning:** Atlas is the calm, editorial opposite of MakeMyTrip-style OTAs. Where MMT stacks upsells and flashing offers on every screen, Atlas shows one clear thing at a time and trusts the user. Think high-end travel magazine, not discount marketplace.

**Mood/Vibe:** Luxurious, sophisticated, warm, aspirational.
**Reference feel:** Aman + Monocle + Mediterranean boutique hotel.

**Homepage look:** Reuse the existing concept mockup (`docs/research/06-atlas-homepage-concept-mockup.webp`) as the literal visual target — same full-bleed coastal/Mediterranean hero photograph, same headline treatment, same soft-ivory panel style. Keep it "as similar as possible" to that concept; the only structural addition is the **Flights / Hotels tab switcher**, which sits inside the hero search card (decided default — see Decisions & Defaults), Flights active by default. Copy/buttons are rewritten to match real Atlas functionality instead of placeholder concept text.

## Design Boundaries
- No dense multi-offer banners, no flashing badges, no more than one primary CTA visible per screen.
- Any optional extra (e.g. the offer code field) must be introduced as its own clean step, never bolted onto an already-busy screen — this is the explicit anti-MMT rule from `prd.md`. The code field is a collapsed "Have a code?" section on the review step only.
- Photography and color carry the "luxury travel" feeling; avoid leaning on saturated marketing colors or busy iconography to do that job instead.
- **Offers stay calm (Phase 2):** offer cards use the same card style as featured destinations — photo, serif title, one line, the code in a quiet outlined chip, a plain expiry date. No bank logos, red code buttons, countdown timers, "only N left", flashing or struck-through "was" prices (the Yatra/ixigo references in `docs/research/08–10` are for structure, not styling). Search results never show offer badges.
- **Consoles (Phase 2)** use the same tokens and components as the traveller site, denser: tables, small KPI cards and line/bar charts on white surfaces. One primary button per view still applies.

## Color Tokens
| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#F6F1E8` (Warm Ivory) | Page backgrounds |
| `--color-text` | `#17221F` (Deep Ink) | Primary text, headings |
| `--color-primary` | `#B86B4B` (Terracotta) | Primary buttons, active states, links on hover |
| `--color-secondary` | `#6E7560` (Muted Olive) | Secondary accents, tags, secondary buttons' border |
| `--color-sand` | `#D8C8AE` (Sand) | Dividers, subtle card backgrounds, skeleton loaders |
| `--color-surface` | `#FFFFFF` | Cards/modals floating above the ivory background |
| `--color-error` | `#B84B4B` | Error states (derived from terracotta hue, shifted for clarity) |
| `--color-success` | `#4B7A5A` (olive-shifted green) | Success/confirmation states |

## Typography
- **Headings:** Canela, fallback DM Serif Display, fallback `serif`. Large, generous line-height, used sparingly (hero headline, section titles, confirmation message).
- **UI & body:** Inter, fallback Manrope, fallback `sans-serif`. Used for everything else: forms, cards, nav, body copy.
- Editorial headlines get room to breathe — generous letter/line spacing, never crammed against surrounding content.

## Spacing, Radius, Shadows
- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64 — use multiples of 8 for layout, 4 for tight in-component gaps.
- Radius: 4px on inputs/small controls, 8px on cards, 12px on modals/large panels. Nothing pill-shaped except tags/badges.
- Shadows: avoid heavy drop shadows. Prefer a **1px `--color-sand` border** over a shadow for cards; reserve a soft shadow (`0 4px 16px rgba(23,34,31,0.08)`) only for floating elements like dropdowns and modals.

## Components
- **Buttons:** Primary (solid terracotta, ivory text), Secondary (outline in deep ink or olive, transparent fill), Text/link button (no border, terracotta on hover). No more than one Primary button per view.
- **Cards:** Used for flight results, hotel results, room types, destination highlights. Consistent structure: image (if any) → title → key facts → price → single CTA.
- **Inputs:** Underline or thin-border style consistent with the concept mockup's search bar (rounded pill container holding icon + label + value, used for location/date/traveller pickers).
- **Tabs:** Flights / Hotels switcher inside the hero search card, Flights selected by default — mirrors MMT/Booking.com convention. Active tab uses terracotta underline or filled pill; inactive tab is muted ink-on-ivory.
- **Modals:** Used for filters (below laptop width), the cancel-booking confirmation, console confirmations (cancel departure, reschedule, cancel reservation, mark as paid, pause offer — each states the consequence, e.g. "38 bookings will be refunded ₹2,41,300 in full"), the sandbox popup and supplier pickers. White surface, 12px radius, soft shadow, ivory backdrop overlay. Fare options and the seat map sit inline on the flight page, not in modals.
- **Notification bell and panel (Phase 2):** a line bell icon in the header with a small terracotta count badge (hidden at 0, "9+" above 9). When a new notification arrives the bell swings from its top for about a second (damped ±16° → 0) with a soft E6–G6 chime; reduced motion gets a brief fade instead. "Sound on/off" sits beside "Mark all as read".
- **Photo picker (hotel console):** "Your uploads" (up to 4 tiles, each with Delete while unused, and an "Upload a photo" secondary button) above the "Atlas gallery" grid; picked photos show their order number in a terracotta circle. The panel is a 360px dropdown on laptop and a full-height sheet on phones: each row has a small type icon, title, one line of body, relative time; unread rows have a terracotta dot and a faint sand background. "Mark all as read" is a text button at the top right of the panel.
- **Status badges (Phase 2):** small pills — Confirmed (success), Cancelled (muted ink), Cancelled by airline/hotel (error tone), Schedule changed (olive), Paid / Ready (statements), Active / Paused / Expired / Exhausted (offers), Open / Waiting / Answered / Closed (tickets).
- **Charts (Phase 2):** hand-drawn SVG, thin lines, no 3D or gradients; series colours in this order: `--color-primary-strong` (flights / current period), `--color-secondary` (hotels), `--color-sand` dashed (previous period); gridlines in sand at 50% opacity; values labelled directly where possible; every chart has a "View as table" toggle (accessible equivalent).
- **Photo viewer (lightbox):** full-screen dark overlay for hotel photos; translucent ivory round buttons for close and previous/next, and a pill counter.

## States
- **Hover:** subtle darken/lighten of terracotta (~8%), underline on links.
- **Focus:** visible 2px terracotta outline (never removed) for keyboard users.
- **Active/pressed:** slight scale-down (0.98) or deeper terracotta shade.
- **Empty state:** used for "no flights/hotels match your filters" — editorial illustration or simple line icon, one sentence of copy, a "Clear filters" action.
- **Error state:** inline message under the field in `--color-error`, plus a page-level banner for failed mock payments with a clear retry CTA.
- **Loading state:** skeleton cards (sand-colored blocks) for results lists; a simple centered spinner for full-page transitions (e.g. payment "processing").

## Responsive Rules
| Breakpoint | Width | Notes |
|---|---|---|
| Phone | ~375–767px | See **Phone layouts** below — a designed layout per screen, not "the laptop layout stacked". |
| Tablet | ~768–1023px | 4-column destinations and best-hotels grids; search fields in three columns; filters open in a centred dialog; price summary still a bottom bar. |
| Laptop | ~1024px+ | Full layout as in the concept mockup: sidebar filters + result list side by side, two-column detail pages with a sticky price summary; from ~1280px the search fields fit on one row. |

Since most OTA traffic is mobile, design and test the phone layout first for every new screen, not as an afterthought.

## Phone layouts (≤ 767px)
Phone screens show the **same content** as laptop (no extra or reworded text) arranged for one thumb and a short screen. Reference: Booking.com and Airbnb phone apps for density; Atlas keeps its own type, colours and calm tone.

**Global rules**
- **Header (56px):** logo, the notification bell (signed in) and a **menu** button. The menu opens a panel under the header with every header link — Destinations, Offers, Stays, the role links (My trips, Saved travellers / Supplier console / Admin console), the greeting with Sign out (or Leave demo), or Sign in. Nothing that exists on laptop is unreachable on a phone. The notifications panel opens full-width under the header.
- **Fixed layers budget:** at most one fixed bar at a time, the bottom price/CTA bar on detail pages, ≤ ~100px including the home-indicator area (`env(safe-area-inset-bottom)`): one row — total (and its one-line terms, clamped to two lines) on the left, the single CTA on the right. The header and results summary bar scroll away. Bottom sheets (filters, travellers, dialogs) use `dvh` so Chrome's and Safari's sliding address bars never hide their buttons.
- **Touch:** every control ≥ 44×44px on touch screens (buttons, chips, icon buttons, text buttons, seats); form controls use 16px text (smaller makes iPhones zoom in); hover effects only apply on devices that hover (`@media (hover: hover)`), and cards show a pressed state on tap.
- **Spacing:** the same scale one step tighter — sections 48px apart instead of 64px, card padding 12–14px instead of 16–24px.
- **Swipeable rows:** collections that are grids on laptop — featured destinations, Best hotels, Offers available today (homepage), Similar stays, guest reviews — become a single horizontal row that snaps card by card, with the next card peeking in (cards ~72% wide, destinations ~44%, reviews ~82% as bordered cards). The full Offers page stays a list.
- **Images:** seeded hotel and offer photos also exist at 480px (`name-480.jpg`) and are offered through `srcset` so small cards and phones download the small file; the hero has its own phone image.
- **Dialogs and sheets:** the title row (with the close button) and the footer (with the main action) stay pinned while the content between them scrolls, so a long sheet such as Filters always shows *Show results*. The travellers steppers open as a bottom sheet over a dimmed page.
- **No scroll traps:** nothing scrolls inside the page vertically on phones (the seat map shows in full); wide tables scroll sideways inside their card, never the page.

**Key screens**
- **Home:** search first. The hero photo is a 260px band; the eyebrow and headline overlap its faded lower edge; the search card starts within the first screen and its button is visible without scrolling on a 375×812 phone. Flights: From | swap | To on one row, Departure | Travellers on the next, Cabin, then Search. Hotels: Destination, Check-in | Check-out, Guests, Search. Field icons are hidden; labels stay. Travellers open as a bottom sheet. Native date and city pickers are used (they already open full-screen on phones).
- **Flight results:** filters and sort in one row under the summary; each flight card is ~200px — airline, flight number and rating on the left, price, "per traveller" and View fares on the right, the time line underneath.
- **Hotel results:** horizontal cards — a 112px photo on the left, stars, name, address, rating, amenities (two lines) and badges on the right; under both, the price lines on the left and See rooms on the right.
- **Flight / hotel detail:** content in one column, the compact bottom bar above; the seat map uses 36px seats and no inner scroll; reviews are a swipeable row.
- **Consoles and analytics:** laptop-first by design (prd.md), but usable on phones: section tabs scroll sideways, tables scroll inside their cards, the analytics filters open in a dialog, and no page is wider than the screen.

## Accessibility
- Minimum 4.5:1 contrast for body text (deep ink on ivory comfortably passes; use white/ivory text on terracotta buttons, not terracotta-on-ivory text, to keep contrast safe).
- All interactive elements reachable and operable via keyboard; visible focus ring required (see States).
- Semantic HTML: real `<button>`/`<a>`, proper heading hierarchy, labeled form fields (not placeholder-only labels).
- Seat map and filter checkboxes must be keyboard- and screen-reader-navigable (announce seat number + availability).

## Grid & Layout
- 12-column grid on laptop, 8-column on tablet, 4-column on phone; 24px gutters on laptop, 16px on tablet/phone.
- Max content width ~1280px, centered, with the hero section allowed to go full-bleed edge-to-edge.

## Iconography & Imagery
- Icons: simple line icons (search, calendar, guest, location, filter) — consistent stroke width, no filled/glyph icons except small status dots.
- Imagery: full-bleed, high-resolution (HD) photography for the hero and destination highlights — same coastal/Mediterranean-style image family as the concept mockup. Images are downloaded from a royalty-free stock library (e.g. Unsplash) and committed into the repo rather than hot-linked (decided default — see Decisions & Defaults), so they stay HD and available without an external dependency, and are served from the Vercel CDN alongside the rest of the site.
- Hotel photos and city tiles: consistent aspect ratios (4:3 for hotel cards), real-feeling stock photography rather than generic icons. Flight results use no photos.
- Flight route map: a hand-drawn SVG illustration in a folded-paper ("origami") style — faceted land, patterned sea, a curved route line with a plane, airport markers and city labels; never a map service.

## Motion & Transitions
Kept minimal and functional, not decorative:
- 150–200ms ease for hover/focus/tab-switch transitions.
- Skeleton-to-content fade (200ms) when results load.
- No parallax, no auto-playing carousels — consistent with the "calm, editorial" positioning.

## Loading States
- Skeleton cards for result lists and detail pages (sand blocks in the shape of the final content).
- Spinner + short status text ("Waiting for payment…", "Processing payment…", "Fetching your booking…") for actions with backend round-trips.

## Form Patterns & Validation
- Inline validation on blur, not on every keystroke.
- Error text sits directly under the field, in `--color-error`, with a short actionable message ("Enter a valid email address," not "Invalid input").
- Required fields marked clearly; avoid over-using asterisks — prefer labeling optional fields as "(optional)" instead (mirrors the reference sites' pattern, e.g. hotel special requests or a mobile number at sign-up).

## Microcopy & Tone of Voice
- Editorial, warm, plain — short sentences, no exclamation-heavy marketing copy, no manufactured urgency ("Only 2 left!" style scarcity is explicitly avoided).
- Confirmation and empty states get a touch of the "high-end travel magazine" voice (e.g. "Your trip is booked." rather than "SUCCESS!!").

## Page-Level Layouts (Key Screens)
Where each element from `prd.md` → Page Requirements sits. "Laptop" ≥ 1024px unless noted, "phone" ≤ 767px.

**Header (all pages)**
Logo at the far left, followed by the Destinations, Offers and Stays links (hidden on phones); account links at the far right: the notification bell, then role links (My trips and Saved travellers / Supplier console / Admin console), the greeting and Sign out — or Sign in with a person icon. On phones the role links move into a menu behind the greeting. Solid ivory bar with a sand bottom border.

**Footer (all pages)**
Logo with the "all simulated" line on the left, © year on the right. Below them, a quiet row titled "See how Atlas works behind the scenes" with three text buttons: Try as airline manager · Try as hotel manager · Try as Atlas admin (stacked on phones). While a sandbox is active, the chosen one is replaced by **Back to traveller view**.

**Sandbox banner and popup (Phase 2)**
A full-width olive bar fixed above the header while a sandbox is active: "Demo environment. Data resets automatically. Don't enter real personal details." on the left; "View as a traveller / View as manager" and **Back to traveller view** on the right (wrapping on phones). The entry popup is a 560px dialog: title "You're entering a demo", two sentences, the supplier picker (airline radio list, or best-hotel cards with photo and name), and **Start demo** / Cancel.

**Home**
- Full-bleed hero photo. On tablet and laptop the headline, eyebrow and subtext sit on the left over an ivory wash, with the photo showing on the right. On phones the portrait photo sits at the top and fades into ivory, with the text below it.
- The search card (Flights/Hotels tabs, Flights active) overlaps the hero's lower edge. On laptop (≥1280px) the search fields form a single row with the Search button at the end; on tablet they wrap into three columns; on phones they stack.
- **Offers available today** (above Featured destinations): heading on the left, "View all" on the right of the heading. A 4-column grid (2 columns on phones; horizontal scroll is not used) of offer cards: 4:3 photo on top, a small product label (Flights / Hotels / Flights & hotels), the serif title, one line of summary, then a footer row with the code in an outlined chip (or "Applied automatically") on the left and "Until 9 Nov 2026" on the right.
- **Featured destinations:** section heading on the left, "View all" on the right of the heading. A 4-column grid (2 columns on phones) of photo tiles with the city name and a one-line caption beneath.
- **Best hotels:** heading and subtitle on the left, "View all" on the right. A 4-column grid of hotel cards (2 columns on phones).
- **Quote strip:** photo on the left (about two-thirds width) and the italic quote card on the right; stacked on phones.
- **Promises:** three items in a row (stacked on phones), each with a small line icon. The *One honest price* item carries the "No convenience fee" line.

**Offers page and About this offer (Phase 2)**
- **Offers page:** heading, then filter chips (All / Flights / Hotels) under it, then the same offer-card grid as the homepage (3 columns on laptop, 2 on tablet, 1 on phones).
- **About this offer** (structure from `docs/research/09-ixigo-about-offer.webp`): breadcrumb (Home / Offers / title) at the top. On laptop a 360px **left card** — offer photo on top, product chip, title, a two-row table (Category, Expires on), the code row ("Use code: **CODE**" with an outlined **Copy** button that changes to "Copied" for 2 s) and the single primary button (Search flights / Search hotels) spanning the card width; when the offer covers both, the second is a secondary button. The **right column** holds "About the offer" (bullets), "How to use it" (a numbered list), and "Terms & conditions" (bullets). On phones the card comes first, full width. No phone mock-up graphic.

**Results (flights and hotels)**
- A sticky summary bar at the top: route or city with dates/guests on the left, "Modify search" on the right; editing opens the search form inline beneath it.
- On laptop, filters sit in a 260px sidebar on the **left** of the result list. Below 1024px a "Filters" button opens them in a bottom sheet on phones, or a centred dialog on tablets.
- A toolbar above the list: result count on the left, Filters button and Sort control on the right.
- **Flight card** (laptop): airline, flight number and rating on the left; departure → duration/stops → arrival timeline in the middle; price, "per traveller" and "View fares" on the right. On phones the three parts stack.
- **Hotel card** (tablet and laptop): photo on the **left**, details in the middle (stars, name, area, rating, amenities, badges), and price, nights and "See rooms" in a right-hand column with the button at its **bottom right**. On phones the photo sits on top.
- Pagination is centred below the list.

**Detail (Flight)**
- "← Back" link, then the header: eyebrow (airline · flight number · aircraft), route title, and the schedule (departure time | duration + stops | arrival time) in three columns.
- On laptop the **route map sits in the top-right** of the header, beside the schedule; on smaller screens it sits below the schedule.
- Below that, a main column (Choose a fare → Pick your seats → Add a meal → Baggage & cancellation → Ratings & reviews) with the price summary in a 340px **right-hand column** that stays in view while scrolling.
- On phones and tablets the price summary becomes a bar fixed to the bottom of the screen showing only the total and the Continue button.
- Fare cards sit side by side. The seat map scrolls inside its own box, with the column letters pinned at the top. It draws only the searched cabin of the aircraft configuration: business seats are wider (2-2), economy 3-3 (or 2-2 on the ATR), with the aisle as a gap and row numbers down the aisle; extra-legroom rows have a thin olive outline and a legend entry; blocked seats look like taken seats.
- The "If the airline cancels or reschedules" note sits under Baggage & cancellation as a quiet olive-bordered box.

**Detail (Hotel)**
- "← All stays in {city}" link, then the photo grid. On tablet and laptop, one large photo on the left (two-thirds) and two stacked on the right. On phones, one wide photo with two below it.
- Header (stars, name, address, rating, stay summary), then a main column (description → Amenities → Choose your room → Ratings & reviews) with the "Your stay" summary and Reserve in the right-hand column. The phone bottom bar works as on flights.
- **Room cards:** room details (name, occupancy, bed, amenities, breakfast) across the top; below them a sand divider and one **rate-plan row** per plan: plan name and cancellation terms on the left; "₹X avg per night + taxes" and the stay total in the middle; rooms selector and "Select" on the right (on phones each row stacks: terms, price, then selector and button). The "Add breakfast" checkbox sits under the room details, above the rows. The selected row gets a terracotta left border.
- The "Your stay" summary has a "Night-by-night" disclosure listing each night's price.
- **Similar stays** spans the full width after the two-column area: 4 cards per row on laptop, 2 on phones.
- **Photo viewer:** dark full-screen overlay, photo centred, close (X) top right, arrows at the left and right edges (moved to the bottom corners on phones), counter centred at the bottom.

**Checkout**
- Step label and heading at the top. The forms (step 1) or the traveller summary and payment card (step 2) fill the main column, and the booking summary box sits in the right-hand column with the title in large serif.
- On phones and tablets the summary collapses to a bottom bar showing the total.
- **Payment card:** UPI/QR and Card tabs at the top of the card. In the UPI tab the QR code is on the left and the "Scan with any UPI app…" text and both buttons are on the right (stacked on phones). In the Card tab fields are in two columns, with card number and name on card spanning the full width.
- Error banners sit above the summary card, with their action button on the right.
- **Traveller rows (Phase 2):** first and last name side by side (stacked on phones), the type as a small label ("Adult", "Child 2–11", "Infant — travels with Adult 1"), and "Choose a saved traveller" as a text button above each row. The Aadhaar note sits once under the section heading in small muted text. "Save these travellers to my account" is a checkbox at the end of the section. Special requests is an optional textarea with a character counter.
- **Offer on the review step (Phase 2):** between the traveller summary and the payment card. An applied offer shows as a single line with a small tag icon ("DIWALI12 · 12% off · −₹1,240") and "Remove" as a text button. "Have a code?" is a text disclosure; open, it shows one input and an "Apply" secondary button on one row, with the error under the input.
- **Price changed (Phase 2):** a full-width sand-coloured notice above the payment card — "The price changed from ₹X to ₹Y" with the reason underneath, the summary updated, and the Pay button relabelled with the new total. Not red: nothing went wrong.
- In the booking summary the offer is a separate line in `--color-success` with a leading minus.

**Confirmation**
Centred success icon, heading, email line and booking reference; the trip summary card below; "View my bookings" (primary) and "Back to home" centred underneath.

**My trips**
A narrow centred column. "Upcoming" and "Past & cancelled" headings, each followed by booking cards: details on the left, status badge, amount and refund on the right, with "View details" / "Cancel booking" text actions along the bottom. The cancel confirmation opens as a dialog.

Phase 2 additions to each booking card: the actions row grows to E-ticket/Voucher · Check in/Boarding passes · Get help · Cancel booking (wrapping on phones; Cancel stays last). A rescheduled flight shows a sand-coloured box inside the card with the old time struck through only in that box (it's a real past time, not a fake price), the new time, and Keep new time (secondary) / Cancel for a full refund (text). A supplier's special-request reply appears as a quoted line under the details.

**E-ticket, voucher and boarding pass (Phase 2)**
- Printable single-column pages (max 760px) on white, with a print stylesheet (no header/footer, black text, page breaks between passes).
- **E-ticket:** top band with the Atlas logo on the left and "E-ticket" + booking reference and PNR on the right; a flight block (airline, flight, cabin and fare; departure and arrival in two columns with airport, terminal, date and time; duration in between); a passenger table (name, type, e-ticket number, seat, meal); baggage; fare breakdown; terms; notices; the QR code bottom right.
- **Voucher:** the same top band ("Hotel voucher"), hotel name and address, a two-column stay block (check-in | check-out), guests, room and meals, payment summary, terms, special request and reply. No QR code.
- **Boarding pass:** one card per traveller, styled like a paper pass: a large route (DEL → BOM) and flight number on the left; name, date, cabin, seat, gate, boarding time and sequence in a grid; the QR code on the right half behind a dashed "tear" line (stacked on phones).

**Saved travellers and help tickets (Phase 2)**
- **Saved travellers:** a narrow centred column like My trips; each saved person is a row with name and type on the left, Edit / Delete text actions on the right; Add opens an inline form at the top.
- **Help ticket:** a narrow column; the booking summary line at the top, the status badge, then the conversation as stacked messages (traveller on the right in a sand bubble, Atlas support and the airline/hotel on the left in white bubbles with the author label), and the reply box at the bottom.

**Sign in / Sign up**
A single centred card with the form and a link to the other page.

**Supplier and admin consoles (Phase 2)**
- **Shell:** the normal header; under it a console bar with the supplier name (or "Atlas admin") on the left, and a left sidebar navigation on laptop (220px: Overview, Services/Hotel, Departures/Reservations, Pricing, Policies, Requests & tickets, Offers, Statements — or for admin: Analytics, Bookings, Suppliers, Tickets, Special requests, Offers, Settlement, Settings, Audit log). Below 1024px the sidebar becomes a horizontal scrolling tab row under the console bar.
- **Lists:** a toolbar row (search and filters on the left, the one primary action — e.g. "Add service", "Create offer" — on the right), then a table on a white surface (scrolls sideways on phones), with row actions as text buttons at the end, and centred pagination.
- **Forms** (service, room type, offer, rate card): a narrow centred column of cards; repeating rows for bands (time of day, days to departure, demand, seasons, route overrides) with "Add band" / "Add season" text buttons and a remove (×) icon button per row. On the rate card each optional rule's card has an **On/Off switch** in its header; when off, the card's rows are greyed out (kept, not deleted) and a muted note says "Off — counts as ×1.0". Validation errors appear under the offending row. The **rate card** editor shows the price preview in a sticky right-hand panel (sample route or room, a date, the resulting price and each multiplier that applied).
- **Departure detail:** header with flight, date, route and status; a seats-sold bar per cabin; actions (Stop sales, Reschedule, Cancel departure) as secondary buttons on the right (Cancel departure in error tone); the passenger table below.
- **Suppliers (admin):** one table — supplier (name in bold, kind and code beneath), manager email, upcoming bookings, status badge (**Active** in success tone; **Suspended** in error tone with the date and reason beneath), and a secondary **Suspend** / **Reactivate** button. Suspend opens a confirmation dialog listing the three effects (off sale, manager locked out, existing bookings untouched) with a required reason box and an error-tone **Suspend supplier** button.
- **Users (admin):** a search bar (name or email, role filter, Search), an *Include seeded history accounts* checkbox, then a table — name (link), email, role (with the supplier name for managers), joined, bookings. An account page shows a label/value card (email, mobile, role, joined, saved travellers) and, for travellers, their latest bookings table and help tickets.
- **Pricing limits (admin → Settings):** a card between Commission and Cancellation templates with five number fields in a wrapping grid (highest multiplier, lowest/highest flight fare, lowest/highest room night), errors under each field, and **Save limits**. Managers see the same limits as one muted line under the Pricing page intro; the preview marks a capped multiplier "(Atlas's limit)" and a price held at a bound.
- **Demo (sandbox) banner:** a full-width Deep Ink strip above the header on every page while a demo is active — "**Demo environment.** Data resets automatically. Don't enter real personal details." — with **View as a traveller** / **Back to the console** (supplier demos; outline button) and **Back to traveller view** (primary). The footer lists the three **Try as …** entries as text buttons; each opens a dialog with the simulation notice, the airline radios or best-hotel list, and **Start demo**.
- **Overview (supplier):** a KPI strip (bookings, revenue, load/occupancy, offer redemptions) with change vs the previous 30 days, then "Today and tomorrow" departures/arrivals and recent notifications.

**Admin analytics dashboard (Phase 2)**
Look follows `docs/research/07-admin-dashboard-reference.webp`; its data categories don't apply.
- **Laptop:** the page title "Analytics" with the date range in words underneath; a **KPI strip** of five cards across the top (label in small caps, large number, change vs previous period in success/error colour with an arrow and "vs previous {n} days"); below it a two-column grid of charts on the left (~75%) and a **filters panel** on the right (~25%: Date range select, Product radio, Supplier select, and "Reset"). Tabs **Overview / Supply / Demand & offers** sit under the page title.
- **Overview tab:** bookings and gross value over time (line, flights vs hotels, previous period dashed); cancellation rate (traveller vs supplier) and refunds; payment success vs failure; average booking value.
- **Supply tab:** top routes, top cities, top suppliers (horizontal bars with values at the end); seat load factor; hotel occupancy proxy and ADR.
- **Demand & offers tab:** lead-time distribution and cancellation rate by lead-time band (vertical bars, coloured by band); conversion funnel (horizontal steps with counts and step conversion %); zero-result searches; offers (redemptions, discount by funder, share of bookings with an offer).
- **Below 1024px:** the filters collapse into a "Filters" button opening the filters dialog; KPI cards wrap 2 per row (1 on phones); charts stack full width.

**Dialogs**
Filters, cancel confirmation, console confirmations, the sandbox popup and delete confirmations open as bottom sheets on phones and centred 560px dialogs from tablet up.

## Implementation Notes (recorded per AGENTS.md)
1. **Accessible terracotta shades.** `#B86B4B` with ivory text is ~4.0:1, below the 4.5:1 this doc requires. The code keeps `--color-primary: #B86B4B` for accents, focus rings and large text, and adds:
   - `--color-primary-strong: #9C5436` — primary button fill (ivory text ≥ 4.5:1, verified with Lighthouse)
   - `--color-primary-hover: #874629` — button hover (~8% deeper, per States)
   - `--color-primary-ink: #8F4B2C` — terracotta text/links on ivory or white (≥ 5:1)
2. **Homepage (concept mockup applied).** Solid ivory nav with the logo and "Destinations" / "Stays" links on the left (Destinations scrolls to the featured grid; Stays scrolls to Best hotels). The mockup's "Experiences" and "About" were left out because they have no PRD feature. Full-bleed coastal hero with an ivory wash behind left-aligned text, a separate cropped photo for phones, the search card over the photo's lower edge, a 4-up destinations grid ("View all" reveals all 8 seeded cities), a 4-up Best hotels grid ("View all" reveals the top 10), and an image + italic quote strip. The mockup's "Typography" / "UI Elements" panels are a style guide, not page content.
3. **Fonts.** Canela is commercial, so the app uses DM Serif Display (the documented fallback, including its real italic for quotes) and Inter, self-hosted via `@fontsource` so there is no render-blocking third-party request.

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
1. **Tab placement:** Flights/Hotels switcher lives inside the hero search card (not a separate top-level nav tab) — matches the concept mockup most closely and mirrors MMT/Booking.com.
2. **Photo sourcing:** curated, downloaded, HD royalty-free stock photos committed to the repo (see `architecture.md` §Decisions & Defaults) — not hot-linked, not AI-generated.
3. **Dark mode:** out of scope for MVP; not covered by this design system.
