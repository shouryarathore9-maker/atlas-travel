# Atlas

A calm, editorial flight + hotel booking app for India, built on MERN as a learning project.
Everything — inventory, reviews and payments — is seeded or simulated. No third-party APIs.

- Product: [prd.md](prd.md) · System design: [architecture.md](architecture.md) · UI: [design.md](design.md) · How to work: [AGENTS.md](AGENTS.md)

## Stack
React 19 + Vite + React Router · Node + Express 5 · MongoDB (Mongoose) · JWT in an httpOnly cookie · Vitest, React Testing Library, Supertest · Hosted on Vercel with MongoDB Atlas

## Getting started

Requirements: Node.js 20+ and a MongoDB connection string (MongoDB Atlas free tier works).

```bash
npm run install:all
```

1. Copy `server/.env.example` to `server/.env` and fill in `MONGODB_URI` (include a database name, e.g. `/travel_app`), a long random `JWT_SECRET` and a long random `CRON_SECRET`.
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

> Seeded flights cover the next 21 days. On the live site a daily Vercel Cron job keeps that window full; locally, run `npm run extend-flights` to do the same.

## Scripts (root)

| Command | What it does |
|---|---|
| `npm run dev` | API (nodemon) + client (Vite) together |
| `npm run seed` | Rebuild mock flights, hotels, reviews and demo users |
| `npm run extend-flights` | Fill any missing days in the 21-day flight window and prune old unbooked flights |
| `npm test` | Server (Supertest on in-memory MongoDB) + client (Vitest/RTL) tests |
| `npm run lint` | ESLint for server and client |
| `npm run build` | Production build of the client |

## Trying the mock payment
- **UPI / QR:** "Simulate payment" succeeds; "Simulate a failed payment" shows the retry path.
- **Card:** any 16-digit number with a future expiry works. A number ending in `0002` simulates a decline. Card details never leave the browser.
- Server-side, `MOCK_PAYMENT_FAILURE_RATE` (0–1) adds random failures.

## Project layout
```
api/      Vercel Function entry (exports the Express app)
client/   React SPA — src/{pages,components,hooks,api,lib,styles}
server/   Express API — models, routes, controllers, services, middleware, seed, tests
vercel.json  build, routing, daily cron, function region
```

## Deployment (Vercel + MongoDB Atlas)
The repository deploys as **one Vercel project**: the Vite build is served from the Vercel CDN and every `/api/*` request runs the Express app as a Vercel Function, all on one domain. Pushing to `main` on GitHub deploys automatically.

1. Import the GitHub repository in Vercel (leave **Root Directory** as the repo root — `vercel.json` sets the build).
2. Add these **Environment Variables** (Production and Preview): `MONGODB_URI`, `JWT_SECRET`, `CRON_SECRET`.
3. In MongoDB Atlas → **Network Access**, allow `0.0.0.0/0` (Vercel functions have no fixed IP; the database user's password and TLS protect access).
4. Seed the Atlas database once from your machine: `npm run seed`.

The daily cron job (`/api/cron/extend-flights`) is registered automatically from `vercel.json`.

Image credits: [client/public/images/seed/CREDITS.md](client/public/images/seed/CREDITS.md)
