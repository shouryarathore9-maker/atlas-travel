// Saved travellers (prd.md → Saved travellers): up to 20 per account, no duplicate names.
import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../models/User.js';
import { normaliseName } from '../services/bookingService.js';
import { HttpError } from '../utils/httpError.js';
import { splitName } from '../utils/names.js';

export const MAX_SAVED_TRAVELLERS = 20;
export const travellerSchema = splitName.and(z.object({ ageCategory: z.enum(['adult', 'child', 'infant']) }));

function assertUnique(list, candidate, exceptId) {
  const key = normaliseName(candidate.firstName, candidate.lastName);
  if (list.some((t) => String(t._id) !== String(exceptId) && normaliseName(t.firstName, t.lastName) === key)) {
    throw new HttpError(409, 'You’ve already saved someone with that name. Add a middle name or suffix to tell them apart.', 'DUPLICATE_NAMES');
  }
}

export async function listTravellers(req, res) {
  res.json({ travellers: req.user.savedTravellers || [] });
}

export async function addTraveller(req, res) {
  const list = req.user.savedTravellers || [];
  if (list.length >= MAX_SAVED_TRAVELLERS) throw new HttpError(409, `You can save up to ${MAX_SAVED_TRAVELLERS} travellers.`, 'LIMIT');
  assertUnique(list, req.validated.body);
  const user = await User.findByIdAndUpdate(req.user._id, { $push: { savedTravellers: req.validated.body } }, { returnDocument: 'after' }).lean();
  res.status(201).json({ travellers: user.savedTravellers });
}

export async function updateTraveller(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Traveller not found', 'NOT_FOUND');
  const list = req.user.savedTravellers || [];
  if (!list.some((t) => String(t._id) === req.params.id)) throw new HttpError(404, 'Traveller not found', 'NOT_FOUND');
  assertUnique(list, req.validated.body, req.params.id);
  const user = await User.findOneAndUpdate(
    { _id: req.user._id, 'savedTravellers._id': req.params.id },
    { $set: { 'savedTravellers.$.firstName': req.validated.body.firstName, 'savedTravellers.$.lastName': req.validated.body.lastName, 'savedTravellers.$.ageCategory': req.validated.body.ageCategory } },
    { returnDocument: 'after' },
  ).lean();
  res.json({ travellers: user.savedTravellers });
}

export async function deleteTraveller(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Traveller not found', 'NOT_FOUND');
  const user = await User.findByIdAndUpdate(req.user._id, { $pull: { savedTravellers: { _id: req.params.id } } }, { returnDocument: 'after' }).lean();
  res.json({ travellers: user.savedTravellers });
}
