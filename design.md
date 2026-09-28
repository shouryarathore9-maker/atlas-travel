# Atlas — Design System & UX Rules (design.md)

*Built from `prd.md`. Governs visual and interaction design for every screen.*

## Brand Direction
**Positioning:** Atlas is the calm, editorial opposite of MakeMyTrip-style OTAs. Where MMT stacks upsells and flashing offers on every screen, Atlas shows one clear thing at a time and trusts the user. Think high-end travel magazine, not discount marketplace.

**Mood/Vibe:** Luxurious, sophisticated, warm, aspirational.
**Reference feel:** Aman + Monocle + Mediterranean boutique hotel.

**Homepage look:** Reuse the existing concept mockup as the literal visual target — same full-bleed coastal/Mediterranean hero photograph, same headline treatment, same soft-ivory panel style. Keep it "as similar as possible" to that concept; the only structural addition is the **Flights / Hotels tab switcher**, which sits inside the hero search card (decided default — see Decisions & Defaults), Flights active by default. Copy/buttons are rewritten to match real Atlas functionality instead of placeholder concept text.

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
- **Modals:** Used for fare comparison, seat map, filters (on mobile). White surface, 12px radius, soft shadow, ivory backdrop overlay.

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
| Phone | ~375–480px | Single column; filters move into a bottom-sheet modal; tabs and search bar stack vertically; hero image cropped taller/narrower, headline shrinks to 2 lines max. |
| Tablet | ~768–1024px | 2-column result/destination grids; filters can sit as a collapsible top bar or side drawer. |
| Laptop | ~1280px+ | Full layout as in the concept mockup: sidebar filters + result list side by side, 4-column featured destinations grid. |

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
- Imagery: full-bleed, high-resolution (HD) photography for the hero and destination highlights — same coastal/Mediterranean-style image family as the concept mockup. Images are downloaded from a royalty-free stock library (e.g. Unsplash) and committed into the repo rather than hot-linked (decided default — see Decisions & Defaults), so they stay HD and available without an external dependency.
- Hotel/flight result thumbnails: consistent aspect ratio (e.g. 4:3), real-feeling stock photography rather than generic icons.

## Motion & Transitions
Kept minimal and functional, not decorative:
- 150–200ms ease for hover/focus/tab-switch transitions.
- Skeleton-to-content fade (200ms) when results load.
- No parallax, no auto-playing carousels — consistent with the "calm, editorial" positioning.

## Loading States
- Skeleton cards for result lists and detail pages (sand blocks in the shape of the final content).
- Spinner + short status text ("Confirming your seat…", "Processing payment…") for actions with backend round-trips.

## Form Patterns & Validation
- Inline validation on blur, not on every keystroke.
- Error text sits directly under the field, in `--color-error`, with a short actionable message ("Enter a valid email address," not "Invalid input").
- Required fields marked clearly; avoid over-using asterisks — prefer labeling optional fields as "(optional)" instead (mirrors the reference sites' pattern for GST/special requests).

## Microcopy & Tone of Voice
- Editorial, warm, plain — short sentences, no exclamation-heavy marketing copy, no manufactured urgency ("Only 2 left!" style scarcity is explicitly avoided).
- Confirmation and empty states get a touch of the "high-end travel magazine" voice (e.g. "Your trip is booked." rather than "SUCCESS!!").

## Page-Level Layouts (Key Screens)

**Home**
Nav (logo, Sign in, wishlist icon later) → full-bleed hero photo with headline + subtext → Flights/Hotels tab switcher + search bar inside the hero card (Flights active by default) → featured destinations grid → editorial quote/trust block → footer.

**Results**
Sticky search summary bar at top → left sidebar filters (collapses to a modal/bottom-sheet on phone) → result cards in a vertical list, each with key facts, rating, and price → sort control above the list.

**Detail (Flight)**
Route + timing header → fare-option cards → seat map → meal selection → baggage/cancellation info → ratings & reviews section → sticky price summary + CTA.

**Detail (Hotel)**
Photo gallery → name, star rating, review score/count → amenities → room-type table → ratings & reviews section → sticky "Reserve" CTA.

**Checkout**
Passenger/guest details form → fare/room summary → mock payment (UPI/QR tab + Card tab) → Pay CTA.

**Confirmation**
Large success state, booking reference, trip summary, "View my bookings" and "Back to home" actions.

## Implementation Notes (recorded per AGENTS.md)
1. **Accessible terracotta shades.** `#B86B4B` with ivory text is ~4.0:1, below the 4.5:1 this doc requires. The code keeps `--color-primary: #B86B4B` for accents, focus rings and large text, and adds:
   - `--color-primary-strong: #9C5436` — primary button fill (ivory text ≥ 4.5:1, verified with Lighthouse)
   - `--color-primary-hover: #874629` — button hover (~8% deeper, per States)
   - `--color-primary-ink: #8F4B2C` — terracotta text/links on ivory or white (≥ 5:1)
2. **Homepage (concept mockup applied).** Solid ivory nav with the logo and "Destinations" / "Stays" links on the left (Destinations scrolls to the featured grid; Stays opens the Hotels tab). The mockup's "Experiences" and "About" were left out because they have no PRD feature. Full-bleed coastal hero with an ivory wash behind left-aligned text, a separate cropped photo for phones, the search card over the photo's lower edge, a 4-up destinations grid ("View all" reveals all 8 seeded cities), and an image + italic quote strip. The mockup's "Typography" / "UI Elements" panels are a style guide, not page content.
3. **Fonts.** Canela is commercial, so the app uses DM Serif Display (the documented fallback, including its real italic for quotes) and Inter, self-hosted via `@fontsource` so there is no render-blocking third-party request.

## Decisions & Defaults (previously open questions — resolved so the agent can build without stopping)
1. **Tab placement:** Flights/Hotels switcher lives inside the hero search card (not a separate top-level nav tab) — matches the concept mockup most closely and mirrors MMT/Booking.com.
2. **Photo sourcing:** curated, downloaded, HD royalty-free stock photos committed to the repo (see `architecture.md` §Decisions & Defaults) — not hot-linked, not AI-generated.
3. **Dark mode:** out of scope for MVP; not covered by this design system.
