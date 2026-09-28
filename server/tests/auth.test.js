import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, loggedInAgent, PASSWORD } from './helpers.js';

const newUser = { name: 'Priya', email: 'priya@example.com', password: 'Travel2026' };

describe('auth', () => {
  it('registers a user, sets an httpOnly cookie and never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(newUser).expect(201);
    expect(res.body.user.email).toBe('priya@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/atlas_token=.*HttpOnly/);
  });

  it('rejects a duplicate email with a clear message', async () => {
    await request(app).post('/api/auth/register').send(newUser).expect(201);
    const res = await request(app).post('/api/auth/register').send(newUser).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...newUser, password: 'short' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses one generic message for unknown email and wrong password', async () => {
    await request(app).post('/api/auth/register').send(newUser);
    const wrongPass = await request(app).post('/api/auth/login').send({ email: newUser.email, password: 'Wrong1234' }).expect(401);
    const noUser = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD }).expect(401);
    expect(wrongPass.body.error.message).toBe('Invalid email or password.');
    expect(noUser.body.error.message).toBe(wrongPass.body.error.message);
  });

  it('returns the current user for a session and 401 after logout', async () => {
    const agent = await loggedInAgent();
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects /me without a cookie', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
