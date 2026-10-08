@AGENTS.md

Source-of-truth docs: `prd.md` (what), `architecture.md` (system design), `design.md` (UI), `AGENTS.md` (how to work).

## Local quirks
- Windows + PowerShell: use `npm.cmd` / `npx.cmd` if the execution policy blocks `npm.ps1`.
- `mongodb+srv://` lookups can fail on some home routers; `server/config/db.js` retries with public DNS.
- Seeded flights cover the next `SEED_DAYS` (default 60) days. In production a daily Vercel Cron job keeps the window full; locally run `npm run daily` if searches start coming back empty.
- `server/.env` sets `MONGODB_DB=travel_app_phase2` while Phase 2 is built, so local seeding never touches the live `travel_app` database. Remove that line only when deliberately working on live data.
- Manager logins are in the git-ignored `server/manager-credentials.local.md`; never print or commit them.
