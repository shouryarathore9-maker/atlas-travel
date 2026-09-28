# Atlas — Agent Rules (AGENTS.md)

*Operating rules for any AI agent (or human) writing code on this project. `prd.md`, `architecture.md`, and `design.md` are the source of truth for product, system design, and UI decisions respectively — this file governs *how* to work, not *what* to build.*

> **Filename note:** this file is named `AGENTS.md` (uppercase, plural) at the repo root deliberately — it's the convention most agentic coding tools (Claude Code, Cursor, Codex, etc.) auto-discover without extra configuration.

## Project Context
Atlas is a MERN-stack travel booking web app (flights + hotels), built as a personal learning project and eventually deployed publicly. It is inspired by MakeMyTrip/Yatra/Ixigo/Agoda/Booking.com but deliberately avoids their upsell-heavy, cluttered UX. There are no third-party APIs: all flight/hotel inventory and all payments are mocked and seeded. A senior engineer reviews generated code and docs for correctness only — they will not answer open-ended product questions, so anything genuinely ambiguous should be flagged as an assumption or open question rather than silently guessed at mid-code. Note that `prd.md`, `architecture.md`, and `design.md` have already had their open questions resolved into defaults — treat those as decided unless told otherwise.

## Stack Summary
MongoDB, Express, React (Vite), Node.js. Frontend deploys to Vercel; backend + MongoDB Atlas deploy to Render/Railway. Full details: `architecture.md`. Product scope and priorities: `prd.md`. Visual/UX rules: `design.md`.

## General Rules
- Treat `prd.md` → `architecture.md`/`design.md` → this file as the priority order when something seems to conflict. If a code request contradicts one of them, flag it rather than silently overriding the doc.
- Plan before coding: for anything bigger than a trivial fix, write a short plan (files touched, approach) before generating code.
- Make small, reviewable changes. Prefer several small commits/PRs over one giant one.
- Ask when unclear. If a requirement is ambiguous or missing *and no default is already recorded in the docs*, state the assumption you're making and proceed, or ask — don't invent product behavior that isn't in `prd.md`.
- Every new screen or endpoint should map back to a feature and acceptance criterion listed in `prd.md`. If it doesn't, flag it before building.

## What Not To Do
- Do not integrate any real third-party API (flights, hotels, maps, payments) — everything stays mocked/seeded per `architecture.md`.
- Do not implement real payment processing of any kind, even "just to test" — the mock payment flow in `architecture.md` is final for this project's scope.
- Do not add upsell/cross-sell features called out as out-of-scope in `prd.md` (insurance, cab/car cross-sell, price-drop protection, GST billing) without an explicit go-ahead.
- Do not commit secrets, `.env` files, or API keys.
- Do not silently change data models defined in `architecture.md` — if a change is needed, update `architecture.md` in the same change set and note it as a deviation.

## Security Rules
- Hash all passwords with bcrypt; never store or log plaintext passwords.
- Validate and sanitize all incoming request data (e.g. with `zod` or `express-validator`) before it touches the database.
- Protect all `/api/admin/*` routes with both auth and role-based (`role === 'admin'`) middleware.
- Rate-limit authentication endpoints (`/api/auth/*`).
- Store all secrets (`JWT_SECRET`, `MONGODB_URI`, etc.) in environment variables, loaded via `.env` locally and via the hosting platform's secret manager in production. `.env` must be in `.gitignore` from the first commit.
- No real payment data of any kind is ever collected, stored, or transmitted — treat all payment fields as pure UI simulation, not real sanitized payment input.

## Coding Conventions
- **Naming:** camelCase for variables/functions, PascalCase for React components and Mongoose models, kebab-case for file names except component files (`FlightCard.jsx`, `flightRoutes.js`).
- **File organization:** follow the folder structure in `architecture.md` (`/client/src/{pages,components,hooks,api}`, `/server/{models,routes,controllers,middleware,seed}`).
- **Error handling:** every API route wraps logic in try/catch (or an async error-handling middleware) and returns a consistent JSON error shape (`{ error: { message, code } }`); the frontend never shows a raw stack trace to the user — always a friendly empty/error state per `design.md`.
- Keep components small and focused; extract shared UI (cards, buttons, form fields) into `/components` rather than duplicating markup.

## Commands
- `npm install` — install dependencies (run in both `/client` and `/server`)
- `npm run dev` — start dev server (client via Vite, server via `nodemon`)
- `npm run build` — production build (client)
- `npm run lint` — run ESLint across the project
- `npm test` — run the test suite (Vitest — see Testing Expectations)
- `npm run seed` — populate MongoDB with mock flights, hotels, and reviews (idempotent, safe to re-run)

*(Exact script names should match whatever is defined in each `package.json`; keep this list in sync as scripts are added.)*

## Testing Expectations & Definition of Done
Test stack (decided default): **Vitest** as the single test runner for both frontend and backend, **React Testing Library** for component tests, **Supertest** for backend HTTP/API tests.

A feature is **done** only when all of the following are objectively true — not just "it looks right":

1. **Functional correctness:** every acceptance criterion listed for the relevant user story in `prd.md` passes, verified manually or via an automated test.
2. **No console errors:** zero uncaught errors, warnings, or unhandled promise rejections in the browser console during a full walkthrough of the feature.
3. **Lint clean:** `npm run lint` passes with zero errors on changed files.
4. **Automated coverage:** any new API endpoint has at least one passing Vitest+Supertest test covering its success path and its main failure path (e.g. invalid input, unauthorized access).
5. **Performance:** Lighthouse Performance and Accessibility scores stay ≥ 90 on any page that was touched (checked manually via Chrome DevTools or the Lighthouse CLI — not wired into CI for MVP).
6. **Responsive check:** the feature is manually verified at three widths — ~375px, ~768px, ~1280px — with no overlapping/clipped content.
7. **Security basics:** any new form validates input server-side (not just client-side); any new route that should be protected actually rejects unauthenticated/unauthorized requests (verified with a manual or automated request, e.g. via curl/Postman/Supertest).
8. **No scope creep:** the change doesn't introduce anything from the "What Not To Do" or `prd.md`'s "Out of Scope" list.

A PR/change that can't demonstrate all eight points with something concrete (a test run, a Lighthouse score, a screenshot at each breakpoint) is not done yet — "it works on my machine" is not a benchmark.

## Git / Commit Conventions
Use **Conventional Commits**:
```
feat: add seat selection to flight checkout
fix: correct hotel filter count after clearing filters
docs: update architecture.md with payment endpoint
refactor: extract FlightCard from Results page
test: add coverage for booking cancellation endpoint
chore: bump dependencies
```
- One logical change per commit where practical.
- Branch naming: `feat/`, `fix/`, `chore/` prefixes matching the commit type.

## Environment Variables & Secrets
- Local development: `.env` files in `/client` (Vite requires the `VITE_` prefix, e.g. `VITE_API_BASE_URL`) and `/server` (`MONGODB_URI`, `JWT_SECRET`, `PORT`, etc.).
- Never commit `.env`; a `.env.example` with placeholder values should be committed instead so the shape of required variables is documented.
- Production secrets are set directly in the Vercel and Render/Railway dashboards, not in code or committed files.

## Workflow Rules
- Plan before coding.
- Make small changes; avoid bundling unrelated fixes into one change.
- Ask when unclear rather than guessing at product behavior not covered in `prd.md` and not already resolved as a default in these docs.
- No real APIs, no real payments — for now or ever, unless `prd.md`/`architecture.md` are explicitly updated to say otherwise.
