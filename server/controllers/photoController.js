import { inSandbox } from '../services/sandbox.js';
import mongoose from 'mongoose';
import Hotel from '../models/Hotel.js';
import Photo, { MAX_PHOTO_BYTES, MAX_UPLOADS_PER_HOTEL, PHOTO_TYPES, photoUrl } from '../models/Photo.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../utils/httpError.js';

// The file must really be the image type it claims to be (checked from its first bytes),
// so nothing else — HTML, SVG, scripts — can be smuggled in and served from our domain.
export function sniffImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function listUploads(req, res) {
  const photos = await Photo.find({ supplierId: req.supplierId }, { data: 0 }).sort({ createdAt: 1 }).lean();
  res.json({
    photos: photos.map((p) => ({ _id: p._id, url: photoUrl(p._id), size: p.size, createdAt: p.createdAt })),
    limits: { maxCount: MAX_UPLOADS_PER_HOTEL, maxBytes: MAX_PHOTO_BYTES, types: PHOTO_TYPES },
  });
}

export async function uploadPhoto(req, res) {
  if (inSandbox()) throw new HttpError(403, 'Photo uploads aren’t available in the demo — pick from the Atlas gallery instead.', 'NOT_IN_DEMO');
  const declared = (req.get('content-type') || '').split(';')[0].trim();
  if (!PHOTO_TYPES.includes(declared) || !Buffer.isBuffer(req.body)) {
    throw new HttpError(415, 'Upload a JPEG, PNG or WebP image.', 'UNSUPPORTED_TYPE');
  }
  const buffer = req.body;
  if (!buffer.length) throw new HttpError(400, 'That file is empty.', 'EMPTY_FILE');
  if (buffer.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photos can be at most 350 KB.', 'TOO_LARGE');
  const actual = sniffImageType(buffer);
  if (!actual || actual !== declared) {
    throw new HttpError(415, 'That file isn’t a valid JPEG, PNG or WebP image.', 'UNSUPPORTED_TYPE');
  }
  if ((await Photo.countDocuments({ supplierId: req.supplierId })) >= MAX_UPLOADS_PER_HOTEL) {
    throw new HttpError(409, `You can keep up to ${MAX_UPLOADS_PER_HOTEL} uploaded photos. Delete one you don’t use first.`, 'UPLOAD_LIMIT');
  }
  const photo = await Photo.create({
    supplierId: req.supplierId,
    hotelId: req.supplier.hotelId,
    contentType: actual,
    size: buffer.length,
    data: buffer,
    uploadedBy: req.user._id,
  });
  await audit(req, { action: 'photo.upload', target: { type: 'photo', id: photo._id, label: `${Math.round(buffer.length / 1024)} KB ${actual}` } });
  res.status(201).json({ photo: { _id: photo._id, url: photoUrl(photo._id), size: photo.size } });
}

export async function deleteUpload(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Photo not found', 'NOT_FOUND');
  const photo = await Photo.findOne({ _id: req.params.id, supplierId: req.supplierId }, { data: 0 });
  if (!photo) throw new HttpError(404, 'Photo not found', 'NOT_FOUND');
  if (await Hotel.exists({ _id: req.supplier.hotelId, photos: photoUrl(photo._id) })) {
    throw new HttpError(409, 'This photo is on your hotel page. Remove it from your photos and save first.', 'IN_USE');
  }
  await photo.deleteOne();
  await audit(req, { action: 'photo.delete', target: { type: 'photo', id: photo._id, label: 'uploaded photo' } });
  res.json({ ok: true });
}

// Public and cacheable: the URL contains the id, and a photo never changes once uploaded.
export async function servePhoto(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const photo = await Photo.findById(req.params.id, { data: 1, contentType: 1 }).lean();
  if (!photo) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  res.set({
    'Content-Type': photo.contentType,
    'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.send(Buffer.from(photo.data.buffer ?? photo.data));
}

// Daily job: uploads that still aren't on the hotel page a day after upload are deleted.
export async function sweepUnusedPhotos({ now = Date.now() } = {}) {
  const old = await Photo.find({ createdAt: { $lt: new Date(now - 24 * 3600 * 1000) } }, { _id: 1, hotelId: 1 }).lean();
  if (!old.length) return 0;
  const hotels = await Hotel.find({ _id: { $in: [...new Set(old.map((p) => String(p.hotelId)))] } }, { photos: 1 }).lean();
  const used = new Set(hotels.flatMap((h) => h.photos || []));
  const unused = old.filter((p) => !used.has(photoUrl(p._id))).map((p) => p._id);
  if (unused.length) await Photo.deleteMany({ _id: { $in: unused } });
  return unused.length;
}
