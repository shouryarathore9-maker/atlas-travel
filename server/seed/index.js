// Idempotent seed: wipes inventory, reviews, bookings and payments, then re-creates them.
// Demo accounts are upserted (created or reset), never duplicated.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import { generateFlights, generateHotels, generateReviews } from './generate.js';

// Demo accounts. Passwords come only from server/.env (never committed): the same Atlas
// database backs the public site, so a password written in this file would be public.
const DEMO_USERS = [
  {
    name: 'Atlas Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@atlas.test',
    password: process.env.SEED_ADMIN_PASSWORD,
    role: 'admin',
  },
  {
    name: 'Priya Traveller',
    email: process.env.SEED_TRAVELLER_EMAIL || 'priya@atlas.test',
    password: process.env.SEED_TRAVELLER_PASSWORD,
    role: 'traveler',
    phone: '9876543210',
  },
];
const missing = ['SEED_ADMIN_PASSWORD', 'SEED_TRAVELLER_PASSWORD'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Set ${missing.join(' and ')} in server/.env before seeding (see .env.example).`);
  process.exit(1);
}

const SEED_DAYS = Number(process.env.SEED_DAYS) || 21;

async function insertInChunks(Model, docs, size = 500) {
  for (let i = 0; i < docs.length; i += size) {
    await Model.insertMany(docs.slice(i, i + size), { ordered: false });
  }
}

async function main() {
  await connectDb(process.env.MONGODB_URI);
  console.time('seed');

  const flights = generateFlights({ days: SEED_DAYS });
  const hotels = generateHotels();
  const reviews = generateReviews(flights, hotels);

  await Promise.all([Flight.deleteMany({}), Hotel.deleteMany({}), Review.deleteMany({}), Booking.deleteMany({}), Payment.deleteMany({})]);
  await Promise.all([Flight.syncIndexes(), Hotel.syncIndexes(), Review.syncIndexes(), Booking.syncIndexes(), User.syncIndexes()]);

  await insertInChunks(Flight, flights);
  await insertInChunks(Hotel, hotels);
  await insertInChunks(Review, reviews, 1000);

  for (const { password, ...user } of DEMO_USERS) {
    await User.updateOne(
      { email: user.email },
      { $set: { ...user, passwordHash: await bcrypt.hash(password, 10) } },
      { upsert: true },
    );
  }

  console.log(`Seeded ${flights.length} flights (${SEED_DAYS} days), ${hotels.length} hotels, ${reviews.length} reviews.`);
  console.log(`Demo accounts: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(', ')} — passwords are the SEED_* values in server/.env`);
  console.timeEnd('seed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
