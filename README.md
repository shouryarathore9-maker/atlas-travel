# Atlas

A calm, editorial flight + hotel booking app for India, built on MERN as a learning project.
Everything — inventory, reviews and payments — is seeded or simulated. No third-party APIs.

- Product: [prd.md](prd.md) · System design: [architecture.md](architecture.md) · UI: [design.md](design.md) · How to work: [AGENTS.md](AGENTS.md)

## Stack
React 19 + Vite + React Router · Node + Express 5 · MongoDB (Mongoose) · JWT in an httpOnly cookie · Vitest, React Testing Library, Supertest

## Getting started

Requirements: Node.js 20+ and a MongoDB connection string (MongoDB Atlas free tier works).

```bash
npm run install:all
```

1. Copy `server/.env.example` to `server/.env` and fill in `MONGODB_URI` (include a database name, e.g. `/travel_app`) and a long random `JWT_SECRET`.
2. Seed the database (idempotent — safe to re-run; it resets inventory, reviews and bookings):

```bash
npm run seed
```

3. Start the API (port 5000) and web app (port 5173) together:

```bash
npm run dev
```

Open http://localhost:5173.

**Demo accounts** (local only) are created by the seed — one admin and one traveller. Their emails and passwords are in `server/seed/index.js`; override them with `SEED_*` env vars before seeding a public deployment.

> Seeded flights cover the next 21 days from when you ran the seed. If searches start coming back empty, run `npm run seed` again.

## Scripts (root)

| Command | What it does |
|---|---|
| `npm run dev` | API (nodemon) + client (Vite) together |
| `npm run seed` | Rebuild mock flights, hotels, reviews and demo users |
| `npm test` | Server (Supertest on in-memory MongoDB) + client (Vitest/RTL) tests |
| `npm run lint` | ESLint for server and client |
| `npm run build` | Production build of the client |

## Trying the mock payment
- **UPI / QR:** "Simulate payment" succeeds; "Simulate a failed payment" shows the retry path.
- **Card:** any 16-digit number with a future expiry works. A number ending in `0002` simulates a decline. Card details never leave the browser.
- Server-side, `MOCK_PAYMENT_FAILURE_RATE` (0–1) adds random failures.

## Project layout
```
client/   React SPA — src/{pages,components,hooks,api,lib,styles}
server/   Express API — models, routes, controllers, services, middleware, seed, tests
```

## Deployment (planned)
Client → Vercel (`VITE_API_BASE_URL` = API origin). API → Render/Railway with `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (the Vercel URL) and `NODE_ENV=production`. Because the client and API are on different domains, set `COOKIE_SAMESITE=none` so the auth cookie is sent (it is `Secure` in production).

Image credits: [client/public/images/seed/CREDITS.md](client/public/images/seed/CREDITS.md)
