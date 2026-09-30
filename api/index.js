// Vercel Function entry: every /api/* request is routed here (see vercel.json).
// The Express app is exported, not started — Vercel invokes it per request, and the
// Mongoose connection is created lazily and reused while this instance stays warm.
import { createApp } from '../server/app.js';

export default createApp();
