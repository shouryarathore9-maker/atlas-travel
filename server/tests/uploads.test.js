import request from 'supertest';
import { describe, expect, it } from 'vitest';
import Hotel from '../models/Hotel.js';
import Photo from '../models/Photo.js';
import { sweepUnusedPhotos } from '../controllers/photoController.js';
import { app, supplierWithManager } from './helpers.js';

// A tiny but structurally valid JPEG/PNG header is enough: the server checks magic bytes, not pixels.
const jpeg = (bytes = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes, 7)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]);
const upload = (agent, body, type = 'image/jpeg') => agent.post('/api/supplier/hotel/photos').set('Content-Type', type).send(body);

describe('hotel photo uploads', () => {
  it('accepts real JPEG/PNG images, serves them publicly with safe headers, and lists them', async () => {
    const { agent } = await supplierWithManager('hotel');
    const res = await upload(agent, jpeg()).expect(201);
    expect(res.body.photo.url).toMatch(/^\/api\/photos\/[a-f0-9]{24}$/);
    await upload(agent, png(), 'image/png').expect(201);

    const served = await request(app).get(res.body.photo.url).expect(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(served.body.length).toBe(2004);
    expect((await agent.get('/api/supplier/hotel/photos').expect(200)).body.photos).toHaveLength(2);
  });

  it('rejects other types, disguised files, oversized files and a fifth upload', async () => {
    const { agent } = await supplierWithManager('hotel');
    await upload(agent, Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml').expect(415);
    await upload(agent, Buffer.from('<html><script>alert(1)</script></html>  '), 'image/jpeg').expect(415); // claims JPEG, isn't
    await upload(agent, png(), 'image/jpeg').expect(415); // type mismatch
    expect((await upload(agent, jpeg(360 * 1024)).expect(413)).body.error.code).toBe('TOO_LARGE');
    for (let i = 0; i < 4; i++) await upload(agent, jpeg()).expect(201);
    expect((await upload(agent, jpeg()).expect(409)).body.error.code).toBe('UPLOAD_LIMIT');
  });

  it('travellers and airline managers can’t upload; managers can’t use or delete another hotel’s uploads', async () => {
    const { agent: airline } = await supplierWithManager('airline');
    await upload(airline, jpeg()).expect(404);
    const { agent: a } = await supplierWithManager('hotel');
    const { agent: b } = await supplierWithManager('hotel');
    const { body } = await upload(a, jpeg()).expect(201);
    await b.delete(`/api/supplier/hotel/photos/${body.photo._id}`).expect(404);
    const hotelB = (await b.get('/api/supplier/hotel')).body.hotel;
    const put = await b
      .put('/api/supplier/hotel')
      .send({
        description: 'A calm hotel with a garden and a quiet pool.',
        amenities: [],
        photos: [body.photo.url],
        salesStopped: false,
        roomTypes: hotelB.roomTypes.map((r) => ({ ...r, originalName: r.name, baseRate: 6000 })),
      })
      .expect(400);
    expect(put.body.error.message).toMatch(/isn’t one of your uploads/);
  });

  it('an upload in use can’t be deleted; unused uploads are swept after a day', async () => {
    const { supplier, agent } = await supplierWithManager('hotel');
    const used = (await upload(agent, jpeg()).expect(201)).body.photo;
    const unused = (await upload(agent, jpeg()).expect(201)).body.photo;
    await Hotel.updateOne({ _id: supplier.hotelId }, { $set: { photos: [used.url] } });
    expect((await agent.delete(`/api/supplier/hotel/photos/${used._id}`).expect(409)).body.error.code).toBe('IN_USE');

    expect(await sweepUnusedPhotos()).toBe(0); // too new
    expect(await sweepUnusedPhotos({ now: Date.now() + 25 * 3600 * 1000 })).toBe(1);
    expect(await Photo.exists({ _id: unused._id })).toBeNull();
    expect(await Photo.exists({ _id: used._id })).not.toBeNull();
  });
});
