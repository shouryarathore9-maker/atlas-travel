// Local equivalent of the daily Vercel Cron job: `npm run daily`.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { runDailyJob } from '../services/dailyJob.js';

try {
  await connectDb(process.env.MONGODB_URI);
  console.log(JSON.stringify(await runDailyJob(), null, 2));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
