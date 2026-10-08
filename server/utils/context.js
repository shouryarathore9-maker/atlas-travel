import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request context, readable from anywhere in that request's async call chain
// (controllers, services, and the Mongoose sandbox plugin).
//
//   { sandboxId: null }        a normal request — sees and writes only real data
//   { sandboxId: <ObjectId> }  a sandbox request — sees and writes only that sandbox's data
//   undefined                  no request (seed scripts, tests, the daily job) — no automatic scoping
const storage = new AsyncLocalStorage();

// Awaits inside the scope: Mongoose queries are lazy, and one returned unawaited would otherwise
// execute after the scope has ended.
export function runWithContext(context, fn) {
  return storage.run(context, async () => await fn());
}

export function currentContext() {
  return storage.getStore();
}

// Express middleware: every API request starts in the real (non-sandbox) context.
// The sandbox session middleware replaces it for /api/sandbox/* requests.
export function requestContext(req, res, next) {
  runWithContext({ sandboxId: null }, next);
}
