import { afterEach, describe, expect, it } from 'vitest';
import { cookieOptions } from '../middleware/auth.js';
import { MongoRateLimitStore } from '../middleware/mongoRateLimitStore.js';

describe('MongoDB rate-limit store', () => {
  it('counts hits across store instances (like separate function instances) and restarts after the window', async () => {
    const a = new MongoRateLimitStore({ prefix: 'auth:' });
    const b = new MongoRateLimitStore({ prefix: 'auth:' });
    a.init({ windowMs: 60_000 });
    b.init({ windowMs: 60_000 });
    expect((await a.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await b.increment('1.2.3.4')).totalHits).toBe(2); // shared, not per-instance
    expect((await a.increment('5.6.7.8')).totalHits).toBe(1); // separate key

    const short = new MongoRateLimitStore({ prefix: 'auth:' });
    short.init({ windowMs: 1 });
    await short.increment('9.9.9.9');
    await new Promise((r) => setTimeout(r, 10));
    expect((await short.increment('9.9.9.9')).totalHits).toBe(1); // window ended → restart

    await a.decrement('1.2.3.4');
    expect((await a.get('1.2.3.4')).totalHits).toBe(1);
    await a.resetKey('1.2.3.4');
    expect(await a.get('1.2.3.4')).toBeUndefined();
  });
});

describe('auth cookie', () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it('is Secure + SameSite=Lax on Vercel, and not Secure for local http', () => {
    expect(cookieOptions()).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax' });
    process.env.VERCEL = '1';
    expect(cookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
  });
});

// The daily cron job's tests moved to phase2-foundations.test.js (it replaced extend-flights).
