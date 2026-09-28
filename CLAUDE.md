@AGENTS.md

Source-of-truth docs: `prd.md` (what), `architecture.md` (system design), `design.md` (UI), `AGENTS.md` (how to work).

## Local quirks
- Windows + PowerShell: use `npm.cmd` / `npx.cmd` if the execution policy blocks `npm.ps1`.
- `mongodb+srv://` lookups can fail on some home routers; `server/config/db.js` retries with public DNS.
- Seeded flights cover the next `SEED_DAYS` (default 21) days from when `npm run seed` was run — re-seed if searches start coming back empty.
