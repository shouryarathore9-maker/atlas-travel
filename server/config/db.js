import dns from 'node:dns';
import mongoose from 'mongoose';
import { attachDatabasePool } from '@vercel/functions';

// One connection per process, shared by every request that process serves.
// On Vercel a function instance handles many requests while warm, so we cache the
// *promise* in module scope: concurrent cold-start requests all await the same connect.
let connecting = null;

async function openConnection(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, maxIdleTimeMS: 10000 });
  } catch (err) {
    // Some home routers intermittently refuse the SRV lookups that mongodb+srv:// URIs need.
    // Retry once with public DNS resolvers (harmless on Vercel, where this doesn't happen).
    if (!/querySrv|ENOTFOUND|ECONNREFUSED/.test(err.message)) throw err;
    console.warn('MongoDB SRV lookup failed, retrying with public DNS resolvers…');
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, maxIdleTimeMS: 10000 });
  }
  // Lets Vercel close idle pool connections before suspending the instance (no-op locally).
  attachDatabasePool(mongoose.connection.getClient());
  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);
}

export function connectDb(uri = process.env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!uri) return Promise.reject(new Error('MONGODB_URI is not set.'));
  if (!connecting) {
    connecting = openConnection(uri).catch((err) => {
      connecting = null; // let the next request try again instead of caching the failure
      throw err;
    });
  }
  return connecting;
}

// Express middleware: every API request waits for the (cached) connection first.
export async function ensureDb(req, res, next) {
  await connectDb();
  next();
}
