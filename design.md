# Atlas — Design System & UX Rules (design.md)

*Built from `prd.md`. Governs visual and interaction design for every screen. `prd.md` says what each page contains and how it behaves; this file says how it looks and where things sit (see Page-Level Layouts).*

## Brand Direction
**Positioning:** Atlas is the calm, editorial opposite of MakeMyTrip-style OTAs. Where MMT stacks upsells and flashing offers on every screen, Atlas shows one clear thing at a time and trusts the user. Think high-end travel magazine, not discount marketplace.

**Mood/Vibe:** Luxurious, sophisticated, warm, aspirational.
**Reference feel:** Aman + Monocle + Mediterranean boutique hotel.

**Homepage look:** Reuse the existing concept mockup (`docs/research/06-atlas-homepage-concept-mockup.webp`) as the literal visual target — same full-bleed coastal/Mediterranean hero photograph, same headline treatment, same soft-ivory panel style. Keep it "as similar as possible" to that concept; the only structural addition is the **Flights / Hotels tab switcher**, which sits inside the hero search card (decided default — see Decisions & Defaults), Flights active by default. Copy/buttons are rewritten to match real Atlas functionality instead of placeholder concept text.

## Design Boundaries
- No dense multi-offer banners, no flashing badges, no more than one primary CTA visible per screen.
- Any optional extra (e.g. a future coupon field) must be introduced as its own clean step, never bolted onto an already-busy screen — this is the explicit anti-MMT rule from `prd.md`.
- Photography and color carry the "luxury travel" feeling; avoid leaning on saturated marketing colors or busy iconography to do that job instead.

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
- **Modals:** Used for filters (below laptop width), the cancel-booking confirmation and admin delete confirmations. White surface, 12px radius, soft shadow, ivory backdrop overlay. Fare options and the seat map sit inline on the flight page, not in modals.
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
| Phone | ~375–767px | Single-column results; destinations, best hotels and similar stays in 2-column grids; filters move into a bottom-sheet modal; search fields stack vertically; portrait hero photo above the headline; price summary becomes a bottom bar. |
| Tablet | ~768–1023px | 4-column destinations and best-hotels grids; search fields in three columns; filters open in a centred dialog; price summary still a bottom bar. |
| Laptop | ~1024px+ | Full layout as in the concept mockup: sidebar filters + result list side by side, two-column detail pages with a sticky price summary; from ~1280px the search fields fit on one row. |

Since most OTA traffic is mobile, design and test the phone layout first for every new screen, not as an afterthought.

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
Logo at the far left, followed by the Destinations and Stays links (hidden on phones); account links (My trips, Admin, greeting, Sign out — or Sign in with a person icon) at the far right. Solid ivory bar with a sand bottom border.

**Footer (all pages)**
Logo with the "all simulated" line on the left, © year on the right.

**Home**
- Full-bleed hero photo. On tablet and laptop the headline, eyebrow and subtext sit on the left over an ivory wash, with the photo showing on the right. On phones the portrait photo sits at the top and fades into ivory, with the text below it.
- The search card (Flights/Hotels tabs, Flights active) overlaps the hero's lower edge. On laptop (≥1280px) the search fields form a single row with the Search button at the end; on tablet they wrap into three columns; on phones they stack.
- **Featured destinations:** section heading on the left, "View all" on the right of the heading. A 4-column grid (2 columns on phones) of photo tiles with the city name and a one-line caption beneath.
- **Best hotels:** heading and subtitle on the left, "View all" on the right. A 4-column grid of hotel cards (2 columns on phones).
- **Quote strip:** photo on the left (about two-thirds width) and the italic quote card on the right; stacked on phones.
- **Promises:** three items in a row (stacked on phones), each with a small line icon.

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
- Fare cards sit side by side. The seat map scrolls inside its own box, with the column letters pinned at the top.

**Detail (Hotel)**
- "← All stays in {city}" link, then the photo grid. On tablet and laptop, one large photo on the left (two-thirds) and two stacked on the right. On phones, one wide photo with two below it.
- Header (stars, name, address, rating, stay summary), then a main column (description → Amenities → Choose your room → Ratings & reviews) with the "Your stay" summary and Reserve in the right-hand column. The phone bottom bar works as on flights.
- **Room cards:** room details on the left; price, rooms selector and "Select" in a right-hand column separated by a divider (stacked on phones).
- **Similar stays** spans the full width after the two-column area: 4 cards per row on laptop, 2 on phones.
- **Photo viewer:** dark full-screen overlay, photo centred, close (X) top right, arrows at the left and right edges (moved to the bottom corners on phones), counter centred at the bottom.

**Checkout**
- Step label and heading at the top. The forms (step 1) or the traveller summary and payment card (step 2) fill the main column, and the booking summary box sits in the right-hand column with the title in large serif.
- On phones and tablets the summary collapses to a bottom bar showing the total.
- **Payment card:** UPI/QR and Card tabs at the top of the card. In the UPI tab the QR code is on the left and the "Scan with any UPI app…" text and both buttons are on the right (stacked on phones). In the Card tab fields are in two columns, with card number and name on card spanning the full width.
- Error banners sit above the summary card, with their action button on the right.

**Confirmation**
Centred success icon, heading, email line and booking reference; the trip summary card below; "View my bookings" (primary) and "Back to home" centred underneath.

**My trips**
A narrow centred column. "Upcoming" and "Past & cancelled" headings, each followed by booking cards: details on the left, status badge, amount and refund on the right, with "View details" / "Cancel booking" text actions along the bottom. The cancel confirmation opens as a dialog.

**Sign in / Sign up**
A single centred card with the form and a link to the other page.

**Admin**
- "Inventory" heading with "Add flight/hotel" on the right, Flights/Hotels tabs, then a search row, a table (scrolls sideways on phones) with Edit/Delete at the end of each row, and centred pagination.
- Forms use a narrow centred column of cards, with repeating rows for fares, meals and room types.

**Dialogs**
Filters, cancel confirmation and delete confirmation open as bottom sheets on phones and centred 560px dialogs from tablet up.

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
