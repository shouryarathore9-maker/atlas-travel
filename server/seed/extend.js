// Local equivalent of the daily Vercel Cron job: `npm run extend-flights`.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { extendFlightWindow } from '../services/flightWindow.js';

try {
  await connectDb(process.env.MONGODB_URI);
  console.log(await extendFlightWindow());
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
