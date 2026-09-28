import dns from 'node:dns';
import mongoose from 'mongoose';

// Some home routers intermittently refuse the SRV lookups that mongodb+srv:// URIs need.
// If that happens, retry once using public DNS resolvers.
export async function connectDb(uri) {
  if (!uri) throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    if (!/querySrv|ENOTFOUND|ECONNREFUSED/.test(err.message)) throw err;
    console.warn('MongoDB SRV lookup failed, retrying with public DNS resolvers…');
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  }
  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);
}
